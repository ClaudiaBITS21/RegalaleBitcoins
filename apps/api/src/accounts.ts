import { createHash, randomBytes } from 'node:crypto';
import type { Lang } from '@regalale/core';
import type { Sql } from './db.ts';
import { grantWelcome } from './credits.ts';

// Cuentas de quien regala. Los tokens (sesión, link por mail) se guardan solo como hash:
// una copia de la base no alcanza para entrar.

export interface Account {
  readonly id: string;
  readonly email: string;
  readonly lang: Lang;
  /** Si la sesión se abrió con passkey (y no con un link por mail). */
  readonly viaPasskey?: boolean;
  /** La passkey con la que se abrió la sesión (si fue con passkey). */
  readonly credentialId?: string | null;
}

export interface Credential {
  readonly id: string;
  readonly accountId: string;
  readonly publicKey: Buffer;
  readonly alg: number;
  readonly signCount: number;
  readonly vault: string | null;
}

const hash = (token: string): Buffer => createHash('sha256').update(token).digest();
export const newToken = (): string => randomBytes(32).toString('base64url');

export const SESSION_DAYS = 30;
const CHALLENGE_MINUTES = 5;

/** Mail normalizado: sin espacios y en minúsculas. null si no parece un mail. */
export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  if (email.length < 3 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

export async function createChallenge(sql: Sql, kind: 'registro' | 'ingreso'): Promise<string> {
  const challenge = newToken();
  await sql`delete from desafios where expira < now()`;
  await sql`insert into desafios (desafio, tipo, expira) values (${challenge}, ${kind}, now() + make_interval(mins => ${CHALLENGE_MINUTES}))`;
  return challenge;
}

/** Consume el desafío (una sola vez). false si no existe, venció o es de otro tipo. */
export async function consumeChallenge(sql: Sql, challenge: string, kind: 'registro' | 'ingreso'): Promise<boolean> {
  const rows = await sql`delete from desafios where desafio = ${challenge} and tipo = ${kind} and expira > now() returning desafio`;
  return rows.length === 1;
}

export async function findAccountByEmail(sql: Sql, email: string): Promise<Account | null> {
  const [r] = await sql<{ id: string; email: string; idioma: Lang }[]>`select id, email, idioma from usuarios where email = ${email}`;
  return r === undefined ? null : { id: r.id, email: r.email, lang: r.idioma };
}

export async function createAccount(
  sql: Sql,
  a: { email: string; lang: Lang; credential: Omit<Credential, 'accountId'> | null },
): Promise<Account> {
  return sql.begin(async (tx) => {
    const [u] = await tx<{ id: string }[]>`insert into usuarios (email, idioma) values (${a.email}, ${a.lang}) returning id`;
    const id = (u as { id: string }).id;
    const c = a.credential;
    // Sin credencial: cuenta con solo el mail (quien regala con el código de 12 palabras).
    if (c !== null) {
      await tx`
        insert into credenciales (id, usuario_id, clave_publica, alg, contador, boveda)
        values (${c.id}, ${id}, ${c.publicKey}, ${c.alg}, ${c.signCount}, ${c.vault})`;
    }
    await grantWelcome(tx, id);
    return { id, email: a.email, lang: a.lang };
  });
}

export async function findCredential(sql: Sql, id: string): Promise<Credential | null> {
  const [r] = await sql<{ id: string; usuario_id: string; clave_publica: Buffer; alg: number; contador: string; boveda: string | null }[]>`
    select id, usuario_id, clave_publica, alg, contador, boveda from credenciales where id = ${id}`;
  return r === undefined
    ? null
    : { id: r.id, accountId: r.usuario_id, publicKey: r.clave_publica, alg: r.alg, signCount: Number(r.contador), vault: r.boveda };
}

export async function touchCredential(sql: Sql, id: string, signCount: number): Promise<void> {
  await sql`update credenciales set contador = ${signCount}, usada = now() where id = ${id}`;
}

export async function accountCredentials(sql: Sql, accountId: string): Promise<Array<{ id: string; prf: boolean }>> {
  const rows = await sql<{ id: string; prf: boolean }[]>`select id, boveda is not null as prf from credenciales where usuario_id = ${accountId} order by creada`;
  return rows.map((r) => ({ id: r.id, prf: r.prf }));
}

export async function createSession(sql: Sql, accountId: string, method: 'passkey' | 'link' | 'mail', credentialId: string | null = null): Promise<string> {
  const token = newToken();
  await sql`delete from sesiones where expira < now()`;
  await sql`insert into sesiones (token_hash, usuario_id, expira, metodo, credencial) values (${hash(token)}, ${accountId}, now() + make_interval(days => ${SESSION_DAYS}), ${method}, ${credentialId})`;
  return token;
}

export async function sessionAccount(sql: Sql, token: string | undefined): Promise<Account | null> {
  if (token === undefined || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const [r] = await sql<{ id: string; email: string; idioma: Lang; metodo: 'passkey' | 'link' | 'mail'; credencial: string | null }[]>`
    select u.id, u.email, u.idioma, s.metodo, s.credencial from sesiones s join usuarios u on u.id = s.usuario_id
    where s.token_hash = ${hash(token)} and s.expira > now()`;
  return r === undefined ? null : { id: r.id, email: r.email, lang: r.idioma, viaPasskey: r.metodo === 'passkey', credentialId: r.credencial };
}

export async function deleteSession(sql: Sql, token: string | undefined): Promise<void> {
  if (token !== undefined) await sql`delete from sesiones where token_hash = ${hash(token)}`;
}

/** Link de un solo uso para entrar desde el mail. */
export async function createMailLink(sql: Sql, accountId: string, minutes: number): Promise<string> {
  const token = newToken();
  await sql`delete from enlaces where expira < now() - interval '1 day'`;
  await sql`insert into enlaces (token_hash, usuario_id, expira) values (${hash(token)}, ${accountId}, now() + make_interval(mins => ${minutes}))`;
  return token;
}

export async function redeemMailLink(sql: Sql, token: string): Promise<Account | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const [r] = await sql<{ usuario_id: string }[]>`
    update enlaces set usado = now() where token_hash = ${hash(token)} and usado is null and expira > now() returning usuario_id`;
  if (r === undefined) return null;
  const [u] = await sql<{ id: string; email: string; idioma: Lang }[]>`
    update usuarios set verificado = coalesce(verificado, now()) where id = ${r.usuario_id} returning id, email, idioma`;
  return u === undefined ? null : { id: u.id, email: u.email, lang: u.idioma };
}

export interface AccountGift {
  readonly id: string;
  readonly address: string;
  readonly index: number | null;
  readonly lang: Lang;
  readonly occasion: string;
  readonly occasionFree: string | null;
  readonly to: string;
  readonly satsExpected: string | null;
  readonly claimTxid: string | null;
  readonly claimKind: string | null;
  readonly createdAt: Date;
  /** Estilo de la tarjeta (para la miniatura del panel). */
  readonly style: string;
  /** Cuándo se abrió (reclamó o recuperó); null si todavía no. */
  readonly claimedAt: Date | null;
  /** Lo que se puso al armarlo: moneda, monto y la cotización del dólar ese día. */
  readonly currency: string | null;
  readonly amount: number | null;
  readonly usdPerBtc: number | null;
}

export async function accountGifts(sql: Sql, accountId: string, limit = 200): Promise<AccountGift[]> {
  const rows = await sql<
    { id: string; direccion: string; indice: number | null; idioma: Lang; ocasion: string; ocasion_libre: string | null; para: string; sats_esperados: string | null; reclamo_txid: string | null; reclamo_tipo: string | null; creado: Date; estilo: string; reclamado: Date | null; moneda: string | null; monto: string | null; usd_por_btc: string | null }[]
  >`select id, direccion, indice, idioma, ocasion, ocasion_libre, para, sats_esperados, reclamo_txid, reclamo_tipo, creado, estilo, reclamado, moneda, monto, usd_por_btc
    from regalos where usuario_id = ${accountId} order by creado desc limit ${limit}`;
  return rows.map((r) => ({
    id: r.id,
    address: r.direccion,
    index: r.indice,
    lang: r.idioma,
    occasion: r.ocasion,
    occasionFree: r.ocasion_libre,
    to: r.para,
    satsExpected: r.sats_esperados,
    claimTxid: r.reclamo_txid,
    claimKind: r.reclamo_tipo,
    createdAt: r.creado,
    style: r.estilo,
    claimedAt: r.reclamado,
    currency: r.moneda,
    amount: r.monto === null ? null : Number(r.monto),
    usdPerBtc: r.usd_por_btc === null ? null : Number(r.usd_por_btc),
  }));
}

export async function nextGiftIndex(sql: Sql, accountId: string): Promise<number> {
  const [r] = await sql<{ n: number | null }[]>`select max(indice) as n from regalos where usuario_id = ${accountId}`;
  return r?.n === null || r?.n === undefined ? 0 : r.n + 1;
}
