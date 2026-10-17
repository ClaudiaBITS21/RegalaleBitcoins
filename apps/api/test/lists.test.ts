import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, before, beforeEach, describe, it } from 'node:test';
import { accountKeyText, deriveListAddress, getNetwork, masterRootFromMnemonic, parseAccountKey } from '@regalale/core';
import { createAccount, createSession } from '../src/accounts.ts';
import { createApp } from '../src/app.ts';
import type { AddressStats, ChainClient, FeeRates, MempoolPayment, PriceClient, Utxo } from '../src/chain.ts';
import { connect, migrate, type Sql } from '../src/db.ts';
import { RESERVATION_MS } from '../src/lists.ts';

const DB = process.env.DATABASE_URL_TEST ?? 'postgres://regalale:regalale@127.0.0.1:5432/regalale_test';
const ORIGIN = 'https://regalale.test';
const signet = getNetwork('signet');
const MASTER = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const VPUB = accountKeyText(masterRootFromMnemonic(MASTER), signet);
const addr = (i: number) => deriveListAddress(parseAccountKey(VPUB, signet), i).address;

/** Cadena falsa: cuánto llegó a cada dirección. */
class Chain implements ChainClient {
  funded = new Map<string, { confirmed: bigint; mempool: bigint }>();
  async addressStats(address: string): Promise<AddressStats> {
    const f = this.funded.get(address);
    const c = f?.confirmed ?? 0n;
    const m = f?.mempool ?? 0n;
    return { confirmedFunded: c, confirmedSpent: 0n, mempoolFunded: m, mempoolSpent: 0n, txCount: c + m > 0n ? 1 : 0 };
  }
  async addressUtxos(): Promise<Utxo[]> {
    return [];
  }
  async mempoolPayments(): Promise<MempoolPayment[]> {
    return [];
  }
  async txHex(): Promise<string> {
    throw new Error('no');
  }
  async broadcast(): Promise<string> {
    throw new Error('no');
  }
  async fees(): Promise<FeeRates> {
    return { fastest: 2, halfHour: 1, hour: 1, economy: 1, minimum: 1 };
  }
}

const price: PriceClient = { btcUsd: async () => 100_000 };
let sql: Sql;
let chain: Chain;
let app: ReturnType<typeof createApp>;
let cookie: string;

