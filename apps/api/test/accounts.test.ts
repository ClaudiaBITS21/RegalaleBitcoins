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
const INDEX_HTML = '<!doctype html><html><head><title>Regalale Bitcoin</title><meta property="og:title" content="Regalale Bitcoin" /><meta property="og:image" content="x" /></head><body></body></html>';
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
    await sql`delete from cupon_usos`;
    await sql`delete from pagos`;
    await sql`delete from cupones`;
    await sql`delete from cupon_lotes`;
    await sql`delete from usuarios`;
    await sql`delete from ajustes`;
    await sql`delete from admins`;
    await sql`update productos set regalos = 5, listas_otras = 0, ia = false, tarjeta = false, saludo = false where codigo = 'bienvenida'`;
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
      advancedRecovery: true,
      indexHtml: async () => INDEX_HTML,
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
    assert.deepEqual(await ok.json(), { email: 'ana@example.com', credencial: pk.id.toString('base64url'), boveda: VAULT, bovedasExtra: [] });
    pk.counter = 2;
    assert.equal((await req('/api/cuenta/ingreso', { credencial: pk.assert(ch) })).status, 401); // desafío ya usado
  });

  it('copias extra de la bóveda (passkey por QR): solo con sesión de passkey, hasta 3, vuelven al entrar', async () => {
    const { pk, cookie: alta } = await signUp('ana@example.com');
    const extra = (n: number) => `v1.${'C'.repeat(16)}.${String(n).repeat(64)}`;
    // La sesión del alta ya es de esa passkey.
    assert.equal((await req('/api/cuenta/boveda-extra', { boveda: extra(1) }, alta)).status, 201);
    assert.equal((await req('/api/cuenta/boveda-extra', { boveda: 'cualquier cosa' }, alta)).status, 400);
    assert.equal((await req('/api/cuenta/boveda-extra', { boveda: extra(2) })).status, 401);
    for (const n of [2, 3, 4]) await req('/api/cuenta/boveda-extra', { boveda: extra(n) }, alta);
    pk.counter = 1;
    const ok = await req('/api/cuenta/ingreso', { credencial: pk.assert(await challenge('ingreso')) });
    const { bovedasExtra } = (await ok.json()) as { bovedasExtra: string[] };
    assert.deepEqual(new Set(bovedasExtra), new Set([extra(2), extra(3), extra(4)]));
    // Con una sesión abierta por link (sin passkey) no se puede.
    const mailRes = await req('/api/cuenta/link', { email: 'ana@example.com' });
    assert.equal(mailRes.status, 202);
  });

  it('vincular la compu con el celu: pide la compu, sube el celu (misma cuenta), entrega una vez', async () => {
    const pk = new FakePasskey();
    const { cookie: compu } = await signUp('ana@example.com', pk);
    pk.counter = 1;
    const celu = cookieOf(await req('/api/cuenta/ingreso', { credencial: pk.assert(await challenge('ingreso')) }));
    const { cookie: otra } = await signUp('beto@example.com');
    const pedido = await req('/api/cuenta/vinculos', {}, compu);
    assert.equal(pedido.status, 201);
    const { id } = (await pedido.json()) as { id: string };
    assert.deepEqual(await (await req(`/api/cuenta/vinculos/${id}`, undefined, compu)).json(), { paquete: null });
    const paquete = `v1.${'P'.repeat(87)}.${'I'.repeat(16)}.${'C'.repeat(60)}`;
    // Otra cuenta no puede ni subir ni leer.
    assert.equal((await req(`/api/cuenta/vinculos/${id}`, { paquete }, otra)).status, 404);
    assert.equal((await req(`/api/cuenta/vinculos/${id}`, undefined, otra)).status, 404);
    assert.equal((await req(`/api/cuenta/vinculos/${id}`, { paquete: 'x' }, celu)).status, 400);
    assert.equal((await req(`/api/cuenta/vinculos/${id}`, { paquete }, celu)).status, 200);
    assert.equal((await req(`/api/cuenta/vinculos/${id}`, { paquete }, celu)).status, 404); // una sola vez
    assert.deepEqual(await (await req(`/api/cuenta/vinculos/${id}`, undefined, compu)).json(), { paquete });
    assert.equal((await req(`/api/cuenta/vinculos/${id}`, undefined, compu)).status, 404); // ya se entregó
    assert.equal((await req('/api/cuenta/vinculos', {})).status, 401);
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

  it('recupero avanzado: la clave de la billetera se guarda solo cifrada y solo con sesión', async () => {
    const sealed = `r1.${'A'.repeat(16)}.${'b'.repeat(120)}`;
    assert.equal((await req('/api/cuenta/recupero', { recupero: sealed })).status, 401);
    const { cookie } = await signUp('ana@example.com');
    assert.deepEqual(await (await req('/api/cuenta/recupero', undefined, cookie)).json(), { recupero: null });
    // En claro no se acepta: solo el formato cifrado.
    assert.equal((await req('/api/cuenta/recupero', { recupero: '[b8688df1/48h/1h/0h/2h]tpubDEfobrrtptRTbKf4gysDhoabneAB' }, cookie)).status, 400);
    assert.equal((await req('/api/cuenta/recupero', { recupero: sealed }, cookie)).status, 200);
    assert.deepEqual(await (await req('/api/cuenta/recupero', undefined, cookie)).json(), { recupero: sealed });
    assert.equal((await req('/api/cuenta/recupero', { recupero: null }, cookie)).status, 200);
    assert.deepEqual(await (await req('/api/cuenta/recupero', undefined, cookie)).json(), { recupero: null });
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
    const me = (await (await req('/api/cuenta', undefined, cookie)).json()) as {
      proximoIndice: number;
      regalos: Array<{ indice: number; para: string; estado: string; original: { moneda: string; monto: number; usdPorBtc: number | null } }>;
      cotizacion: { usdPorBtc: number | null; arsPorBtc: number | null };
    };
    assert.equal(me.proximoIndice, 1);
    assert.deepEqual(me.regalos.map((r) => [r.indice, r.para, r.estado]), [[0, 'Tomi', 'esperando']]);
    // Para mostrar cuánto vale hoy: lo que se puso al armarlo y la cotización de hoy.
    assert.deepEqual([me.regalos[0]?.original.moneda, me.regalos[0]?.original.monto, me.cotizacion.usdPorBtc], ['SAT', 30000, usdPerBtc]);

    const token = 't'.repeat(40);
    const tasks = createApp({ sql, chain, price, network: signet, tasksToken: token, accounts: { origins: [ORIGIN], publicUrl: ORIGIN, mailer: { send: async (m) => void mails.push(m) }, cookieSecure: true } });
    const run = async () => (await (await tasks.request('/api/tareas/difusiones', { method: 'POST', headers: { 'x-tarea-token': token } })).json()) as { avisos: number };
    assert.equal((await run()).avisos, 0);
    funded.add(g.address);
    assert.equal((await run()).avisos, 1);
    assert.equal((await run()).avisos, 0); // una sola vez
    // «¡Felicitaciones!» con el diseño de la marca; el primero dice «tu primer regalo».
    const ready = mails.at(-1);
    assert.equal(ready?.subject, '¡Felicitaciones! Hiciste tu primer regalo');
    assert.ok(!ready?.text.includes('/r/'), 'el mail nunca lleva el link del regalo');
    // El mail todavía no está confirmado: el botón lo confirma (y abre el panel).
    assert.match(ready?.text ?? '', /Confirmar mi mail: https:\/\/[^ ]+\/panel#acceso=[A-Za-z0-9_-]{43}/);
    assert.ok(ready?.html?.includes('/mail/logo-naranja.png') && ready.html.includes('Confirmar mi mail') && ready.html.includes('#FF8A1F'));
    assert.ok(!ready?.html?.includes('/r/'), 'el HTML tampoco lleva el link del regalo');
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

  it('lo gratis se edita desde el admin: ajusta a quienes nunca compraron, no a quienes compraron (Claudia, 23/10)', async () => {
    await setChargingActive(sql, true);
    const ana = await signUp('ana@example.com');
    const bob = await signUp('bob@example.com');
    const admin = await signUp('admin@example.com');
    const idOf = async (email: string) => ((await sql<{ id: string }[]>`select id from usuarios where email = ${email}`)[0] as { id: string }).id;
    // Ana ya usó 2 regalos de bienvenida; Bob compró un pack.
    await sql`insert into movimientos (usuario_id, tipo, unidad, cantidad, origen, motivo) values (${await idOf('ana@example.com')}, 'ajuste', 'regalo', -2, 'bienvenida', 'prueba')`;
    await sql`insert into movimientos (usuario_id, tipo, unidad, cantidad, origen) values (${await idOf('bob@example.com')}, 'compra', 'regalo', 10, 'pago')`;
    type C = { regalos: { bienvenida: number; pagos: number }; listas: { otras: number }; conIa: boolean; conTarjeta: boolean; conSaludo: boolean };
    const creditos = async (cookie: string) => (await (await req('/api/cuenta/creditos', undefined, cookie)).json()) as C;
    const a0 = await creditos(ana.cookie);
    assert.deepEqual([a0.regalos.bienvenida, a0.listas.otras, a0.conIa, a0.conTarjeta, a0.conSaludo], [3, 0, false, false, false]);
    // Sin passkey no se cambia; con datos inválidos, tampoco.
    mails = [];
    await req('/api/cuenta/link', { email: 'admin@example.com' });
    const token = /#acceso=([A-Za-z0-9_-]{43})/.exec(mails[0]?.text ?? '')?.[1] as string;
    const viaLink = cookieOf(await req('/api/cuenta/link/canje', { token }));
    const nuevo = { regalos: 6, listas: 1, ia: true, tarjeta: false, saludo: true };
    assert.equal((await req('/api/admin/gratis', nuevo, viaLink)).status, 403);
    assert.equal((await req('/api/admin/gratis', { ...nuevo, listas: -1 }, admin.cookie)).status, 400);
    assert.equal((await req('/api/admin/gratis', nuevo, ana.cookie)).status, 404);
    const r = (await (await req('/api/admin/gratis', nuevo, admin.cookie)).json()) as { cuentas: number };
    assert.equal(r.cuentas, 2); // Ana y el admin (nunca compraron); Bob no
    const a1 = await creditos(ana.cookie);
    assert.deepEqual([a1.regalos.bienvenida, a1.listas.otras, a1.conIa, a1.conTarjeta, a1.conSaludo], [4, 1, true, false, true]);
    const b1 = await creditos(bob.cookie);
    assert.deepEqual([b1.regalos.bienvenida, b1.regalos.pagos, b1.listas.otras], [5, 10, 0]);
    // Una cuenta nueva ya recibe lo gratis nuevo; la página de precios lo muestra.
    const cleo = await signUp('cleo@example.com');
    const c1 = await creditos(cleo.cookie);
    assert.deepEqual([c1.regalos.bienvenida, c1.listas.otras], [6, 1]);
    const prods = (await (await req('/api/productos')).json()) as { productos: Array<{ codigo: string; regalos: number; listasOtras: number; ia: boolean; tarjeta: boolean; saludo: boolean }> };
    const bienvenida = prods.productos.find((p) => p.codigo === 'bienvenida');
    assert.deepEqual([bienvenida?.regalos, bienvenida?.listasOtras, bienvenida?.ia, bienvenida?.tarjeta, bienvenida?.saludo], [6, 1, true, false, true]);
    // Bajarlo descuenta lo que queda, sin pasar de cero.
    await req('/api/admin/gratis', { ...nuevo, regalos: 0, listas: 0 }, admin.cookie);
    const a2 = await creditos(ana.cookie);
    assert.deepEqual([a2.regalos.bienvenida, a2.listas.otras], [0, 0]);
    assert.equal((await creditos(bob.cookie)).regalos.bienvenida, 5);
    // La imagen con IA sigue incluida en lo gratis: Ana puede crear un regalo con imagen propia... sin regalos de bienvenida no.
    const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 '), Buffer.alloc(200, 7)]).toString('base64');
    const g = deriveGift(masterRootFromMnemonic(MASTER), 0, 'es', signet);
    const gift = { direccion: g.address, idioma: 'es', ocasion: 'cumple', para: 'Tomi', mensaje: '', imagen: 1, estilo: 'propia', imagenPropia: webp, moneda: 'SAT', monto: 30000, sats: '30000', indice: 0 };
    assert.equal((await req('/api/gifts', gift, ana.cookie)).status, 409);
    await req('/api/admin/gratis', { ...nuevo, regalos: 1, listas: 0 }, admin.cookie);
    assert.equal((await req('/api/gifts', gift, ana.cookie)).status, 201);
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

  it('admin: con el cobro activo regala sin saldo, con imagen propia, y sus regalos no descuentan (Claudia, 22/10)', async () => {
    await setChargingActive(sql, true);
    const { cookie } = await signUp('admin@example.com');
    const [u] = await sql<{ id: string }[]>`select id from usuarios where email = 'admin@example.com'`;
    const id = (u as { id: string }).id;
    // Sin bienvenida ni pagos: igual puede regalar, con imagen propia (IA).
    await sql`insert into movimientos (usuario_id, tipo, unidad, cantidad, origen, motivo) values (${id}, 'ajuste', 'regalo', -5, 'bienvenida', 'prueba')`;
    const g = deriveGift(masterRootFromMnemonic(MASTER), 0, 'es', signet);
    const res = await req('/api/gifts', { direccion: g.address, idioma: 'es', ocasion: 'cumple', para: 'Tomi', mensaje: '', imagen: 1, estilo: 'propia', imagenPropia: Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 '), Buffer.alloc(200, 7)]).toString('base64'), moneda: 'SAT', monto: 30000, sats: '30000', indice: 0 }, cookie);
    assert.equal(res.status, 201);
    const token = 't'.repeat(40);
    const tasks = createApp({ sql, chain, price, network: signet, tasksToken: token, adminEmails: ['admin@example.com'], accounts: { origins: [ORIGIN], publicUrl: ORIGIN, mailer: { send: async (m) => void mails.push(m) }, cookieSecure: true } });
    funded.add(g.address);
    const r = (await (await tasks.request('/api/tareas/difusiones', { method: 'POST', headers: { 'x-tarea-token': token } })).json()) as { creditos: number };
    assert.equal(r.creditos, 1);
    const [uso] = await sql<{ origen: string; cantidad: number }[]>`select origen, cantidad from movimientos where tipo = 'consumo'`;
    assert.deepEqual(uso, { origen: 'admin', cantidad: 0 });
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
    assert.deepEqual((await creditos()).regalos, { bienvenida: 0, pagos: 9, porOcasion: {} });
    await sql`insert into planes (usuario_id, tipo, hasta, regalos) values (${id}, 'anual', now() + interval '365 days', 1)`;
    const c = deriveGift(root, 2, 'es', signet);
    await req('/api/gifts', { direccion: c.address, idioma: 'es', ocasion: 'cumple', para: 'Tomi', mensaje: '', imagen: 1, moneda: 'SAT', monto: 30000, sats: '30000', indice: 2 }, cookie);
    funded.add(c.address);
    assert.equal((await run()).creditos, 1);
    assert.deepEqual((await creditos()).regalos, { bienvenida: 0, pagos: 9, porOcasion: {} });
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
    assert.deepEqual(p0.productos.find((p) => p.codigo === 'pack10'), { codigo: 'pack10', precioSats: '10500', regalos: 10, listasCumple: 0, listasOtras: 0, plan: null, regalosLibres: false, dias: null, cupo: null, saludo: false, ia: true, tarjeta: true, seVendeSuelto: true });
    // Por unidad (Claudia, 25/10): un regalo a 2.100 sats y una lista a 10.500.
    assert.deepEqual(['regalo', 'lista_otras'].map((c) => { const p = p0.productos.find((x) => x.codigo === c); return [p?.precioSats, p?.seVendeSuelto]; }), [['2100', true], ['10500', true]]);
    assert.equal((await req('/api/cuenta/pagos', { producto: 'pack10' })).status, 401);
    assert.equal((await req('/api/cuenta/pagos', { producto: 'pack10' }, cookie)).status, 409);
    const llave = accountKeyText(masterRootFromMnemonic('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'), signet);
    await setPaymentKey(sql, signet, llave);
    assert.equal((await productos()).seVende, true);
    for (const producto of ['bienvenida', 'nada']) assert.equal((await req('/api/cuenta/pagos', { producto }, cookie)).status, 422);
    assert.equal(((await (await req('/api/cuenta/pagos', { producto: 'regalo' }, cookie)).json()) as { sats: string }).sats, '2100');
    assert.equal(((await (await req('/api/cuenta/pagos', { producto: 'lista_otras' }, cookie)).json()) as { sats: string }).sats, '10500');
    const r1 = await req('/api/cuenta/pagos', { producto: 'pack10' }, cookie);
    assert.equal(r1.status, 201);
    const p1 = (await r1.json()) as { id: string; sats: string; direccion: string; estado: string; precioUsd: number };
    const key = parsePaymentKey(llave, signet);
    assert.deepEqual([p1.sats, p1.precioUsd, p1.estado, p1.direccion], ['10500', 10.5, 'pendiente', deriveListAddress(key, 2).address]);
    const p2 = (await (await req('/api/cuenta/pagos', { producto: 'pack10' }, cookie)).json()) as { direccion: string };
    assert.equal(p2.direccion, deriveListAddress(key, 3).address);
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
    const creditos = async () => ((await (await req('/api/cuenta/creditos', undefined, cookie)).json()) as { conSaludo: boolean; regalos: { pagos: number }; listas: { otras: number }; plan: { tipo: string; hasta: string | null; regalosQuedan: number | null; listas: number } | null });
    await setChargingActive(sql, true);
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
    // Satoshi trae IA y tarjeta, pero no la salutación automática (21/10).
    assert.equal((await creditos()).conSaludo, false);
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
    // Node trae la salutación.
    assert.equal((await creditos()).conSaludo, true);
    // Hodler (código «anual», 21/10): 30 regalos y 3 listas como créditos, que no vencen; sin plan.
    const antes = await creditos();
    const e = await buy('anual');
    pays.set(e.direccion, { confirmed: BigInt(e.sats), mempool: [] });
    assert.equal(await state(e.id), 'confirmado');
    const despues = await creditos();
    assert.equal(despues.plan, null);
    assert.deepEqual([despues.regalos.pagos - antes.regalos.pagos, despues.listas.otras - antes.listas.otras], [30, 3]);
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

  it('cupones: canje de créditos con ocasión, descuento con reserva, 100 % sin pago, una vez por cuenta, y consumo por ocasión', async () => {
    const admin = await signUp('admin@example.com');
    const ana = await signUp('ana@example.com');
    const beto = await signUp('beto@example.com');
    const cupon = async (b: Record<string, unknown>) => (await req('/api/admin/cupones', b, admin.cookie)).status;
    const creditos = async (cookie: string) =>
      (await (await req('/api/cuenta/creditos', undefined, cookie)).json()) as { regalos: { pagos: number; porOcasion: Record<string, number> }; listas: { otras: number }; plan: { tipo: string } | null };
    // Crear: con passkey, en mayúsculas; un cupón tiene que dar algo.
    assert.equal(await cupon({ codigo: 'navidad25', da: { unidad: 'regalo', cantidad: 3, ocasion: 'navidad' }, maxUsos: 2 }), 201);
    assert.equal(await cupon({ codigo: 'NAVIDAD25', da: { unidad: 'regalo', cantidad: 1 }, maxUsos: 1 }), 409);
    assert.equal(await cupon({ codigo: 'NADA', maxUsos: 1 }), 400);
    assert.equal(await cupon({ codigo: 'MITAD', descuento: 50, productos: ['pack10'], maxUsos: 1 }), 201);
    assert.equal(await cupon({ codigo: 'GRATIS100', descuento: 100, da: { unidad: 'lista_otras', cantidad: 1 }, maxUsos: 5 }), 201);
    assert.equal((await req('/api/admin/cupones', { codigo: 'OTRO', descuento: 10, maxUsos: 1 }, ana.cookie)).status, 404);
    // Canje en «Mi plan»: créditos de Navidad, una sola vez por cuenta.
    const canje = async (codigo: string, cookie: string) => {
      const r = await req('/api/cuenta/cupon', { codigo }, cookie);
      return [r.status, ((await r.json()) as { error?: string }).error ?? null];
    };
    assert.deepEqual(await canje('navidad25', ana.cookie), [201, null]);
    assert.deepEqual(await canje('NAVIDAD25', ana.cookie), [409, 'cupon_usado']);
    assert.deepEqual(await canje('NOEXISTE', ana.cookie), [404, 'cupon_invalido']);
    assert.deepEqual(await canje('MITAD', ana.cookie), [409, 'cupon_es_de_compra']);
    assert.deepEqual((await creditos(ana.cookie)).regalos.porOcasion, { navidad: 3 });
    // Descuento al comprar: precio con el descuento, solo en los productos del cupón.
    const ver = async (codigo: string, producto: string) => (await req('/api/cuenta/cupon/ver', { codigo, producto }, ana.cookie)).json() as Promise<{ precio?: string; precioOriginal?: string; error?: string }>;
    assert.deepEqual([(await ver('MITAD', 'pack10')).precio, (await ver('MITAD', 'pack10')).precioOriginal], ['5250', '10500']);
    assert.equal((await ver('MITAD', 'anual')).error, 'cupon_no_aplica');
    await setPaymentKey(sql, signet, accountKeyText(masterRootFromMnemonic(MASTER), signet));
    const pago = (await (await req('/api/cuenta/pagos', { producto: 'pack10', cupon: 'mitad' }, ana.cookie)).json()) as { id: string; sats: string; direccion: string };
    assert.equal(pago.sats, '5250');
    // La reserva cuenta para el máximo: otra cuenta ya no puede usarlo.
    const otro = await req('/api/cuenta/pagos', { producto: 'pack10', cupon: 'MITAD' }, beto.cookie);
    assert.deepEqual([otro.status, ((await otro.json()) as { error: string }).error], [409, 'cupon_agotado']);
    pays.set(pago.direccion, { confirmed: 5250n, mempool: [] });
    await req(`/api/cuenta/pagos/${pago.id}`, undefined, ana.cookie);
    assert.equal((await creditos(ana.cookie)).regalos.pagos, 10);
    // 100 %: sin pago on-chain; se acredita en el acto, con lo que da el cupón además.
    const libre = (await (await req('/api/cuenta/pagos', { producto: 'fundador', cupon: 'GRATIS100' }, beto.cookie)).json()) as { gratis?: boolean };
    assert.equal(libre.gratis, true);
    const cb = await creditos(beto.cookie);
    assert.deepEqual([cb.plan?.tipo, cb.listas.otras], ['fundador', 1]);
    assert.equal(((await (await req('/api/productos')).json()) as { fundadoresQuedan: number }).fundadoresQuedan, 20);
    // El admin ve los usos y los sats resignados.
    const lista = (await (await req('/api/admin/cupones', undefined, admin.cookie)).json()) as { cupones: Array<{ codigo: string; usados: number; satsResignados: string; porProducto: Record<string, number> }> };
    const mitad = lista.cupones.find((c) => c.codigo === 'MITAD');
    assert.deepEqual([mitad?.usados, mitad?.satsResignados, mitad?.porProducto], [1, '5250', { pack10: 1 }]);
    // Pausado: ya no se puede usar.
    assert.equal((await req('/api/admin/cupones/GRATIS100/activo', { activo: false }, admin.cookie)).status, 200);
    assert.equal(((await (await req('/api/cuenta/cupon/ver', { codigo: 'GRATIS100' }, ana.cookie)).json()) as { error: string }).error, 'cupon_invalido');
    // Consumo con el cobro activo: un regalo de Navidad usa primero los créditos de Navidad.
    await setChargingActive(sql, true);
    const g = deriveGift(masterRootFromMnemonic(MASTER), 0, 'es', signet);
    await req('/api/gifts', { direccion: g.address, idioma: 'es', ocasion: 'navidad', para: 'Tomi', mensaje: '', imagen: 1, moneda: 'SAT', monto: 30000, sats: '30000', indice: 0 }, ana.cookie);
    funded.add(g.address);
    const token = 't'.repeat(40);
    const tasks = createApp({ sql, chain, price, network: signet, tasksToken: token, accounts: { origins: [ORIGIN], publicUrl: ORIGIN, mailer: { send: async (m) => void mails.push(m) }, cookieSecure: true } });
    await tasks.request('/api/tareas/difusiones', { method: 'POST', headers: { 'x-tarea-token': token } });
    const ca = await creditos(ana.cookie);
    assert.deepEqual([ca.regalos.porOcasion, ca.regalos.pagos], [{ navidad: 2 }, 10]);
  });

  it('cupones para un mail y lotes: solo la cuenta de ese mail (aunque se cree después), CSV de mails, invitación pública', async () => {
    const admin = await signUp('admin@example.com');
    const ana = await signUp('ana@example.com');
    const canje = async (codigo: string, cookie: string) => {
      const r = await req('/api/cuenta/cupon', { codigo }, cookie);
      return [r.status, ((await r.json()) as { error?: string }).error ?? null];
    };
    // Para un mail: una vez, y solo esa cuenta.
    assert.equal((await req('/api/admin/cupones', { codigo: 'PARAANA', email: 'Ana@Example.com', da: { unidad: 'regalo', cantidad: 2 }, maxUsos: 50 }, admin.cookie)).status, 201);
    assert.equal((await req('/api/admin/cupones', { codigo: 'MALMAIL', email: 'no-es-un-mail', da: { unidad: 'regalo', cantidad: 2 }, maxUsos: 1 }, admin.cookie)).status, 400);
    assert.deepEqual(await canje('PARAANA', admin.cookie), [403, 'cupon_de_otra_cuenta']);
    assert.deepEqual(await canje('paraana', ana.cookie), [201, null]);
    // Lote por CSV: uno por mail (sin repetidos), de un solo uso; mails de quienes todavía no tienen cuenta.
    const lote = await req('/api/admin/cupones/lotes', { nombre: 'Amigos', prefijo: 'amigo', emails: ['zoe@example.com', 'ZOE@example.com', 'ana@example.com'], descuento: 20 }, admin.cookie);
    assert.equal(lote.status, 201);
    const { lote: id, cupones } = (await lote.json()) as { lote: string; cupones: Array<{ codigo: string; email: string }> };
    assert.equal(cupones.length, 2);
    assert.ok(cupones.every((c) => /^AMIGO[A-HJ-NP-Z2-9]{8}$/.test(c.codigo)));
    assert.equal((await req('/api/admin/cupones/lotes', { nombre: 'Malo', emails: ['zoe@example.com', 'x'], descuento: 20 }, admin.cookie)).status, 400);
    assert.equal((await req('/api/admin/cupones/lotes', { nombre: 'Demasiados', cantidad: 2001, descuento: 20 }, admin.cookie)).status, 400);
    // La invitación muestra qué da, sin decir para qué mail.
    const zoeCode = cupones.find((c) => c.email === 'zoe@example.com')!.codigo;
    const inv = (await (await req(`/api/invitacion/${zoeCode.toLowerCase()}`)).json()) as Record<string, unknown>;
    assert.deepEqual([inv.descuento, inv.paraUnMail, JSON.stringify(inv).includes('zoe')], [20, true, false]);
    assert.equal((await req('/api/invitacion/NOEXISTE')).status, 404);
    // Zoe se crea la cuenta después: el código ya es suyo.
    const zoe = await signUp('zoe@example.com');
    const ver = (await (await req('/api/cuenta/cupon/ver', { codigo: zoeCode, producto: 'pack10' }, zoe.cookie)).json()) as { precio?: string };
    assert.equal(ver.precio, '8400');
    assert.equal(((await (await req('/api/cuenta/cupon/ver', { codigo: zoeCode }, ana.cookie)).json()) as { error: string }).error, 'cupon_de_otra_cuenta');
    // Lote de códigos sueltos: cualquiera, una vez cada uno.
    const sueltos = (await (await req('/api/admin/cupones/lotes', { nombre: 'Feria', cantidad: 3, da: { unidad: 'regalo', cantidad: 1 } }, admin.cookie)).json()) as { lote: string; cupones: Array<{ codigo: string; email: null }> };
    assert.equal(new Set(sueltos.cupones.map((c) => c.codigo)).size, 3);
    assert.deepEqual(await canje(sueltos.cupones[0]!.codigo, ana.cookie), [201, null]);
    assert.deepEqual(await canje(sueltos.cupones[0]!.codigo, zoe.cookie), [409, 'cupon_agotado']);
    // El admin ve los lotes resumidos (no sus cupones en la lista) y baja el detalle para el CSV.
    const lista = (await (await req('/api/admin/cupones', undefined, admin.cookie)).json()) as { cupones: Array<{ codigo: string; email: string | null }>; lotes: Array<{ id: string; nombre: string; total: number; usados: number; conMail: number; descuento: number | null }> };
    assert.deepEqual(lista.cupones.map((c) => [c.codigo, c.email]), [['PARAANA', 'ana@example.com']]);
    assert.deepEqual(lista.lotes.map((l) => [l.nombre, l.total, l.usados, l.conMail]), [['Feria', 3, 1, 0], ['Amigos', 2, 0, 2]]);
    assert.equal(lista.lotes[1]!.descuento, 20);
    const detalle = (await (await req(`/api/admin/cupones/lotes/${sueltos.lote}`, undefined, admin.cookie)).json()) as { cupones: Array<{ usado: boolean }> };
    assert.equal(detalle.cupones.filter((c) => c.usado).length, 1);
    assert.equal((await req(`/api/admin/cupones/lotes/${id}`, undefined, ana.cookie)).status, 404);
    // Pausar el lote entero.
    assert.equal((await req(`/api/admin/cupones/lotes/${id}/activo`, { activo: false }, admin.cookie)).status, 200);
    assert.equal((await req(`/api/invitacion/${zoeCode}`)).status, 404);
  });

  it('link corto de un cupón: /c/K7M2P muestra el cupón, con su imagen en la vista previa', async () => {
    const admin = await signUp('admin@example.com');
    assert.equal((await req('/api/admin/cupones', { codigo: 'LABC2026HODL21', descuento: 21, hasta: '2026-12-01T03:00:00.000Z', maxUsos: 50 }, admin.cookie)).status, 201);
    assert.equal((await req('/api/admin/cupones', { codigo: 'PARAZOE', email: 'zoe@example.com', da: { unidad: 'regalo', cantidad: 2 }, maxUsos: 1 }, admin.cookie)).status, 201);
    const lista = (await (await req('/api/admin/cupones', undefined, admin.cookie)).json()) as { cupones: Array<{ codigo: string; corto: string }> };
    const corto = lista.cupones.find((c) => c.codigo === 'LABC2026HODL21')!.corto;
    assert.match(corto, /^[A-HJKMNP-Z2-9]{5}$/);
    assert.equal(new Set(lista.cupones.map((c) => c.corto)).size, 2);
    // En minúsculas también; dice el código (para dejarlo puesto en la compra) y hasta cuándo.
    const vista = (await (await req(`/api/c/${corto.toLowerCase()}`)).json()) as Record<string, unknown>;
    assert.deepEqual([vista.codigo, vista.descuento, vista.hasta, vista.paraUnMail], ['LABC2026HODL21', 21, '2026-12-01T03:00:00.000Z', false]);
    const zoe = (await (await req(`/api/c/${lista.cupones.find((c) => c.codigo === 'PARAZOE')!.corto}`)).json()) as Record<string, unknown>;
    assert.deepEqual([zoe.paraUnMail, JSON.stringify(zoe).includes('zoe@')], [true, false]);
    assert.equal((await req('/api/c/AAAAA')).status, 404);
    assert.equal((await req('/api/c/A0O1I')).status, 404);
    // Sin imagen, la del sitio; el admin sube la del cupón (solo JPEG) y la vista previa la usa.
    assert.equal((await req(`/api/c/${corto}/vista.jpg`)).headers.get('location'), `${ORIGIN}/og.jpg`);
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(3000, 7)]);
    assert.equal((await req('/api/admin/cupones/LABC2026HODL21/vista', { imagen: 'no' }, admin.cookie)).status, 400);
    const ana = await signUp('ana@example.com');
    assert.equal((await req('/api/admin/cupones/LABC2026HODL21/vista', { imagen: jpeg.toString('base64') }, ana.cookie)).status, 404);
    assert.equal((await req('/api/admin/cupones/NOEXISTE/vista', { imagen: jpeg.toString('base64') }, admin.cookie)).status, 404);
    assert.equal((await req('/api/admin/cupones/labc2026hodl21/vista', { imagen: jpeg.toString('base64') }, admin.cookie)).status, 204);
    const img = await req(`/api/c/${corto}/vista.jpg`);
    assert.equal(img.headers.get('content-type'), 'image/jpeg');
    assert.ok(Buffer.from(await img.arrayBuffer()).equals(jpeg));
    const html = await (await req(`/c/${corto}`)).text();
    assert.ok(html.includes('<title>Un cupón para Regalale Bitcoin</title>'), html);
    assert.ok(html.includes(`content="${ORIGIN}/api/c/${corto}/vista.jpg"`), html);
    assert.ok(html.includes('21 % de descuento en los packs'), html);
    // Uno que todavía no empezó (el de un evento): el link ya lo muestra, con su fecha; usarlo, todavía no.
    assert.equal((await req('/api/admin/cupones', { codigo: 'EVENTO', descuento: 10, desde: '2099-11-01T03:00:00.000Z', hasta: '2099-12-01T03:00:00.000Z', maxUsos: 5 }, admin.cookie)).status, 201);
    const evento = ((await (await req('/api/admin/cupones', undefined, admin.cookie)).json()) as { cupones: Array<{ codigo: string; corto: string; conVista: boolean }> }).cupones;
    const ev = evento.find((c) => c.codigo === 'EVENTO')!;
    assert.deepEqual([ev.conVista, evento.find((c) => c.codigo === 'LABC2026HODL21')!.conVista], [false, true]);
    const futuro = (await (await req(`/api/c/${ev.corto}`)).json()) as Record<string, unknown>;
    assert.deepEqual([futuro.codigo, futuro.desde], ['EVENTO', '2099-11-01T03:00:00.000Z']);
    assert.ok((await (await req(`/c/${ev.corto}`)).text()).includes('10 % de descuento'));
    assert.equal(((await (await req('/api/cuenta/cupon/ver', { codigo: 'EVENTO' }, ana.cookie)).json()) as { error: string }).error, 'cupon_no_empezo');
    // Logo de quien lo promueve: solo PNG, solo admins; cambia la vista previa (hay que volver a armarla).
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(500, 3)]);
    assert.equal((await req(`/api/c/${corto}/logo.png`)).status, 404);
    assert.equal((await req('/api/admin/cupones/LABC2026HODL21/logo', { imagen: jpeg.toString('base64') }, admin.cookie)).status, 400);
    assert.equal((await req('/api/admin/cupones/LABC2026HODL21/logo', { imagen: png.toString('base64') }, ana.cookie)).status, 404);
    assert.equal((await req('/api/admin/cupones/LABC2026HODL21/logo', { imagen: png.toString('base64') }, admin.cookie)).status, 204);
    const logo = await req(`/api/c/${corto.toLowerCase()}/logo.png`);
    assert.equal(logo.headers.get('content-type'), 'image/png');
    assert.ok(Buffer.from(await logo.arrayBuffer()).equals(png));
    assert.equal(((await (await req(`/api/c/${corto}`)).json()) as { conLogo: boolean }).conLogo, true);
    const conLogo = ((await (await req('/api/admin/cupones', undefined, admin.cookie)).json()) as { cupones: Array<{ codigo: string; conLogo: boolean; conVista: boolean }> }).cupones.find((c) => c.codigo === 'LABC2026HODL21')!;
    assert.deepEqual([conLogo.conLogo, conLogo.conVista], [true, false]);
    assert.equal((await req('/api/admin/cupones/LABC2026HODL21/logo', { imagen: null }, admin.cookie)).status, 204);
    assert.equal((await req(`/api/c/${corto}/logo.png`)).status, 404);
    // Pausado: la página es la de siempre (la web dice que ya no está vigente).
    assert.equal((await req('/api/admin/cupones/LABC2026HODL21/activo', { activo: false }, admin.cookie)).status, 200);
    assert.equal((await req(`/api/c/${corto}`)).status, 404);
    assert.equal(await (await req(`/c/${corto}`)).text(), INDEX_HTML);
  });

  it('admins desde el panel: con passkey se suma y se quita; los fijos no se quitan; todos reciben aviso', async () => {
    const admin = await signUp('admin@example.com');
    const bea = await signUp('bea@example.com');
    assert.equal((await req('/api/admin/cobro', undefined, bea.cookie)).status, 404);
    // Con link de mail no alcanza.
    await req('/api/cuenta/link', { email: 'admin@example.com' });
    const token = /#acceso=([A-Za-z0-9_-]{43})/.exec(mails.at(-1)?.text ?? '')?.[1] as string;
    const viaLink = cookieOf(await req('/api/cuenta/link/canje', { token }));
    assert.equal((await req('/api/admin/admins', { email: 'bea@example.com' }, viaLink)).status, 403);
    mails = [];
    assert.equal((await req('/api/admin/admins', { email: ' Bea@Example.com ' }, admin.cookie)).status, 201);
    assert.deepEqual(mails.map((m) => m.to).sort(), ['admin@example.com', 'bea@example.com']);
    assert.equal((await req('/api/admin/cobro', undefined, bea.cookie)).status, 200);
    assert.equal((await req('/api/admin/admins', { email: 'bea@example.com' }, admin.cookie)).status, 409);
    const lista = (await (await req('/api/admin/admins', undefined, bea.cookie)).json()) as { fijos: string[]; agregados: Array<{ email: string; agregadoPor: string }> };
    assert.deepEqual(lista.fijos, ['admin@example.com']);
    assert.deepEqual(lista.agregados.map((a) => [a.email, a.agregadoPor]), [['bea@example.com', 'admin@example.com']]);
    // Un fijo no se quita desde el panel; uno agregado, sí.
    assert.equal((await req('/api/admin/admins/quitar', { email: 'admin@example.com' }, bea.cookie)).status, 409);
    assert.equal((await req('/api/admin/admins/quitar', { email: 'bea@example.com' }, admin.cookie)).status, 200);
    assert.equal((await req('/api/admin/cobro', undefined, bea.cookie)).status, 404);
    const registro = await sql<{ accion: string }[]>`select accion from registro_admin order by id`;
    assert.deepEqual(registro.map((r) => r.accion).filter((a) => a.startsWith('admin_')), ['admin_agregado', 'admin_quitado']);
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
    assert.equal((await req('/api/admin/producto', { producto: 'anual', regalos: 40, listas: 4, dias: null, cupo: null }, admin.cookie)).status, 200);
    assert.equal((await req('/api/admin/producto', { producto: 'fundador', regalos: null, listas: 10, dias: null, cupo: 5 }, admin.cookie)).status, 200);
    assert.equal((await req('/api/admin/producto', { producto: 'pack10', regalos: null, listas: 0, dias: null, cupo: null }, admin.cookie)).status, 400);
    assert.equal((await req('/api/admin/producto', { producto: 'pack10', regalos: 12, listas: 0, dias: 30, cupo: null }, admin.cookie)).status, 400);
    const prods = (await get()).productos as unknown as Array<{ codigo: string; regalos: number | null; listas: number; dias: number | null; cupo: number | null }>;
    assert.deepEqual(prods.find((p) => p.codigo === 'anual'), { codigo: 'anual', precioSats: '42000', activo: true, plan: null, regalos: 40, listas: 4, dias: null, cupo: null });
    assert.equal(((await get()) as unknown as { fundadoresQuedan: number }).fundadoresQuedan, 5);
    assert.equal((await req('/api/admin/ajuste', { email: 'ana@example.com', unidad: 'regalo', cantidad: 3, motivo: 'x' }, admin.cookie)).status, 400);
    assert.equal((await req('/api/admin/ajuste', { email: 'ana@example.com', unidad: 'regalo', cantidad: 3, motivo: 'Regalo por ayudar con las pruebas' }, admin.cookie)).status, 200);
    const c = (await (await req('/api/cuenta/creditos', undefined, ana.cookie)).json()) as { regalos: { pagos: number }; admin: boolean; conSaludo: boolean };
    assert.equal(c.regalos.pagos, 3);
    assert.equal(c.admin, false);
    assert.equal(c.conSaludo, false);
    // El ajuste devuelve lo que quedó, y el admin puede ver qué tiene cualquier cuenta.
    const otro = (await (await req('/api/admin/ajuste', { email: 'ANA@example.com ', unidad: 'lista_otras', cantidad: 2, motivo: 'Pruebas de listas' }, admin.cookie)).json()) as {
      cuenta: { email: string; regalos: { pagos: number }; listas: { otras: number }; movimientos: Array<{ motivo: string | null }> };
    };
    assert.equal(otro.cuenta.email, 'ana@example.com');
    assert.equal(otro.cuenta.regalos.pagos, 3);
    assert.equal(otro.cuenta.listas.otras, 2);
    assert.equal(otro.cuenta.movimientos[0]?.motivo, 'Pruebas de listas');
    const fichaAna = (await (await req('/api/admin/cuenta?email=ana%40example.com', undefined, viaLink)).json()) as { admin: boolean; conPlan: boolean };
    assert.deepEqual([fichaAna.admin, fichaAna.conPlan], [false, true]);
    assert.equal((await req('/api/admin/cuenta?email=nadie%40example.com', undefined, admin.cookie)).status, 404);
    assert.equal((await req('/api/admin/ajuste', { email: 'nadie@example.com', unidad: 'regalo', cantidad: 1, motivo: 'No existe' }, admin.cookie)).status, 404);
    assert.equal((await req('/api/admin/cuenta?email=admin%40example.com', undefined, ana.cookie)).status, 404);
    // El admin tiene todo activado y libre, aunque el cobro esté activo (Claudia, 22/10).
    const yo = (await (await req('/api/cuenta/creditos', undefined, admin.cookie)).json()) as { admin: boolean; conPlan: boolean; conSaludo: boolean; puedeRegalar: boolean };
    assert.deepEqual([yo.admin, yo.conPlan, yo.conSaludo, yo.puedeRegalar], [true, true, true, true]);
    // La lista de cuentas y la de entregas (Claudia, 23/10): solo admins.
    const lista = (await (await req('/api/admin/usuarios', undefined, viaLink)).json()) as { total: number; usuarios: Array<{ email: string; admin: boolean; saldoRegalos: number; saldoListas: number }> };
    assert.equal(lista.total, 2);
    const fila = lista.usuarios.find((u) => u.email === 'ana@example.com');
    assert.deepEqual([fila?.admin, fila?.saldoRegalos, fila?.saldoListas], [false, 8, 2]);
    assert.equal(lista.usuarios.find((u) => u.email === 'admin@example.com')?.admin, true);
    const buscada = (await (await req('/api/admin/usuarios?q=ANA', undefined, admin.cookie)).json()) as { usuarios: Array<{ email: string }> };
    assert.deepEqual(buscada.usuarios.map((u) => u.email), ['ana@example.com']);
    assert.equal((await req('/api/admin/usuarios', undefined, ana.cookie)).status, 404);
    const entregas = (await (await req('/api/admin/entregas', undefined, admin.cookie)).json()) as { entregas: Array<{ email: string; cantidad: number; motivo: string | null }> };
    assert.deepEqual(entregas.entregas.map((e) => [e.email, e.cantidad, e.motivo]), [['ana@example.com', 2, 'Pruebas de listas'], ['ana@example.com', 3, 'Regalo por ayudar con las pruebas']]);
    assert.equal((await req('/api/admin/entregas', undefined, ana.cookie)).status, 404);
    assert.deepEqual((await get()).registro.map((r) => r.accion).slice(0, 5), ['ajuste', 'ajuste', 'producto', 'producto', 'precio']);
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
    // Un Hodler sin usar se puede devolver: se quitan sus créditos.
    const e = await buy('anual');
    const codigoPlan = ((await (await req('/api/cuenta/arrepentimiento', { pago: e.id, direccion: devolucion }, ana.cookie)).json()) as { codigo: string }).codigo;
    await req(`/api/admin/arrepentimiento/${codigoPlan}/devuelto`, {}, admin.cookie);
    assert.equal(((await (await req('/api/cuenta/creditos', undefined, ana.cookie)).json()) as { plan: unknown }).plan, null);
  });
});
