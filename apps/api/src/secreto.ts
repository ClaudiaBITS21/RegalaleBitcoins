import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import type { Sql } from './db.ts';

// Mails cifrados en la base (Claudia, 08/11/2026). Una copia o filtración de la base no deja leer
// los mails de las cuentas ni de los cupones para un mail.
// - Se guardan sellados con AES-256-GCM («m1.» + base64 de iv | texto cifrado | etiqueta).
// - Para buscarlos («¿hay una cuenta con este mail?») va al lado una huella HMAC-SHA256.
// - Las dos claves se generan una vez y se guardan en la tabla `claves` envueltas por una clave de
//   Cloud KMS que nunca sale de Google: al arrancar, el servidor le pide a KMS que las desenvuelva
//   y las tiene solo en memoria. Quien tenga la base sin acceso a KMS no puede leer nada.
// Fuera de mainnet, sin KMS, se usa una clave fija de desarrollo (no protege nada: es para probar).

const PREFIX = 'm1.';
let encKey: Buffer | null = null;
let macKey: Buffer | null = null;

/** Clave fija de desarrollo y pruebas. Nunca en mainnet (lo controla main.ts). */
export function useDevKeys(): void {
  const k = createHmac('sha256', 'regalale-dev').update('claves de prueba').digest();
  encKey = createHmac('sha256', k).update('cifrar').digest();
  macKey = createHmac('sha256', k).update('huella').digest();
}

const keys = (): { enc: Buffer; mac: Buffer } => {
  if (encKey === null || macKey === null) useDevKeys();
  return { enc: encKey as Buffer, mac: macKey as Buffer };
};

export const isSealed = (v: string): boolean => v.startsWith(PREFIX);

/** El mail sellado para guardar. */
export function seal(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', keys().enc, iv);
  const body = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return PREFIX + Buffer.concat([iv, body, c.getAuthTag()]).toString('base64');
}

/** El mail en claro. Un valor viejo, todavía sin sellar, se devuelve igual. */
export function open(stored: string): string {
  if (!isSealed(stored)) return stored;
  const raw = Buffer.from(stored.slice(PREFIX.length), 'base64');
  const d = createDecipheriv('aes-256-gcm', keys().enc, raw.subarray(0, 12));
  d.setAuthTag(raw.subarray(raw.length - 16));
  return Buffer.concat([d.update(raw.subarray(12, raw.length - 16)), d.final()]).toString('utf8');
}

/** Huella para buscar un mail (ya normalizado: sin espacios y en minúsculas). */
export const mailHash = (email: string): Buffer => createHmac('sha256', keys().mac).update(email).digest();

// ── Cloud KMS, por su API REST con el token de la cuenta del servicio (sin dependencias nuevas) ──

type Fetch = typeof fetch;

async function token(f: Fetch): Promise<string> {
  const r = await f('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token', { headers: { 'Metadata-Flavor': 'Google' } });
  if (!r.ok) throw new Error(`token de la cuenta del servicio: ${r.status}`);
  return ((await r.json()) as { access_token: string }).access_token;
}

async function kms(f: Fetch, key: string, op: 'encrypt' | 'decrypt', body: Record<string, string>): Promise<Record<string, string>> {
  const r = await f(`https://cloudkms.googleapis.com/v1/${key}:${op}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${await token(f)}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`KMS ${op}: ${r.status} ${(await r.text()).slice(0, 200)}`);
  return (await r.json()) as Record<string, string>;
}

/**
 * Carga las claves de los mails desde la base, desenvueltas por KMS. La primera vez las genera y
 * las guarda envueltas. `kmsKey`: projects/…/locations/…/keyRings/…/cryptoKeys/….
 */
export async function loadKeys(sql: Sql, kmsKey: string, f: Fetch = fetch): Promise<void> {
  let [row] = await sql<{ envuelta: string }[]>`select envuelta from claves where nombre = 'mails'`;
  if (row === undefined) {
    const fresh = randomBytes(64);
    const { ciphertext } = await kms(f, kmsKey, 'encrypt', { plaintext: fresh.toString('base64') });
    await sql`insert into claves (nombre, envuelta) values ('mails', ${ciphertext as string}) on conflict (nombre) do nothing`;
    [row] = await sql<{ envuelta: string }[]>`select envuelta from claves where nombre = 'mails'`;
  }
  const { plaintext } = await kms(f, kmsKey, 'decrypt', { ciphertext: (row as { envuelta: string }).envuelta });
  const both = Buffer.from(plaintext as string, 'base64');
  if (both.length !== 64) throw new Error('KMS: la clave de los mails no tiene el largo esperado');
  encKey = both.subarray(0, 32);
  macKey = both.subarray(32);
}

/**
 * Sella los mails que todavía estén en claro (los de antes de esto). Se corre al arrancar: es
 * idempotente y deja de hacer algo una vez sellados todos.
 */
export async function sealExisting(sql: Sql): Promise<number> {
  let n = 0;
  for (const u of await sql<{ id: string; email: string }[]>`select id, email from usuarios where email not like 'm1.%'`) {
    await sql`update usuarios set email = ${seal(u.email)}, email_huella = ${mailHash(u.email)} where id = ${u.id} and email = ${u.email}`;
    n++;
  }
  for (const k of await sql<{ codigo: string; email: string }[]>`select codigo, email from cupones where email is not null and email not like 'm1.%'`) {
    await sql`update cupones set email = ${seal(k.email)}, email_huella = ${mailHash(k.email)} where codigo = ${k.codigo} and email = ${k.email}`;
    n++;
  }
  return n;
}