const req = (path: string, body?: unknown, withCookie = true) =>
  app.request(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN, ...(withCookie ? { cookie } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

const newList = (extra: Record<string, unknown> = {}) =>
  req('/api/listas', { titulo: 'Casamiento de Ana y Leo', ocasion: 'casamiento', mensaje: '¡Gracias!', idioma: 'es', xpub: VPUB, primeraDireccion: addr(0), ...extra });

// 10 USD = 10.000 sats a USD 100.000.
const aporte = (id: string, extra: Record<string, unknown> = {}) =>
  req(`/api/listas/${id}/aportes`, { nombre: 'Tía Marta', mensaje: 'Felicidades', moneda: 'USD', monto: 10, sats: '10000', ...extra }, false);

describe('listas de regalos', () => {
  before(async () => {
    sql = connect(DB);
    await migrate(sql);
  });
  after(async () => {
    await sql.end();
  });
  beforeEach(async () => {
    await sql`delete from transferencias`;
    await sql`delete from aportes`;
    await sql`delete from listas`;
    await sql`delete from usuarios`;
    chain = new Chain();
    app = createApp({
      sql,
      chain,
      price,
      network: signet,
      ceilingUsd: 20,
      listContributionsPerHour: 50,
      accounts: { origins: [ORIGIN], publicUrl: ORIGIN, mailer: { send: async () => {} }, cookieSecure: true },
    });
    const account = await createAccount(sql, { email: 'ana@example.com', lang: 'es', credential: { id: randomBytes(16).toString('base64url'), publicKey: randomBytes(65), alg: -7, signCount: 0, vault: null } });
    cookie = `__session=${await createSession(sql, account.id)}`;
  });

  it('crear: hace falta sesión, una vpub válida y confirmar la primera dirección', async () => {
    assert.equal((await req('/api/listas', { xpub: VPUB }, false)).status, 401);
    assert.equal((await newList({ primeraDireccion: addr(1) })).status, 400);
    const bad = await newList({ xpub: 'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs' });
    assert.equal(((await bad.json()) as { detalle: string }).detalle, 'xpub_red');
    const ok = await newList();
    assert.equal(ok.status, 201);
    const { id } = (await ok.json()) as { id: string };
    const pub = (await (await req(`/api/listas/${id}`, undefined, false)).json()) as Record<string, unknown>;
    assert.equal(pub.titulo, 'Casamiento de Ana y Leo');
    assert.equal(pub.topeUsd, null);
    assert.ok(!JSON.stringify(pub).includes(VPUB), 'la página pública no muestra la llave');
  });

  it('cada invitado recibe una dirección nueva de la llave; ve solo su aporte; quien armó la lista ve todo', async () => {
    const { id } = (await (await newList()).json()) as { id: string };
    const a = (await (await aporte(id)).json()) as { direccion: string; token: string };
    const b = (await (await aporte(id, { nombre: 'Primo Juan', monto: 5, sats: '5000' })).json()) as { direccion: string; token: string };
    assert.deepEqual([a.direccion, b.direccion], [addr(0), addr(1)]);
    chain.funded.set(a.direccion, { confirmed: 10_000n, mempool: 0n });
    const mine = (await (await req('/api/aportes/consulta', { token: a.token }, false)).json()) as Record<string, unknown>;
    assert.equal(mine.estado, 'recibido');
    assert.equal(mine.nombre, 'Tía Marta');
    assert.ok(!JSON.stringify(mine).includes('Primo Juan'), 'un invitado no ve a los demás');
    assert.equal((await req('/api/aportes/consulta', { token: 'x'.repeat(43) }, false)).status, 404);
    const panel = (await (await req('/api/cuenta/listas')).json()) as { listas: Array<{ xpub: string; totalRecibido: string; aportes: Array<{ nombre: string; estado: string }> }> };
    assert.equal(panel.listas[0]?.totalRecibido, '10000');
    assert.equal(panel.listas[0]?.xpub, VPUB);
    assert.deepEqual(panel.listas[0]?.aportes.map((x) => [x.nombre, x.estado]), [['Tía Marta', 'recibido'], ['Primo Juan', 'esperando']]);
  });

  it('tope por aporte solo en listas de semilla nueva; mínimo de 1.000 sats en todas', async () => {
    const seeded = (await (await newList({ semilla: true })).json()) as { id: string };
    assert.equal(((await (await req(`/api/listas/${seeded.id}`)).json()) as { topeUsd: number | null }).topeUsd, 20);
    assert.equal((await aporte(seeded.id, { monto: 25, sats: '25000' })).status, 422);
    assert.equal((await aporte(seeded.id, { moneda: 'SAT', monto: 500, sats: '500' })).status, 422);
    assert.equal((await aporte(seeded.id, { monto: 20, sats: '20000' })).status, 201);
    // Billetera propia (cold wallet): sin tope. (Misma llave de prueba: se limpian los aportes anteriores.)
    await sql`delete from aportes`;
    const own = (await (await newList()).json()) as { id: string };
    assert.equal(((await (await req(`/api/listas/${own.id}`)).json()) as { topeUsd: number | null }).topeUsd, null);
    assert.equal((await aporte(own.id, { monto: 150, sats: '150000' })).status, 201);
    assert.equal((await aporte(own.id, { moneda: 'SAT', monto: 500, sats: '500' })).status, 422);
  });

  it('una dirección abandonada se recicla solo si nunca recibió nada; una usada afuera se saltea', async () => {
    const { id } = (await (await newList()).json()) as { id: string };
    const first = (await (await aporte(id)).json()) as { token: string };
    await sql`update aportes set creado = ${new Date(Date.now() - RESERVATION_MS - 1000)}`;
    const again = (await (await aporte(id, { nombre: 'Otro' })).json()) as { direccion: string };
    assert.equal(again.direccion, addr(0), 'reusa el índice 0 abandonado');
    assert.equal((await req('/api/aportes/consulta', { token: first.token }, false)).status, 404);
    // El índice 1 ya tiene movimientos fuera de la lista: se saltea.
    chain.funded.set(addr(1), { confirmed: 1n, mempool: 0n });
    const next = (await (await aporte(id, { nombre: 'Tercero' })).json()) as { direccion: string };
    assert.equal(next.direccion, addr(2));
    const panel = (await (await req('/api/cuenta/listas')).json()) as { listas: Array<{ aportes: Array<{ nombre: string }> }> };
    assert.deepEqual(panel.listas[0]?.aportes.map((x) => x.nombre), ['Otro', 'Tercero']);
  });

  it('una lista cerrada no acepta aportes; solo la cierra quien la armó', async () => {
    const { id } = (await (await newList()).json()) as { id: string };
    assert.equal((await req(`/api/cuenta/listas/${id}/cerrar`, {}, false)).status, 401);
    assert.equal((await req(`/api/cuenta/listas/${id}/cerrar`, {})).status, 200);
    assert.equal((await aporte(id)).status, 409);
  });

  it('mazo de ejemplos: para quién es, una o varias personas, y un turno distinto por invitado', async () => {
    const { id } = (await (await newList({ para: 'Ana y Juan', varios: true })).json()) as { id: string };
    const pub = (await (await req(`/api/listas/${id}`)).json()) as { para: string; varios: boolean };
    assert.equal(pub.para, 'Ana y Juan');
    assert.equal(pub.varios, true);
    const turns = [];
    for (let i = 0; i < 3; i++) turns.push(((await (await req(`/api/listas/${id}/ejemplo`, {})).json()) as { turno: number }).turno);
    assert.deepEqual(turns, [0, 1, 2]);
    assert.equal((await req('/api/listas/nada/ejemplo', {})).status, 404);
  });

  it('pesos: alias con compromiso de convertir; código único por invitado; solo quien armó la lista marca el estado', async () => {
    assert.equal((await newList({ alias: 'ana.leo.mp', aliasTitular: 'Ana Pérez' })).status, 400, 'sin compromiso de convertir');
    assert.equal((await newList({ alias: 'no vale!', aliasTitular: 'Ana', convertir: true })).status, 400);
    const plain = (await (await newList()).json()) as { id: string };
    assert.equal(((await (await req(`/api/listas/${plain.id}`, undefined, false)).json()) as { aceptaPesos: boolean }).aceptaPesos, false);
    assert.equal((await req(`/api/listas/${plain.id}/transferencias`, { monto: 5000 }, false)).status, 404);

    const { id } = (await (await newList({ alias: 'Ana.Leo.MP', aliasTitular: 'Ana Pérez', convertir: true })).json()) as { id: string };
    const pub = (await (await req(`/api/listas/${id}`, undefined, false)).json()) as Record<string, unknown>;
    assert.equal(pub.aceptaPesos, true);
    assert.ok(!JSON.stringify(pub).includes('ana.leo.mp'), 'el alias se muestra recién al elegir pesos');
    assert.equal((await req(`/api/listas/${id}/transferencias`, { monto: 10.123 }, false)).status, 400);
    const t1 = (await (await req(`/api/listas/${id}/transferencias`, { nombre: 'Tío Beto', mensaje: 'Felicidades', monto: 250000 }, false)).json()) as { codigo: string; alias: string; titular: string; token: string };
    const t2 = (await (await req(`/api/listas/${id}/transferencias`, { monto: 15000.5 }, false)).json()) as { codigo: string; token: string };
    assert.match(t1.codigo, /^RB-[A-Z2-9]{4}$/);
    assert.notEqual(t1.codigo, t2.codigo);
    assert.deepEqual([t1.alias, t1.titular], ['ana.leo.mp', 'Ana Pérez']);

    const mine = async (token: string) => (await (await req('/api/aportes/consulta', { token }, false)).json()) as { tipo: string; estado: string; satsConvertidos: string | null; montoArs: number };
    assert.deepEqual(await mine(t1.token).then((m) => [m.tipo, m.estado, m.montoArs]), ['pesos', 'anunciada', 250000]);

    const mark = (codigo: string, body: unknown, withCookie = true) => req(`/api/cuenta/listas/${id}/transferencias/${codigo}`, body, withCookie);
    assert.equal((await mark(t1.codigo, { estado: 'recibida' }, false)).status, 401);
    assert.equal((await mark(t1.codigo, { estado: 'recibida' })).status, 200);
    assert.equal((await mark(t1.codigo, { estado: 'convertida' })).status, 400, 'convertida pide los sats');
    assert.equal((await mark(t1.codigo, { estado: 'convertida', sats: '2100' })).status, 200);
    assert.deepEqual(await mine(t1.token).then((m) => [m.estado, m.satsConvertidos]), ['convertida', '2100']);
    assert.equal((await mine(t2.token)).estado, 'anunciada');

    const panel = (await (await req('/api/cuenta/listas')).json()) as { listas: Array<{ id: string; alias: string; transferencias: Array<{ codigo: string; nombre: string | null; estado: string }> }> };
    const l = panel.listas.find((x) => x.id === id);
    assert.equal(l?.alias, 'ana.leo.mp');
    assert.deepEqual(l?.transferencias.map((x) => [x.codigo, x.nombre, x.estado]), [[t1.codigo, 'Tío Beto', 'convertida'], [t2.codigo, null, 'anunciada']]);
  });
});
