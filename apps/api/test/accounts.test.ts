import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { after, before, beforeEach, describe, it } from 'node:test';
import { deriveGift, getNetwork, masterRootFromMnemonic } from '@regalale/core';
import type { Mail } from '../src/mail.ts';
import { createApp } from '../src/app.ts';
import type { AddressStats, ChainClient, FeeRates, MempoolPayment, PriceClient, Utxo } from '../src/chain.ts';
import { connect, migrate, type Sql } from '../src/db.ts';

const DB = process.env.DATABASE_URL_TEST ?? 'postgres://regalale:regalale@127.0.0.1:5432/regalale_test';
const ORIGIN = 'https://regalale.test';
const signet = getNetwork('signet');
const MASTER = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const VAULT = `v1.${'A'.repeat(16)}.${'B'.repeat(64)}`;

const funded = new Set<string>();
const chain: ChainClient = {
  async addressStats(address: string): Promise<AddressStats> {
    const v = funded.has(address) ? 30_000n : 0n;
    return { confirmedFunded: v, confirmedSpent: 0n, mempoolFunded: 0n, mempoolSpent: 0n, txCount: v > 0n ? 1 : 0 };
  },
  async addressUtxos(): Promise<Utxo[]> {
    return [];
  },
  async mempoolPayments(): Promise<MempoolPayment[]> {
    return [];
  },
  async txHex(): Promise<string> {
    throw new Error('no');
  },
  async broadcast(): Promise<string> {
    throw new Error('no');
  },
  async fees(): Promise<FeeRates> {
    return { fastest: 5, halfHour: 3, hour: 2, economy: 1, minimum: 1 };
  },
};
const price: PriceClient = { btcUsd: async () => 100_000 };

/** Una passkey de mentira, con la misma forma que la que arma un navegador. */
class FakePasskey {
  readonly id = randomBytes(16);
  private readonly keys = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  counter = 0;
  private readonly origin: string;
  constructor(origin = ORIGIN) {
    this.origin = origin;
  }
  private rpIdHash(): Buffer {
    return createHash('sha256').update(new URL(this.origin).hostname).digest();
  }
  private clientData(type: string, challenge: string): Buffer {
    return Buffer.from(JSON.stringify({ type, challenge, origin: this.origin }));
  }
  register(challenge: string) {
    const len = Buffer.alloc(2);
    len.writeUInt16BE(this.id.length);
    const auth = Buffer.concat([this.rpIdHash(), Buffer.from([0x45]), Buffer.alloc(4), Buffer.alloc(16), len, this.id, Buffer.from([0xa5])]);
    return {
      id: this.id.toString('base64url'),
      clientDataJSON: this.clientData('webauthn.create', challenge).toString('base64url'),
      authenticatorData: auth.toString('base64url'),
      publicKey: this.keys.publicKey.export({ format: 'der', type: 'spki' }).toString('base64url'),
      alg: -7,
    };
  }
  assert(challenge: string, flags = 0x05) {
    const count = Buffer.alloc(4);
    count.writeUInt32BE(this.counter);
    const auth = Buffer.concat([this.rpIdHash(), Buffer.from([flags]), count]);
    const client = this.clientData('webauthn.get', challenge);
    const signature = sign('sha256', Buffer.concat([auth, createHash('sha256').update(client).digest()]), this.keys.privateKey);
    return {
      id: this.id.toString('base64url'),
      clientDataJSON: client.toString('base64url'),
      authenticatorData: auth.toString('base64url'),
      signature: signature.toString('base64url'),
    };
  }
}

let sql: Sql;
let app: ReturnType<typeof createApp>;
let mails: Mail[];

