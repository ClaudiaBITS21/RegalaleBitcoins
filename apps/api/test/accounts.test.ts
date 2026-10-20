import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { after, before, beforeEach, describe, it } from 'node:test';
import { accountKeyText, deriveBip84Key, deriveGift, deriveListAddress, getNetwork, masterRootFromMnemonic, parsePaymentKey } from '@regalale/core';
import type { Mail } from '../src/mail.ts';
import { createApp } from '../src/app.ts';
import type { AddressStats, ChainClient, FeeRates, MempoolPayment, PriceClient, Utxo } from '../src/chain.ts';
import { setChargingActive } from '../src/credits.ts';
import { setPaymentKey } from '../src/payments.ts';
import { connect, migrate, type Sql } from '../src/db.ts';

const DB = process.env.DATABASE_URL_TEST ?? 'postgres://regalale:regalale@127.0.0.1:5432/regalale_test';
const ORIGIN = 'https://regalale.test';
const signet = getNetwork('signet');
const MASTER = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const VAULT = `v1.${'A'.repeat(16)}.${'B'.repeat(64)}`;

const funded = new Set<string>();
const spent = new Set<string>();
/** Pagos a direcciones de cobro: lo confirmado y lo que está en la mempool. */
const pays = new Map<string, { confirmed: bigint; mempool: MempoolPayment[] }>();
const chain: ChainClient = {
  async addressStats(address: string): Promise<AddressStats> {
    const p = pays.get(address);
    if (p !== undefined) {
      const m = p.mempool.reduce((a, x) => a + x.value, 0n);
      return { confirmedFunded: p.confirmed, confirmedSpent: 0n, mempoolFunded: m, mempoolSpent: 0n, txCount: p.mempool.length + (p.confirmed > 0n ? 1 : 0) };
    }
    const v = funded.has(address) ? 30_000n : 0n;
    return { confirmedFunded: v, confirmedSpent: spent.has(address) ? v : 0n, mempoolFunded: 0n, mempoolSpent: 0n, txCount: v > 0n ? 1 : 0 };
  },
  async addressUtxos(): Promise<Utxo[]> {
    return [];
  },
  async mempoolPayments(address: string): Promise<MempoolPayment[]> {
    return pays.get(address)?.mempool ?? [];
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
let usdPerBtc = 100_000;
const price: PriceClient = { btcUsd: async () => usdPerBtc };

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
  // El mail de confirmación del alta queda aparte, para que cada prueba cuente solo los suyos.
  const sent = mails;
  mails = [];
  return { res, pk, cookie: cookieOf(res), sent };
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
    await sql`delete from arrepentimientos`;
    await sql`delete from pagos`;
    await sql`delete from usuarios`;
    await sql`delete from ajustes`;
    funded.clear();
    spent.clear();
    pays.clear();
    usdPerBtc = 100_000;
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
    const { res, cookie, sent } = await signUp('Ana@Example.com ');
    assert.equal(res.status, 201);
    // Con passkey se regala enseguida; el mail se confirma después, con un link que llega al alta.
    assert.deepEqual(sent.map((m) => m.to), ['ana@example.com']);
    assert.match(sent[0]?.text ?? '', /\/panel#acceso=[A-Za-z0-9_-]{43}/);
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

  it('el menú pregunta si hay sesión sin errores ni datos de la cuenta', async () => {
    const sin = await req('/api/cuenta/sesion');
    assert.equal(sin.status, 200);
    assert.deepEqual(await sin.json(), { abierta: false });
    const { cookie } = await signUp('ana@example.com');
    assert.deepEqual(await (await req('/api/cuenta/sesion', undefined, cookie)).json(), { abierta: true });
    await req('/api/cuenta/salir', {}, cookie);
    assert.deepEqual(await (await req('/api/cuenta/sesion', undefined, cookie)).json(), { abierta: false });
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

  it('si el regalo pago sigue sin abrirse, recuerda a quien regala a los 14 y a los 60 días, y nada más', async () => {
    const { cookie } = await signUp('ana@example.com');
    const root = masterRootFromMnemonic(MASTER);
    const [a, b] = [0, 1].map((i) => deriveGift(root, i, 'es', signet));
    for (const [i, g] of [a, b].entries()) {
      await req('/api/gifts', { direccion: g?.address, idioma: 'es', ocasion: 'cumple', para: i === 0 ? 'Tomi' : 'Lola', mensaje: '', imagen: 1, moneda: 'SAT', monto: 30000, sats: '30000', indice: i }, cookie);
      funded.add(g?.address as string);
    }
    const token = 't'.repeat(40);
    const tasks = createApp({ sql, chain, price, network: signet, tasksToken: token, accounts: { origins: [ORIGIN], publicUrl: ORIGIN, mailer: { send: async (m) => void mails.push(m) }, cookieSecure: true } });
    const run = async () => (await (await tasks.request('/api/tareas/difusiones', { method: 'POST', headers: { 'x-tarea-token': token } })).json()) as { avisos: number; recordatorios: number };
    assert.deepEqual(await run(), { difundidas: 0, canceladas: 0, avisos: 2, recordatorios: 0, creditos: 0, devoluciones: 0, pagos: 0 });
    const pasan = (dias: number) => sql`update regalos set aviso_listo = now() - make_interval(days => ${dias})`;
    await pasan(13);
    assert.equal((await run()).recordatorios, 0);
    await pasan(15);
    spent.add(b?.address as string); // Lola ya lo abrió
    assert.equal((await run()).recordatorios, 1);
    assert.equal(mails.at(-1)?.subject, 'Tomi todavía no abrió tu regalo');
    assert.equal(mails.at(-1)?.to, 'ana@example.com');
    assert.ok(mails.at(-1)?.text.includes(`${ORIGIN}/panel#acceso=`));
    assert.ok(!mails.at(-1)?.text.includes('/r/'), 'el mail nunca lleva el link del regalo');
    assert.equal((await run()).recordatorios, 0);
    await pasan(61);
    assert.equal((await run()).recordatorios, 1);
    await pasan(400);
    assert.equal((await run()).recordatorios, 0); // dos, y nada más
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

  it('créditos: 5 de bienvenida; con el cobro apagado no se consume nada', async () => {
    const { cookie } = await signUp('ana@example.com');
    const creditos = async () => (await (await req('/api/cuenta/creditos', undefined, cookie)).json()) as { cobroActivo: boolean; puedeRegalar: boolean; regalos: { bienvenida: number; pagos: number }; plan: unknown; movimientos: unknown[] };
    assert.equal((await req('/api/cuenta/creditos')).status, 401);
    const c0 = await creditos();
    assert.deepEqual([c0.cobroActivo, c0.puedeRegalar, c0.regalos.bienvenida, c0.regalos.pagos, c0.plan], [false, true, 5, 0, null]);
    const g = deriveGift(masterRootFromMnemonic(MASTER), 0, 'es', signet);
    await req('/api/gifts', { direccion: g.address, idioma: 'es', ocasion: 'cumple', para: 'Tomi', mensaje: '', imagen: 1, moneda: 'SAT', monto: 30000, sats: '30000', indice: 0 }, cookie);
    funded.add(g.address);
    const token = 't'.repeat(40);
    const tasks = createApp({ sql, chain, price, network: signet, tasksToken: token, accounts: { origins: [ORIGIN], publicUrl: ORIGIN, mailer: { send: async (m) => void mails.push(m) }, cookieSecure: true } });
    const run = async () => (await (await tasks.request('/api/tareas/difusiones', { method: 'POST', headers: { 'x-tarea-token': token } })).json()) as { creditos: number };
    assert.equal((await run()).creditos, 0);
    assert.equal((await creditos()).regalos.bienvenida, 5); // gratis mientras lanzamos
    // Aunque después se active el cobro, ese regalo ya quedó resuelto.
    await setChargingActive(sql, true);
    assert.equal((await run()).creditos, 0);
    assert.equal((await creditos()).regalos.bienvenida, 5);
  });

  it('cuenta con solo el mail (sin passkey): se confirma antes de regalar; con el cobro activo, sin cuenta no se regala', async () => {
    assert.equal((await req('/api/cuenta/registro-mail', { email: 'no-es-un-mail' })).status, 400);
    const res = await req('/api/cuenta/registro-mail', { email: 'Leo@Example.com', idioma: 'pt' });
    assert.equal(res.status, 202);
    // No abre sesión: hay que confirmar el mail con el link.
    assert.equal(res.headers.get('set-cookie'), null);
    assert.equal(mails.length, 1);
    assert.equal(mails[0]?.subject, 'Confirme seu e-mail no Regalale Bitcoin');
    const token = /#acceso=([A-Za-z0-9_-]{43})/.exec(mails[0]?.text ?? '')?.[1] as string;
    const ok = await req('/api/cuenta/link/canje', { token });
    assert.equal(ok.status, 200);
    const cookie = cookieOf(ok);
    const c = (await (await req('/api/cuenta/creditos', undefined, cookie)).json()) as { regalos: { bienvenida: number } };
    assert.equal(c.regalos.bienvenida, 5);
    const [u] = await sql<{ verificado: Date | null }[]>`select verificado from usuarios where email = 'leo@example.com'`;
    assert.ok(u?.verificado instanceof Date);
    // El mismo mail otra vez responde igual: no crea otra cuenta, manda el link para entrar.
    assert.equal((await req('/api/cuenta/registro-mail', { email: 'leo@example.com' })).status, 202);
    assert.equal(mails.length, 2);
    assert.equal((await sql`select id from usuarios where email = 'leo@example.com'`).length, 1);
    // Con el cobro activo, sin sesión no se puede registrar un regalo; con la cuenta confirmada, sí.
    await setChargingActive(sql, true);
    const g = deriveGift(masterRootFromMnemonic(MASTER), 0, 'es', signet);
    const gift = { direccion: g.address, idioma: 'es', ocasion: 'cumple', para: 'Tomi', mensaje: '', imagen: 1, moneda: 'SAT', monto: 30000, sats: '30000', indice: 0 };
    const anon = await req('/api/gifts', gift);
    assert.deepEqual([anon.status, ((await anon.json()) as { error: string }).error], [401, 'cuenta_requerida']);
    assert.equal((await req('/api/gifts', gift, cookie)).status, 201);
    // Con solo la bienvenida (lo gratis), la imagen con IA no va: viene con los planes.
    assert.equal(((await (await req('/api/cuenta/creditos', undefined, cookie)).json()) as { conPlan: boolean }).conPlan, false);
    const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 '), Buffer.alloc(200, 7)]);
    const g2 = deriveGift(masterRootFromMnemonic(MASTER), 1, 'es', signet);
    const propia = await req('/api/gifts', { ...gift, direccion: g2.address, indice: 1, estilo: 'propia', imagenPropia: webp.toString('base64') }, cookie);
    assert.deepEqual([propia.status, ((await propia.json()) as { error: string }).error], [403, 'plan_requerido']);
    // Pocas cuentas nuevas por IP.
    for (let i = 0; i < 3; i++) assert.equal((await req('/api/cuenta/registro-mail', { email: `x${i}@example.com` })).status, 202);
    assert.equal((await req('/api/cuenta/registro-mail', { email: 'x9@example.com' })).status, 429);
  });

  it('créditos: con el cobro activo, el primer depósito consume uno (una sola vez) y cancelar lo devuelve', async () => {
    await setChargingActive(sql, true);
    const { cookie } = await signUp('ana@example.com');
    const creditos = async () => (await (await req('/api/cuenta/creditos', undefined, cookie)).json()) as { puedeRegalar: boolean; regalos: { bienvenida: number; pagos: number } };
    const root = masterRootFromMnemonic(MASTER);
    const [a, b] = [0, 1].map((i) => deriveGift(root, i, 'es', signet));
    for (const [i, g] of [a, b].entries()) await req('/api/gifts', { direccion: g?.address, idioma: 'es', ocasion: 'cumple', para: 'Tomi', mensaje: '', imagen: 1, moneda: 'SAT', monto: 30000, sats: '30000', indice: i }, cookie);
    const token = 't'.repeat(40);
    const tasks = createApp({ sql, chain, price, network: signet, tasksToken: token, accounts: { origins: [ORIGIN], publicUrl: ORIGIN, mailer: { send: async (m) => void mails.push(m) }, cookieSecure: true } });
    const run = async () => (await (await tasks.request('/api/tareas/difusiones', { method: 'POST', headers: { 'x-tarea-token': token } })).json()) as { creditos: number; devoluciones: number };
    assert.equal((await run()).creditos, 0); // crear no consume
    funded.add(a?.address as string);
    assert.equal((await run()).creditos, 1);
    assert.equal((await run()).creditos, 0); // varios depósitos, una sola vez
    assert.equal((await creditos()).regalos.bienvenida, 4);
    // Lo cancela (recupera) sin que lo abran: el crédito vuelve a la bienvenida.
    await sql`update regalos set reclamo_tipo = 'recupero' where direccion = ${a?.address as string}`;
    assert.equal((await run()).devoluciones, 1);
    assert.equal((await run()).devoluciones, 0);
    assert.equal((await creditos()).regalos.bienvenida, 5);
    // Sin bienvenida, consume de los pagos; con plan vigente, no descuenta.
    const [u] = await sql<{ id: string }[]>`select id from usuarios where email = 'ana@example.com'`;
    const id = (u as { id: string }).id;
    await sql`insert into movimientos (usuario_id, tipo, unidad, cantidad, origen, motivo) values (${id}, 'ajuste', 'regalo', -5, 'bienvenida', 'prueba'), (${id}, 'compra', 'regalo', 10, 'pago', null)`;
    funded.add(b?.address as string);
    assert.equal((await run()).creditos, 1);
    assert.deepEqual((await creditos()).regalos, { bienvenida: 0, pagos: 9 });
    await sql`insert into planes (usuario_id, tipo, hasta, regalos) values (${id}, 'anual', now() + interval '365 days', 1)`;
    const c = deriveGift(root, 2, 'es', signet);
    await req('/api/gifts', { direccion: c.address, idioma: 'es', ocasion: 'cumple', para: 'Tomi', mensaje: '', imagen: 1, moneda: 'SAT', monto: 30000, sats: '30000', indice: 2 }, cookie);
    funded.add(c.address);
    assert.equal((await run()).creditos, 1);
    assert.deepEqual((await creditos()).regalos, { bienvenida: 0, pagos: 9 });
    const [uso] = await sql<{ origen: string; cantidad: number }[]>`select origen, cantidad from movimientos where tipo = 'consumo' order by id desc limit 1`;
    assert.deepEqual(uso, { origen: 'plan', cantidad: 0 });
    // El plan tenía 1 regalo: ya no cubre otro, y sin saldo no puede regalar.
    await sql`insert into movimientos (usuario_id, tipo, unidad, cantidad, origen, motivo) values (${id}, 'ajuste', 'regalo', -9, 'admin', 'prueba')`;
    assert.equal((await creditos()).puedeRegalar, false);
    await sql`insert into movimientos (usuario_id, tipo, unidad, cantidad, origen, motivo) values (${id}, 'ajuste', 'regalo', 9, 'admin', 'prueba')`;
    // Sin saldo ni plan, no puede regalar.
    await sql`delete from planes`;
    await sql`insert into movimientos (usuario_id, tipo, unidad, cantidad, origen, motivo) values (${id}, 'ajuste', 'regalo', -9, 'admin', 'prueba')`;
    assert.equal((await creditos()).puedeRegalar, false);
    // Y el servidor no deja crear otro regalo (la web ofrece los packs).
    const d = deriveGift(root, 3, 'es', signet);
    const sin = await req('/api/gifts', { direccion: d.address, idioma: 'es', ocasion: 'cumple', para: 'Tomi', mensaje: '', imagen: 1, moneda: 'SAT', monto: 30000, sats: '30000', indice: 3 }, cookie);
    assert.equal(sin.status, 409);
    assert.equal(((await sin.json()) as { error: string }).error, 'sin_creditos');
  });

  it('los movimientos solo se agregan: editarlos falla', async () => {
    await signUp('ana@example.com');
    await assert.rejects(sql`update movimientos set cantidad = 100`, /solo se agregan/);
  });

  it('pagos: sin llave de cobro no se vende; con llave, una dirección nueva por pago y cotización de 30 minutos', async () => {
    const { cookie } = await signUp('ana@example.com');
    const productos = async () => (await (await req('/api/productos')).json()) as { seVende: boolean; cobroActivo: boolean; fundadoresQuedan: number; productos: Array<{ codigo: string; precioSats: string; seVendeSuelto: boolean }> };
    const p0 = await productos();
    assert.deepEqual([p0.seVende, p0.cobroActivo, p0.fundadoresQuedan], [false, false, 21]);
    assert.deepEqual(p0.productos.find((p) => p.codigo === 'pack10'), { codigo: 'pack10', precioSats: '10500', regalos: 10, listasCumple: 0, listasOtras: 0, plan: null, regalosLibres: false, dias: null, cupo: null, seVendeSuelto: true });
    assert.equal(p0.productos.find((p) => p.codigo === 'lista_otras')?.seVendeSuelto, false);
    assert.equal((await req('/api/cuenta/pagos', { producto: 'pack10' })).status, 401);
    assert.equal((await req('/api/cuenta/pagos', { producto: 'pack10' }, cookie)).status, 409);
    const llave = accountKeyText(masterRootFromMnemonic('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'), signet);
    await setPaymentKey(sql, signet, llave);
    assert.equal((await productos()).seVende, true);
    for (const producto of ['bienvenida', 'lista_otras', 'nada']) assert.equal((await req('/api/cuenta/pagos', { producto }, cookie)).status, 422);
    const r1 = await req('/api/cuenta/pagos', { producto: 'pack10' }, cookie);
    assert.equal(r1.status, 201);
    const p1 = (await r1.json()) as { id: string; sats: string; direccion: string; estado: string; precioUsd: number };
    const key = parsePaymentKey(llave, signet);
    assert.deepEqual([p1.sats, p1.precioUsd, p1.estado, p1.direccion], ['10500', 10.5, 'pendiente', deriveListAddress(key, 0).address]);
    const p2 = (await (await req('/api/cuenta/pagos', { producto: 'pack10' }, cookie)).json()) as { direccion: string };
    assert.equal(p2.direccion, deriveListAddress(key, 1).address);
    assert.ok(!JSON.stringify(p1).includes('pub'), 'nunca muestra la llave');
    // El pago de otra cuenta no se ve.
    const otra = await signUp('beto@example.com');
    assert.equal((await req(`/api/cuenta/pagos/${p1.id}`, undefined, otra.cookie)).status, 404);
  });

  it('pagos: RBF espera una confirmación, sin RBF alcanza la mempool; 2 % de tolerancia; incompleto se completa', async () => {
    const { cookie } = await signUp('ana@example.com');
    await setPaymentKey(sql, signet, accountKeyText(masterRootFromMnemonic(MASTER), signet));
    const buy = async (producto: string) => (await (await req('/api/cuenta/pagos', { producto }, cookie)).json()) as { id: string; direccion: string; sats: string };
    const state = async (id: string) => ((await (await req(`/api/cuenta/pagos/${id}`, undefined, cookie)).json()) as { estado: string }).estado;
    const creditos = async () => ((await (await req('/api/cuenta/creditos', undefined, cookie)).json()) as { regalos: { pagos: number }; listas: { otras: number }; plan: { tipo: string; hasta: string | null; regalosQuedan: number | null; listas: number } | null });
    const tx = (n: number) => 'ab'.repeat(31) + String(n).padStart(2, '0');
    // RBF: 10.300 sats (más del 98 % de 10.500) en la mempool, señalando RBF → «visto», todavía sin acreditar.
    const a = await buy('pack10');
    pays.set(a.direccion, { confirmed: 0n, mempool: [{ txid: tx(1), feeRate: 2, value: 10_300n, rbf: true }] });
    assert.equal(await state(a.id), 'visto');
    assert.equal((await creditos()).regalos.pagos, 0);
    pays.set(a.direccion, { confirmed: 10_300n, mempool: [] });
    assert.equal(await state(a.id), 'confirmado');
    assert.equal((await creditos()).regalos.pagos, 10);
    assert.equal(await state(a.id), 'confirmado');
    assert.equal((await creditos()).regalos.pagos, 10); // una sola vez
    // Sin RBF: alcanza con la mempool. Pack con lista: 10 regalos más y una lista de cualquier ocasión.
    const b = await buy('pack10_lista');
    pays.set(b.direccion, { confirmed: 0n, mempool: [{ txid: tx(2), feeRate: 2, value: BigInt(b.sats), rbf: false }] });
    const token = 't'.repeat(40);
    const tasks = createApp({ sql, chain, price, network: signet, tasksToken: token, accounts: { origins: [ORIGIN], publicUrl: ORIGIN, mailer: { send: async (m) => void mails.push(m) }, cookieSecure: true } });
    const run = async () => (await (await tasks.request('/api/tareas/difusiones', { method: 'POST', headers: { 'x-tarea-token': token } })).json()) as { pagos: number };
    assert.equal((await run()).pagos, 1); // lo confirma la tarea programada
    const c = await creditos();
    assert.deepEqual([c.regalos.pagos, c.listas.otras], [20, 1]);
    // Falta más del 2 %: «incompleto»; se completa en la misma dirección.
    const d = await buy('pack10');
    pays.set(d.direccion, { confirmed: 5_000n, mempool: [] });
    assert.equal(await state(d.id), 'incompleto');
    pays.set(d.direccion, { confirmed: 10_500n, mempool: [] });
    assert.equal(await state(d.id), 'confirmado');
    // La lista de cumpleaños suelta ya no se vende.
    assert.equal((await req('/api/cuenta/pagos', { producto: 'lista_cumple' }, cookie)).status, 422);
    // Timechain (anual): 30 regalos y 3 listas por 365 días, en el plan (no como créditos sueltos).
    const e = await buy('anual');
    pays.set(e.direccion, { confirmed: BigInt(e.sats), mempool: [] });
    assert.equal(await state(e.id), 'confirmado');
    const plan = (await creditos()).plan;
    assert.deepEqual([plan?.tipo, plan?.regalosQuedan, plan?.listas], ['anual', 30, 3]);
    assert.ok(Math.abs(Date.parse(plan?.hasta as string) - Date.now() - 365 * 86_400_000) < 60_000);
    assert.equal((await creditos()).regalos.pagos, 30); // los 20 + 10 de antes, sin sumar los del plan
    // Genesis Block (fundador): regalos libres y 10 listas, para siempre; solo 21.
    const f = await buy('fundador');
    pays.set(f.direccion, { confirmed: BigInt(f.sats), mempool: [] });
    assert.equal(await state(f.id), 'confirmado');
    assert.deepEqual((await creditos()).plan, { tipo: 'fundador', hasta: null, regalosQuedan: null, listas: 10 });
    assert.equal(((await (await req('/api/productos')).json()) as { fundadoresQuedan: number }).fundadoresQuedan, 20);
  });

  it('pagos: el precio está en sats; la cotización del dólar no cambia lo que se pide', async () => {
    const { cookie } = await signUp('ana@example.com');
    await setPaymentKey(sql, signet, accountKeyText(masterRootFromMnemonic(MASTER), signet));
    usdPerBtc = 50_000; // aunque el bitcoin baje, se piden los mismos 10.500 sats
    const p = (await (await req('/api/cuenta/pagos', { producto: 'pack10' }, cookie)).json()) as { id: string; direccion: string; sats: string; precioUsd: number };
    assert.deepEqual([p.sats, p.precioUsd], ['10500', 5.25]);
    const state = async () => ((await (await req(`/api/cuenta/pagos/${p.id}`, undefined, cookie)).json()) as { estado: string }).estado;
    usdPerBtc = 200_000;
    pays.set(p.direccion, { confirmed: 10_500n, mempool: [] });
    assert.equal(await state(), 'confirmado');
  });

  it('admin del cobro: llave con vista previa, passkey obligatoria, cambio a las 24 h, cobro, precios y ajustes', async () => {
    const ana = await signUp('ana@example.com');
    assert.equal((await req('/api/admin/cobro', undefined, ana.cookie)).status, 404);
    const admin = await signUp('admin@example.com');
    const get = async () => (await (await req('/api/admin/cobro', undefined, admin.cookie)).json()) as {
      cobroActivo: boolean; llave: { huella: string; direcciones: string[] } | null; llaveNueva: { huella: string; vigenteDesde: string } | null;
      productos: Array<{ codigo: string; precioSats: string }>; registro: Array<{ accion: string; detalle: string }>;
    };
    assert.equal((await get()).llave, null);
    const root = masterRootFromMnemonic('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');
    const llave = accountKeyText(root, signet);
    const key = parsePaymentKey(llave, signet);
    // Vista previa: las 3 primeras direcciones, sin guardar nada.
    const vista = (await (await req('/api/admin/llave/vista', { llave }, admin.cookie)).json()) as { direcciones: string[] };
    assert.deepEqual(vista.direcciones, [0, 1, 2].map((i) => deriveListAddress(key, i).address));
    assert.equal((await get()).llave, null);
    const mala = await req('/api/admin/llave/vista', { llave: 'zpub123' }, admin.cookie);
    assert.equal(mala.status, 422);
    // Con una sesión abierta por link de mail no alcanza: hace falta passkey.
    await req('/api/cuenta/link', { email: 'admin@example.com' });
    const token = /#acceso=([A-Za-z0-9_-]{43})/.exec(mails.at(-1)?.text ?? '')?.[1] as string;
    const viaLink = cookieOf(await req('/api/cuenta/link/canje', { token }));
    assert.equal((await req('/api/admin/cobro', undefined, viaLink)).status, 200);
    const sinPasskey = await req('/api/admin/llave', { llave }, viaLink);
    assert.equal(sinPasskey.status, 403);
    // Primera carga: vigente enseguida, con aviso por mail y registro.
    mails = [];
    const r1 = (await (await req('/api/admin/llave', { llave }, admin.cookie)).json()) as { pendiente: boolean; huella: string };
    assert.equal(r1.pendiente, false);
    assert.equal(mails.length, 1);
    assert.equal(mails[0]?.to, 'admin@example.com');
    const g1 = await get();
    assert.deepEqual(g1.llave?.direcciones, vista.direcciones);
    assert.equal(g1.registro[0]?.accion, 'llave_cargada');
    // Cambio: queda pendiente 24 h; mientras tanto se cobra a la anterior.
    const otra = accountKeyText(masterRootFromMnemonic('zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong'), signet);
    const r2 = (await (await req('/api/admin/llave', { llave: otra }, admin.cookie)).json()) as { pendiente: boolean };
    assert.equal(r2.pendiente, true);
    const g2 = await get();
    assert.deepEqual(g2.llave?.direcciones, vista.direcciones);
    assert.ok(g2.llaveNueva !== null && Date.parse(g2.llaveNueva.vigenteDesde) - Date.now() > 23.9 * 3_600_000);
    await sql`update ajustes set actualizado = now() - interval '25 hours' where clave = 'llave_cobro_nueva'`;
    const g3 = await get();
    assert.equal(g3.llaveNueva, null);
    assert.equal(g3.llave?.direcciones[0], deriveListAddress(parsePaymentKey(otra, signet), 0).address);
    // La llave entera nunca vuelve al navegador.
    assert.ok(!JSON.stringify(g3).includes('pub'));
    // Activar el cobro, precio y ajuste.
    assert.equal((await req('/api/admin/cobro', { activo: true }, viaLink)).status, 403);
    assert.deepEqual(await (await req('/api/admin/cobro', { activo: true }, admin.cookie)).json(), { cobroActivo: true });
    assert.equal((await get()).cobroActivo, true);
    assert.equal((await req('/api/admin/precio', { producto: 'pack10', precioSats: 12_000 }, admin.cookie)).status, 200);
    assert.equal((await get()).productos.find((p) => p.codigo === 'pack10')?.precioSats, '12000');
    assert.equal((await req('/api/admin/precio', { producto: 'pack10', precioSats: 10.5 }, admin.cookie)).status, 400);
    assert.equal((await req('/api/admin/precio', { producto: 'bienvenida', precioSats: 1000 }, admin.cookie)).status, 404);
    // Qué incluye cada producto (los valores y límites pueden cambiar).
    assert.equal((await req('/api/admin/producto', { producto: 'anual', regalos: 40, listas: 4, dias: 365, cupo: null }, admin.cookie)).status, 200);
    assert.equal((await req('/api/admin/producto', { producto: 'fundador', regalos: null, listas: 10, dias: null, cupo: 5 }, admin.cookie)).status, 200);
    assert.equal((await req('/api/admin/producto', { producto: 'pack10', regalos: null, listas: 0, dias: null, cupo: null }, admin.cookie)).status, 400);
    assert.equal((await req('/api/admin/producto', { producto: 'pack10', regalos: 12, listas: 0, dias: 30, cupo: null }, admin.cookie)).status, 400);
    const prods = (await get()).productos as unknown as Array<{ codigo: string; regalos: number | null; listas: number; dias: number | null; cupo: number | null }>;
    assert.deepEqual(prods.find((p) => p.codigo === 'anual'), { codigo: 'anual', precioSats: '42000', activo: true, plan: 'anual', regalos: 40, listas: 4, dias: 365, cupo: null });
    assert.equal(((await get()) as unknown as { fundadoresQuedan: number }).fundadoresQuedan, 5);
    assert.equal((await req('/api/admin/ajuste', { email: 'ana@example.com', unidad: 'regalo', cantidad: 3, motivo: 'x' }, admin.cookie)).status, 400);
    assert.equal((await req('/api/admin/ajuste', { email: 'ana@example.com', unidad: 'regalo', cantidad: 3, motivo: 'Regalo por ayudar con las pruebas' }, admin.cookie)).status, 200);
    const c = (await (await req('/api/cuenta/creditos', undefined, ana.cookie)).json()) as { regalos: { pagos: number } };
    assert.equal(c.regalos.pagos, 3);
    assert.deepEqual((await get()).registro.map((r) => r.accion).slice(0, 4), ['ajuste', 'producto', 'producto', 'precio']);
  });

  it('arrepentimiento: 10 días, sin créditos usados; código de trámite; el admin marca la devolución', async () => {
    const ana = await signUp('ana@example.com');
    const admin = await signUp('admin@example.com');
    await setPaymentKey(sql, signet, accountKeyText(masterRootFromMnemonic(MASTER), signet));
    const buy = async (producto: string) => {
      const p = (await (await req('/api/cuenta/pagos', { producto }, ana.cookie)).json()) as { id: string; direccion: string; sats: string };
      pays.set(p.direccion, { confirmed: BigInt(p.sats), mempool: [] });
      await req(`/api/cuenta/pagos/${p.id}`, undefined, ana.cookie);
      return p;
    };
    const compras = async () => ((await (await req('/api/cuenta/compras', undefined, ana.cookie)).json()) as { compras: Array<{ id: string; noProcede: string | null; arrepentimiento: { codigo: string; estado: string } | null }> }).compras;
    const devolucion = deriveBip84Key(masterRootFromMnemonic('zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong'), signet, 0, 0).address;
    const a = await buy('pack10');
    assert.equal((await compras())[0]?.noProcede, null);
    assert.equal((await req('/api/cuenta/arrepentimiento', { pago: a.id, direccion: 'bc1qnoesvalida' }, ana.cookie)).status, 422);
    const r = await req('/api/cuenta/arrepentimiento', { pago: a.id, direccion: devolucion }, ana.cookie);
    assert.equal(r.status, 201);
    const { codigo } = (await r.json()) as { codigo: string };
    assert.match(codigo, /^ARR-[A-Z0-9]{6}$/);
    assert.ok(mails.some((m) => m.to === 'ana@example.com' && m.text.includes(codigo)));
    assert.ok(mails.some((m) => m.to === 'admin@example.com' && m.text.includes(devolucion)));
    assert.deepEqual(await (await req('/api/cuenta/arrepentimiento', { pago: a.id, direccion: devolucion }, ana.cookie)).json(), { codigo });
    const pedidos = ((await (await req('/api/admin/arrepentimientos', undefined, admin.cookie)).json()) as { pedidos: Array<{ codigo: string; direccion: string; sats: string }> }).pedidos;
    assert.deepEqual([pedidos[0]?.codigo, pedidos[0]?.direccion, pedidos[0]?.sats], [codigo, devolucion, a.sats]);
    assert.equal((await req('/api/admin/arrepentimientos', undefined, ana.cookie)).status, 404);
    assert.equal((await req(`/api/admin/arrepentimiento/${codigo}/devuelto`, {}, admin.cookie)).status, 200);
    assert.equal((await req(`/api/admin/arrepentimiento/${codigo}/devuelto`, {}, admin.cookie)).status, 404); // una sola vez
    const c = (await (await req('/api/cuenta/creditos', undefined, ana.cookie)).json()) as { regalos: { pagos: number } };
    assert.equal(c.regalos.pagos, 0);
    assert.equal((await compras())[0]?.arrepentimiento?.estado, 'devuelto');
    // Si usó créditos de la compra, no procede; pasados 10 días, tampoco.
    const b = await buy('pack10');
    const [u] = await sql<{ id: string }[]>`select id from usuarios where email = 'ana@example.com'`;
    await sql`insert into movimientos (usuario_id, tipo, unidad, cantidad, origen) values (${(u as { id: string }).id}, 'consumo', 'regalo', -1, 'pago')`;
    const usado = await req('/api/cuenta/arrepentimiento', { pago: b.id, direccion: devolucion }, ana.cookie);
    assert.deepEqual([usado.status, ((await usado.json()) as { error: string }).error], [409, 'creditos_usados']);
    const d = await buy('pack10_lista');
    await sql`update pagos set confirmado = now() - interval '11 days' where id = ${d.id}`;
    const vencido = await req('/api/cuenta/arrepentimiento', { pago: d.id, direccion: devolucion }, ana.cookie);
    assert.deepEqual([vencido.status, ((await vencido.json()) as { error: string }).error], [409, 'arrepentimiento_vencido']);
    // Un plan anual sin usar se puede devolver: el plan termina.
    const e = await buy('anual');
    const codigoPlan = ((await (await req('/api/cuenta/arrepentimiento', { pago: e.id, direccion: devolucion }, ana.cookie)).json()) as { codigo: string }).codigo;
    await req(`/api/admin/arrepentimiento/${codigoPlan}/devuelto`, {}, admin.cookie);
    assert.equal(((await (await req('/api/cuenta/creditos', undefined, ana.cookie)).json()) as { plan: unknown }).plan, null);
  });
});
