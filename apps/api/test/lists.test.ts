import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, before, beforeEach, describe, it } from 'node:test';
import { accountKeyText, deriveListAddress, getNetwork, masterRootFromMnemonic, parseAccountKey } from '@regalale/core';
import { createAccount, createSession } from '../src/accounts.ts';
import { createApp } from '../src/app.ts';
import type { AddressStats, ChainClient, FeeRates, MempoolPayment, PriceClient, Utxo } from '../src/chain.ts';
import { connect, migrate, type Sql } from '../src/db.ts';
import { RESERVATION_MS, splitPurchase } from '../src/lists.ts';

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
let mails: Array<{ to: string; subject: string; text: string }> = [];

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
    await sql`delete from denuncias`;
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
      adminEmails: ['admin@example.com'],
      accounts: { origins: [ORIGIN], publicUrl: ORIGIN, mailer: { send: async (m) => void mails.push(m) }, cookieSecure: true },
    });
    const account = await createAccount(sql, { email: 'ana@example.com', lang: 'es', credential: { id: randomBytes(16).toString('base64url'), publicKey: randomBytes(65), alg: -7, signCount: 0, vault: null } });
    cookie = `__session=${await createSession(sql, account.id, 'passkey')}`;
    mails = [];
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

  it('transferencias por país: dato de cobro cifrado (el servidor no lo ve), moneda de la lista, código único, tanda en la unidad menor', async () => {
    assert.equal((await newList({ pais: 'BR' })).status, 400, 'sin compromiso de convertir');
    assert.equal((await newList({ pais: 'BR', moneda: 'ARS', convertir: true })).status, 400, 'Brasil es en reales');
    assert.equal((await newList({ pais: 'XX', convertir: true })).status, 400, 'en «Otro» hay que elegir moneda');
    const plain = (await (await newList()).json()) as { id: string };
    assert.equal(((await (await req(`/api/listas/${plain.id}`, undefined, false)).json()) as { aceptaTransferencias: boolean }).aceptaTransferencias, false);
    assert.equal((await req(`/api/listas/${plain.id}/transferencias`, { monto: '5000' }, false)).status, 404);

    const { id } = (await (await newList({ pais: 'BR', convertir: true })).json()) as { id: string };
    // Hasta que llega el dato cifrado, no acepta transferencias.
    assert.equal((await req(`/api/listas/${id}/transferencias`, { monto: '5000' }, false)).status, 404);
    const COBRO = `v1.${'I'.repeat(16)}.${'C'.repeat(80)}`;
    const CLAVE = `v1.${'J'.repeat(16)}.${'K'.repeat(80)}`;
    const cobro = (body: unknown, withCookie = true) => req(`/api/cuenta/listas/${id}/cobro`, body, withCookie);
    assert.equal((await cobro({ pais: 'BR', cobro: COBRO }, false)).status, 401);
    assert.equal((await cobro({ pais: 'BR', cobro: 'alias.en.claro' })).status, 400, 'solo se acepta el cifrado');
    assert.equal((await cobro({ pais: 'BR', cobro: COBRO, clave: CLAVE })).status, 200);
    const pub = (await (await req(`/api/listas/${id}`, undefined, false)).json()) as Record<string, unknown>;
    assert.deepEqual([pub.aceptaTransferencias, pub.pais, pub.moneda], [true, 'BR', 'BRL']);
    assert.ok(!JSON.stringify(pub).includes(COBRO), 'el cifrado se entrega recién al anunciar');
    assert.equal((await req(`/api/listas/${id}/transferencias`, { monto: 10.5 }, false)).status, 400, 'en centavos, como texto');
    const t1 = (await (await req(`/api/listas/${id}/transferencias`, { nombre: 'Tio Beto', mensaje: 'Parabéns', monto: '25000000' }, false)).json()) as {
      codigo: string; cobro: string; alias: null; moneda: string; token: string;
    };
    const t2 = (await (await req(`/api/listas/${id}/transferencias`, { monto: '1500050' }, false)).json()) as { codigo: string; token: string };
    assert.match(t1.codigo, /^RB-[A-Z2-9]{4}$/);
    assert.notEqual(t1.codigo, t2.codigo);
    assert.deepEqual([t1.cobro, t1.alias, t1.moneda], [COBRO, null, 'BRL']);

    const mine = async (token: string) => (await (await req('/api/aportes/consulta', { token }, false)).json()) as { tipo: string; estado: string; monto: string; moneda: string; cobro: string; satsConvertidos: string | null };
    assert.deepEqual(await mine(t1.token).then((m) => [m.tipo, m.estado, m.monto, m.moneda, m.cobro]), ['transferencia', 'anunciada', '25000000', 'BRL', COBRO]);

    const mark = (codigo: string, body: unknown, withCookie = true) => req(`/api/cuenta/listas/${id}/transferencias/${codigo}`, body, withCookie);
    assert.equal((await mark(t1.codigo, { estado: 'recibida' }, false)).status, 401);
    assert.equal((await mark(t1.codigo, { estado: 'recibida' })).status, 200);
    assert.equal((await mark(t1.codigo, { estado: 'convertida', sats: '2100' })).status, 400);
    const tanda = (body: unknown) => req(`/api/cuenta/listas/${id}/tanda`, body);
    assert.equal((await tanda({ codigos: [t1.codigo, t2.codigo], sats: '1000' })).status, 409, 'una todavía no se recibió');
    assert.equal((await mark(t2.codigo, { estado: 'recibida' })).status, 200);
    // R$ 250.000 y R$ 15.000,50: 1.000.001 sats repartidos en proporción, sin perder ninguno.
    assert.equal((await tanda({ codigos: [t1.codigo, t2.codigo], sats: '1000001' })).status, 200);
    const [m1, m2] = await Promise.all([mine(t1.token), mine(t2.token)]);
    assert.deepEqual([m1.estado, m1.satsConvertidos, m2.satsConvertidos], ['convertida', '943395', '56606']);
    assert.equal((await tanda({ codigos: [t1.codigo], sats: '5000' })).status, 409, 'una convertida no se vuelve a repartir');
    // Con transferencias, la moneda ya no cambia.
    assert.equal((await cobro({ pais: 'EU', cobro: COBRO })).status, 409);

    const panel = (await (await req('/api/cuenta/listas')).json()) as { listas: Array<{ id: string; cobro: string; claveCifrada: string; moneda: string; transferencias: Array<{ codigo: string; monto: string; estado: string }> }> };
    const l = panel.listas.find((x) => x.id === id);
    assert.deepEqual([l?.cobro, l?.claveCifrada, l?.moneda], [COBRO, CLAVE, 'BRL']);
    assert.deepEqual(l?.transferencias.map((x) => [x.codigo, x.monto, x.estado]), [[t1.codigo, '25000000', 'convertida'], [t2.codigo, '1500050', 'convertida']]);
  });

  it('panel del dueño (handoff 21/10): «No me llegó», volver a avisar, corregir y deshacer una compra, totales separados', async () => {
    const { id } = (await (await newList({ pais: 'AR', convertir: true })).json()) as { id: string };
    await req(`/api/cuenta/listas/${id}/cobro`, { pais: 'AR', cobro: `v1.${'I'.repeat(16)}.${'C'.repeat(80)}` });
    const announce = async (monto: string) => (await (await req(`/api/listas/${id}/transferencias`, { monto }, false)).json()) as { codigo: string; token: string };
    const [a, b, c] = [await announce('3000000'), await announce('1000000'), await announce('500000')];
    const mark = (codigo: string, estado: string) => req(`/api/cuenta/listas/${id}/transferencias/${codigo}`, { estado });
    type Mine = { estado: string; satsConvertidos: string | null; noLlego: string | null; avisosQuedan: number; nota: string | null; compra: { id: string; corregida: string | null } | null };
    const mine = async (token: string) => (await (await req('/api/aportes/consulta', { token }, false)).json()) as Mine;
    type Panel = { totales: { bitcoin: string; satsComprados: string; anunciado: string; sinConvertir: string }; compras: Array<{ id: string; sats: string; corregida: string | null; transferencias: string[]; historial: Array<{ accion: string; satsAntes: string | null; sats: string | null }> }> };
    const panel = async () => ((await (await req('/api/cuenta/listas')).json()) as { listas: Array<Panel & { id: string }> }).listas.find((l) => l.id === id) as Panel;

    // «No me llegó»: no suma en ningún total; el invitado lo ve y puede volver a avisar con una nota.
    assert.equal((await mark(c.codigo, 'no_llego')).status, 200);
    assert.deepEqual((await panel()).totales, { bitcoin: '0', satsComprados: '0', anunciado: '4000000', sinConvertir: '0' });
    const m0 = await mine(c.token);
    assert.equal(m0.estado, 'no_llego');
    assert.ok(m0.noLlego !== null);
    assert.equal(m0.avisosQuedan, 3);
    assert.equal((await req('/api/aportes/reaviso', { token: c.token, nota: 'x'.repeat(141) }, false)).status, 400);
    assert.equal((await req('/api/aportes/reaviso', { token: c.token, nota: 'Salió el 12/11 a las 18:40' }, false)).status, 200);
    assert.deepEqual(await mine(c.token).then((m) => [m.estado, m.nota, m.avisosQuedan]), ['anunciada', 'Salió el 12/11 a las 18:40', 2]);
    assert.equal((await req('/api/aportes/reaviso', { token: c.token }, false)).status, 409, 'solo después de un «No me llegó»');
    for (let i = 0; i < 2; i++) {
      await mark(c.codigo, 'no_llego');
      assert.equal((await req('/api/aportes/reaviso', { token: c.token }, false)).status, 200);
    }
    await mark(c.codigo, 'no_llego');
    assert.equal((await req('/api/aportes/reaviso', { token: c.token }, false)).status, 409, 'hasta 3 veces');
    // Si la plata aparece tarde, pasa de «no llegó» a recibida directamente.
    assert.equal((await mark(c.codigo, 'recibida')).status, 200);

    // La compra queda como registro; los totales no mezclan cadena con lo declarado.
    await mark(a.codigo, 'recibida');
    await mark(b.codigo, 'recibida');
    assert.equal((await req(`/api/cuenta/listas/${id}/tanda`, { codigos: [a.codigo, b.codigo], sats: '40000' })).status, 200);
    let p = await panel();
    assert.deepEqual(p.totales, { bitcoin: '0', satsComprados: '40000', anunciado: '0', sinConvertir: '500000' });
    const compra = p.compras[0] as Panel['compras'][number];
    assert.deepEqual(compra.transferencias.sort(), [a.codigo, b.codigo].sort());
    assert.deepEqual(await mine(a.token).then((m) => [m.satsConvertidos, m.compra?.corregida]), ['30000', null]);

    // Corregir: se vuelve a repartir, deja historial y el invitado ve la fecha de corrección.
    const fix = (sats: string, cid = compra.id) => req(`/api/cuenta/listas/${id}/compras/${cid}/corregir`, { sats });
    assert.equal((await fix('1')).status, 400, 'al menos un sat por transferencia');
    assert.equal((await fix('48000')).status, 200);
    assert.deepEqual(await mine(a.token).then((m) => m.satsConvertidos), '36000');
    assert.ok((await mine(b.token)).compra?.corregida !== null);
    p = await panel();
    assert.equal(p.totales.satsComprados, '48000');
    assert.deepEqual((p.compras[0] as Panel['compras'][number]).historial.map((h) => [h.accion, h.satsAntes, h.sats]), [['creada', null, '40000'], ['corregida', '40000', '48000']]);

    // Deshacer: las transferencias vuelven a recibida y la compra deja de contar.
    assert.equal((await req(`/api/cuenta/listas/${id}/compras/${compra.id}/deshacer`, {})).status, 200);
    assert.deepEqual(await mine(a.token).then((m) => [m.estado, m.satsConvertidos, m.compra]), ['recibida', null, null]);
    p = await panel();
    assert.deepEqual(p.totales, { bitcoin: '0', satsComprados: '0', anunciado: '0', sinConvertir: '4500000' });
    assert.equal(p.compras.length, 0);
    assert.equal((await fix('1000')).status, 404, 'una compra deshecha no se corrige');
    const [h] = await sql<{ n: string }[]>`select count(*) as n from compras_historial where accion = 'deshecha'`;
    assert.equal(h?.n, '1');
    // Otra cuenta no puede tocar la compra.
    assert.equal((await req(`/api/cuenta/listas/${id}/compras/abc/corregir`, { sats: '10' })).status, 404);
  });

  it('denuncias: la primera pausa y oculta los datos; el dueño reactiva una vez; la siguiente la deja en revisión; el admin decide', async () => {
    const { id } = (await (await newList({ pais: 'AR', convertir: true })).json()) as { id: string };
    await req(`/api/cuenta/listas/${id}/cobro`, { pais: 'AR', cobro: `v1.${'I'.repeat(16)}.${'C'.repeat(80)}` });
    const t = (await (await req(`/api/listas/${id}/transferencias`, { monto: '100000' }, false)).json()) as { token: string; codigo: string };
    const report = (email: string, motivo = 'El alias no es de los novios', ip = '203.0.113.7') =>
      app.request(`/api/listas/${id}/denuncias`, { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN, 'x-forwarded-for': ip }, body: JSON.stringify({ email, motivo }) });
    const pub = async () => (await (await req(`/api/listas/${id}`, undefined, false)).json()) as { estado: string; aceptaTransferencias: boolean };
    assert.equal((await report('no-es-mail')).status, 400);
    assert.equal((await report('tia@example.com', '')).status, 400);
    // 1. Primera denuncia: pausa en el acto; no se puede aportar ni ver el dato; mail al dueño sin el mail de quien denunció.
    assert.equal((await report('Tia@Example.com')).status, 201);
    assert.deepEqual(await pub().then((p) => [p.estado, p.aceptaTransferencias]), ['pausada', false]);
    assert.equal((await aporte(id)).status, 409);
    assert.equal((await req(`/api/listas/${id}/transferencias`, { monto: '5000' }, false)).status, 409);
    const mine = (await (await req('/api/aportes/consulta', { token: t.token }, false)).json()) as { estado: string; cobro: string | null; listaPausada: boolean; codigo: string };
    assert.deepEqual([mine.estado, mine.cobro, mine.listaPausada, mine.codigo], ['anunciada', null, true, t.codigo], 'el aporte anunciado sigue, sin el dato de cobro');
    assert.equal(mails.length, 1);
    assert.equal(mails[0]?.to, 'ana@example.com');
    assert.ok(mails[0]?.text.includes('El alias no es de los novios') && !mails[0]?.text.includes('tia@example.com'));
    assert.equal((await report('tia@example.com')).status, 409, 'una denuncia por mail y por lista');
    const panel = async () =>
      ((await (await req('/api/cuenta/listas')).json()) as { listas: Array<{ id: string; estado: string; puedeReactivar: boolean; denuncias: Array<{ motivo: string; email?: string }> }> }).listas.find((x) => x.id === id);
    const p1 = await panel();
    assert.deepEqual([p1?.estado, p1?.puedeReactivar, p1?.denuncias.map((d) => d.motivo), p1?.denuncias[0]?.email], ['pausada', true, ['El alias no es de los novios'], undefined]);
    // 2. El dueño la reactiva una sola vez.
    assert.equal((await req(`/api/cuenta/listas/${id}/reactivar`, {}, false)).status, 401);
    assert.equal((await req(`/api/cuenta/listas/${id}/reactivar`, {})).status, 200);
    assert.equal((await pub()).estado, 'activa');
    // 3. Otra denuncia después de reactivar: en revisión; el dueño ya no puede reactivarla.
    assert.equal((await report('primo@example.com', 'Sigue raro', '203.0.113.8')).status, 201);
    assert.equal((await pub()).estado, 'en_revision');
    assert.equal((await req(`/api/cuenta/listas/${id}/reactivar`, {})).status, 409);
    assert.ok(mails[1]?.text.includes('revisa nuestro equipo'));
    // Admin: ve las denuncias con el mail de quien denunció (no el dato de cobro) y decide, con passkey.
    const adminAccount = await createAccount(sql, { email: 'admin@example.com', lang: 'es', credential: { id: randomBytes(16).toString('base64url'), publicKey: randomBytes(65), alg: -7, signCount: 0, vault: null } });
    const adminCookie = `__session=${await createSession(sql, adminAccount.id, 'passkey')}`;
    const adminReq = (path: string, body?: unknown, ck = adminCookie) =>
      app.request(path, { method: body === undefined ? 'GET' : 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN, cookie: ck }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    assert.equal((await adminReq('/api/admin/denuncias', undefined, cookie)).status, 404);
    const list = (await (await adminReq('/api/admin/denuncias')).json()) as { listas: Array<{ id: string; estado: string; dueno: string; denuncias: Array<{ email: string }> }> };
    assert.deepEqual([list.listas[0]?.id, list.listas[0]?.estado, list.listas[0]?.dueno, list.listas[0]?.denuncias.map((d) => d.email)], [id, 'en_revision', 'ana@example.com', ['tia@example.com', 'primo@example.com']]);
    assert.ok(!JSON.stringify(list).includes('CCCC'), 'el admin no ve el dato de cobro');
    const linkCookie = `__session=${await createSession(sql, adminAccount.id, 'link')}`;
    assert.equal((await adminReq(`/api/admin/denuncias/${id}`, { accion: 'baja' }, linkCookie)).status, 403);
    assert.equal((await adminReq(`/api/admin/denuncias/${id}`, { accion: 'baja' })).status, 200);
    assert.equal((await req(`/api/listas/${id}`, undefined, false)).status, 404);
    assert.equal((await adminReq(`/api/admin/denuncias/${id}`, { accion: 'reactivar' })).status, 200);
    assert.equal((await pub()).estado, 'activa');
  });

  it('listas viejas con alias en claro: siguen funcionando; al volver a cargar el dato, el alias se borra', async () => {
    const { id } = (await (await newList()).json()) as { id: string };
    await sql`update listas set alias = 'ana.leo.mp', alias_titular = 'Ana Pérez', pais = 'AR', moneda = 'ARS' where id = ${id}`;
    const t = (await (await req(`/api/listas/${id}/transferencias`, { monto: '4000050' }, false)).json()) as { alias: string; titular: string; cobro: null; moneda: string };
    assert.deepEqual([t.alias, t.titular, t.cobro, t.moneda], ['ana.leo.mp', 'Ana Pérez', null, 'ARS']);
    assert.equal((await req(`/api/cuenta/listas/${id}/cobro`, { pais: 'AR', cobro: `v1.${'I'.repeat(16)}.${'C'.repeat(80)}` })).status, 200);
    const [row] = await sql<{ alias: string | null; alias_titular: string | null }[]>`select alias, alias_titular from listas where id = ${id}`;
    assert.deepEqual([row?.alias, row?.alias_titular], [null, null]);
  });
});

describe('compra en tanda: reparto', () => {
  it('reparte en proporción a los montos y la suma da exacto', () => {
    assert.deepEqual(splitPurchase(100n, [100n, 100n, 100n]), [34n, 33n, 33n]);
    assert.deepEqual(splitPurchase(10n, [1n]), [10n]);
    assert.deepEqual(splitPurchase(1000n, [300n, 100n]), [750n, 250n]);
  });
});