const req = (path: string, body?: unknown, cookie?: string, origin = ORIGIN) =>
  app.request(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', origin, ...(cookie ? { cookie } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const challenge = async (tipo: 'registro' | 'ingreso') => ((await (await req('/api/cuenta/desafio', { tipo })).json()) as { desafio: string }).desafio;
const cookieOf = (res: Response) => (res.headers.get('set-cookie') ?? '').split(';')[0] as string;

async function signUp(email: string, pk = new FakePasskey()) {
  const res = await req('/api/cuenta/registro', { email, idioma: 'es', boveda: VAULT, credencial: pk.register(await challenge('registro')) });
  return { res, pk, cookie: cookieOf(res) };
}

describe('Cuentas con passkey', () => {
  before(async () => {
    sql = connect(DB);
    await migrate(sql);
  });
  after(async () => {
    await sql.end();
  });
  beforeEach(async () => {
    await sql`delete from regalos`;
    await sql`delete from listas`;
    await sql`delete from usuarios`;
    funded.clear();
    mails = [];
    app = createApp({
      sql,
      chain,
      price,
      network: signet,
      accounts: { origins: [ORIGIN], publicUrl: ORIGIN, mailer: { send: async (m) => void mails.push(m) }, cookieSecure: true },
      adminEmails: ['admin@example.com'],
    });
  });

  it('registro: crea la cuenta, guarda la bóveda cifrada y abre una sesión segura', async () => {
    const { res, cookie } = await signUp('Ana@Example.com ');
    assert.equal(res.status, 201);
    const set = res.headers.get('set-cookie') ?? '';
    assert.match(set, /^__session=[A-Za-z0-9_-]{43};/);
    for (const flag of ['HttpOnly', 'Secure', 'SameSite=Strict']) assert.ok(set.includes(flag), flag);
    const me = (await (await req('/api/cuenta', undefined, cookie)).json()) as { email: string; credenciales: Array<{ prf: boolean }>; proximoIndice: number };
    assert.equal(me.email, 'ana@example.com');
    assert.deepEqual(me.credenciales.map((c) => c.prf), [true]);
    assert.equal(me.proximoIndice, 0);
    // En la base, el token de sesión está solo como hash.
    const token = cookie.split('=')[1] as string;
    const raw = await sql`select 1 from sesiones where token_hash = ${Buffer.from(token)}`;
    assert.equal(raw.length, 0);
  });

  it('el mismo mail no se registra dos veces', async () => {
    await signUp('ana@example.com');
    assert.equal((await signUp('ANA@example.com')).res.status, 409);
  });

  it('passkey huérfana: el mail se revisa antes de crear la passkey, y una passkey desconocida tiene su propio código', async () => {
    await signUp('ana@example.com');
    const pre = await req('/api/cuenta/desafio', { tipo: 'registro', email: 'ANA@example.com' });
    assert.equal(pre.status, 409);
    assert.equal(((await pre.json()) as { error: string }).error, 'cuenta_existente');
    assert.equal((await req('/api/cuenta/desafio', { tipo: 'registro', email: 'beto@example.com' })).status, 200);
    const orphan = new FakePasskey();
    const res = await req('/api/cuenta/ingreso', { credencial: orphan.assert(await challenge('ingreso')) });
    assert.equal(res.status, 401);
    assert.equal(((await res.json()) as { error: string }).error, 'passkey_desconocida');
    assert.equal((await req('/api/cuenta/diagnostico', { paso: 'ingreso', error: 'NotAllowedError' })).status, 204);
    assert.equal((await req('/api/cuenta/diagnostico', { paso: 'ingreso', error: 'ana@example.com' })).status, 400);
  });

  it('ingreso con passkey: firma verificada, devuelve la bóveda; el desafío sirve una sola vez', async () => {
    const { pk } = await signUp('ana@example.com');
    pk.counter = 1;
    const ch = await challenge('ingreso');
    const ok = await req('/api/cuenta/ingreso', { credencial: pk.assert(ch) });
    assert.equal(ok.status, 200);
    assert.deepEqual(await ok.json(), { email: 'ana@example.com', credencial: pk.id.toString('base64url'), boveda: VAULT });
    pk.counter = 2;
    assert.equal((await req('/api/cuenta/ingreso', { credencial: pk.assert(ch) })).status, 401); // desafío ya usado
  });

  it('rechaza firmas falsas, otra passkey, otro sitio, sin verificación de la persona y contador que no avanza', async () => {
    const { pk } = await signUp('ana@example.com');
    const otra = new FakePasskey();
    const forged = { ...otra.assert(await challenge('ingreso')), id: pk.id.toString('base64url') };
    assert.equal((await req('/api/cuenta/ingreso', { credencial: forged })).status, 401);
    const phishing = new FakePasskey('https://regalale-bitcoins.evil');
    assert.equal((await req('/api/cuenta/ingreso', { credencial: phishing.assert(await challenge('ingreso')) })).status, 401);
    assert.equal((await req('/api/cuenta/ingreso', { credencial: pk.assert(await challenge('ingreso'), 0x01) })).status, 401); // sin UV
    pk.counter = 5;
    assert.equal((await req('/api/cuenta/ingreso', { credencial: pk.assert(await challenge('ingreso')) })).status, 200);
    pk.counter = 3;
    assert.equal((await req('/api/cuenta/ingreso', { credencial: pk.assert(await challenge('ingreso')) })).status, 401);
    // Un desafío de registro no sirve para ingresar.
    pk.counter = 6;
    assert.equal((await req('/api/cuenta/ingreso', { credencial: pk.assert(await challenge('registro')) })).status, 401);
  });

  it('registro desde otro origen o con passkey de otro sitio: rechazado', async () => {
    const res = await req('/api/cuenta/registro', { email: 'x@y.com', credencial: {} }, undefined, 'https://evil.example');
    assert.equal(res.status, 403);
    const evil = new FakePasskey('https://evil.example');
    const r2 = await req('/api/cuenta/registro', { email: 'x@y.com', credencial: evil.register(await challenge('registro')) });
    assert.equal(r2.status, 422);
  });

  it('link por mail: responde igual exista o no la cuenta, sirve una vez y abre sesión', async () => {
    await signUp('ana@example.com');
    assert.equal((await req('/api/cuenta/link', { email: 'nadie@example.com' })).status, 202);
    assert.equal(mails.length, 0);
    assert.equal((await req('/api/cuenta/link', { email: 'ana@example.com' })).status, 202);
    assert.equal(mails.length, 1);
    const token = /#acceso=([A-Za-z0-9_-]{43})/.exec(mails[0]?.text ?? '')?.[1] as string;
    assert.ok(mails[0]?.text.includes(`${ORIGIN}/panel#acceso=`));
    const ok = await req('/api/cuenta/link/canje', { token });
    assert.equal(ok.status, 200);
    assert.equal((await req('/api/cuenta', undefined, cookieOf(ok))).status, 200);
    assert.equal((await req('/api/cuenta/link/canje', { token })).status, 401);
  });

  it('sin sesión no hay panel; salir cierra la sesión', async () => {
    assert.equal((await req('/api/cuenta')).status, 401);
    const { cookie } = await signUp('ana@example.com');
    await req('/api/cuenta/salir', {}, cookie);
    assert.equal((await req('/api/cuenta', undefined, cookie)).status, 401);
  });

  it('los regalos creados con sesión quedan en la cuenta con su índice, y llega el aviso de "listo"', async () => {
    const { cookie } = await signUp('ana@example.com');
    const root = masterRootFromMnemonic(MASTER);
    const g = deriveGift(root, 0, 'es', signet);
    const created = await req(
      '/api/gifts',
      { direccion: g.address, idioma: 'es', ocasion: 'cumple', para: 'Tomi', mensaje: '', imagen: 1, moneda: 'SAT', monto: 30000, sats: '30000', indice: 0 },
      cookie,
    );
    assert.equal(created.status, 201);
    const me = (await (await req('/api/cuenta', undefined, cookie)).json()) as { proximoIndice: number; regalos: Array<{ indice: number; para: string; estado: string }> };
    assert.equal(me.proximoIndice, 1);
    assert.deepEqual(me.regalos.map((r) => [r.indice, r.para, r.estado]), [[0, 'Tomi', 'esperando']]);

    const token = 't'.repeat(40);
    const tasks = createApp({ sql, chain, price, network: signet, tasksToken: token, accounts: { origins: [ORIGIN], publicUrl: ORIGIN, mailer: { send: async (m) => void mails.push(m) }, cookieSecure: true } });
    const run = async () => (await (await tasks.request('/api/tareas/difusiones', { method: 'POST', headers: { 'x-tarea-token': token } })).json()) as { avisos: number };
    assert.equal((await run()).avisos, 0);
    funded.add(g.address);
    assert.equal((await run()).avisos, 1);
    assert.equal((await run()).avisos, 0); // una sola vez
    assert.equal(mails.at(-1)?.subject, 'Tu regalo para Tomi ya está listo');
    assert.ok(!mails.at(-1)?.text.includes('/r/'), 'el mail nunca lleva el link del regalo');
  });

  it('panel de admin: solo para los mails autorizados, y solo números agregados', async () => {
    assert.equal((await req('/api/admin/resumen')).status, 401);
    const ana = await signUp('ana@example.com');
    assert.equal((await req('/api/admin/resumen', undefined, ana.cookie)).status, 404);
    const root = masterRootFromMnemonic(MASTER);
    const g = deriveGift(root, 0, 'es', signet);
    await req('/api/gifts', { direccion: g.address, idioma: 'es', ocasion: 'cumple', para: 'Tomi', mensaje: 'secreto', imagen: 1, moneda: 'SAT', monto: 30000, sats: '30000', indice: 0 }, ana.cookie);
    const admin = await signUp('Admin@Example.com');
    const res = await req('/api/admin/resumen', undefined, admin.cookie);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { usuarios: { total: number; conRegalos: number }; regalos: { total: number; porEstado: Record<string, number> }; porOcasion: Record<string, number>; sats: { esperados: string } };
    assert.equal(body.usuarios.total, 2);
    assert.equal(body.usuarios.conRegalos, 1);
    assert.equal(body.regalos.total, 1);
    assert.deepEqual(body.regalos.porEstado, { esperando: 1 });
    assert.deepEqual(body.porOcasion, { cumple: 1 });
    assert.equal(body.sats.esperados, '30000');
    const extra = body as unknown as {
      motivos: Array<{ ocasion: string; creados: number; abiertos: number }>;
      porEstilo: Record<string, number>;
      tarjeta: { conMensaje: number };
      regalosPorCuenta: Record<string, number>;
      ocasionesLibres: Record<string, number>;
      montosUsd: { rangos: Record<string, number> };
    };
    assert.deepEqual(extra.motivos.map((m) => [m.ocasion, m.creados, m.abiertos]), [['cumple', 1, 0]]);
    assert.deepEqual(extra.porEstilo, { ilustracion: 1 });
    assert.equal(extra.tarjeta.conMensaje, 1);
    assert.deepEqual(extra.regalosPorCuenta, { '1': 1 });
    assert.equal(Object.values(extra.montosUsd.rangos).reduce((a, b) => a + b, 0), 1);
    // Una ocasión libre escrita por menos de 3 personas no aparece (podría identificar a alguien).
    const g2 = deriveGift(root, 1, 'es', signet);
    await req('/api/gifts', { direccion: g2.address, idioma: 'es', ocasion: 'otra', ocasionLibre: 'Cumple de Tomi', para: 'Tomi', mensaje: '', imagen: 1, moneda: 'SAT', monto: 30000, sats: '30000', indice: 1 }, ana.cookie);
    const fresh = (await (await req('/api/admin/resumen?fresco=1', undefined, admin.cookie)).json()) as { ocasionesLibres: Record<string, number> };
    assert.deepEqual(fresh.ocasionesLibres, {});
    const text = JSON.stringify(body) + JSON.stringify(fresh);
    for (const leak of ['ana@example.com', 'Tomi', 'secreto', g.address]) assert.ok(!text.includes(leak), `no expone ${leak}`);
  });
});
