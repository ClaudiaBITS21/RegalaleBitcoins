import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import {
  deriveGift,
  deriveGiftSecrets,
  deriveMultisigGift,
  getNetwork,
  masterRootFromMnemonic,
  openGiftWallet,
  parseDestination,
  parseRecoveryKey,
  planSweep,
  recoveryKeyText,
  signSweep,
} from '@regalale/core';
import { advancedRecoveryEnabled, createApp, verifySweep } from '../src/app.ts';
import { ApiError } from '../src/errors.ts';
import { processPending } from '../src/broadcaster.ts';
import { type AddressStats, arsPriceClient, ChainError, type ChainClient, type FeeRates, type MempoolPayment, type PriceClient, type Utxo } from '../src/chain.ts';
import { connect, migrate, type Sql } from '../src/db.ts';
import { findGift, insertGift } from '../src/gifts.ts';
import { makeFundingTx } from '../../../packages/core/test/helpers.ts';

const DB = process.env.DATABASE_URL_TEST ?? 'postgres://regalale:regalale@127.0.0.1:5432/regalale_test';
const signet = getNetwork('signet');
const MASTER = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const secrets = deriveGiftSecrets(masterRootFromMnemonic(MASTER), 0, 'es');
const wallet = openGiftWallet(secrets.entropy, secrets.passphraseWords, 'es', signet);
const destination = parseDestination('tb1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3q0sl5k7', signet);

/** Cadena falsa en memoria: lo que respondería mempool.space. */
class FakeChain implements ChainClient {
  utxos: Utxo[] = [];
  raw = new Map<string, string>();
  mempoolFunded = 0n;
  broadcasts: string[] = [];
  rejectBroadcast: ChainError | null = null;
  mempool: MempoolPayment[] = [];
  feeRates: FeeRates = { fastest: 5, halfHour: 3, hour: 2, economy: 1, minimum: 1 };

  fund(amount: bigint, confirmed = true, salt = 1): void {
    const f = makeFundingTx([{ script: wallet.script, amount }], salt);
    this.raw.set(f.txid, f.rawTx);
    this.utxos.push({ txid: f.txid, vout: 0, value: amount, confirmed });
  }
  async addressStats(): Promise<AddressStats> {
    const sum = (c: boolean) => this.utxos.filter((u) => u.confirmed === c).reduce((a, u) => a + u.value, 0n);
    const confirmed = sum(true);
    return { confirmedFunded: confirmed, confirmedSpent: 0n, mempoolFunded: sum(false) + this.mempoolFunded, mempoolSpent: 0n, txCount: this.utxos.length };
  }
  async mempoolPayments(): Promise<MempoolPayment[]> {
    return [...this.mempool];
  }
  async addressUtxos(): Promise<Utxo[]> {
    return [...this.utxos];
  }
  async txHex(txid: string): Promise<string> {
    const hex = this.raw.get(txid);
    if (hex === undefined) throw new ChainError('no existe', 404);
    return hex;
  }
  async broadcast(hex: string): Promise<string> {
    if (this.rejectBroadcast !== null) throw this.rejectBroadcast;
    this.broadcasts.push(hex);
    const { inspectTransaction } = await import('@regalale/core');
    const { txid } = inspectTransaction(hex);
    this.raw.set(txid, hex); // queda en la mempool
    return txid;
  }
  async fees(): Promise<FeeRates> {
    return this.feeRates;
  }
}

const price: PriceClient = { btcUsd: async () => 100_000 };

let sql: Sql;
let chain: FakeChain;
let app: ReturnType<typeof createApp>;
let giftId: string;

async function signedSweep(feeRate: number): Promise<{ hex: string; txid: string }> {
  const res = await app.request(`/api/gifts/${giftId}/utxos`);
  const { utxos } = (await res.json()) as { utxos: Array<{ txid: string; vout: number; rawTx: string }> };
  const plan = planSweep({ network: signet, utxos, giftScript: wallet.script, destination, feeRate });
  return signSweep(plan, wallet);
}

const post = (path: string, body: unknown) =>
  app.request(path, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });

describe('API del reclamo', () => {
  before(async () => {
    sql = connect(DB);
    await sql`drop table if exists compras_historial, compras, denuncias, vinculos, bovedas_extra, cupon_usos, cupones_vistas, cupones_logos, cupones, cupon_lotes, admins, vistas, arrepentimientos, registro_admin, pagos, movimientos, planes, productos, ajustes, transferencias, aportes, listas, imagenes, difusiones, regalos, enlaces, desafios, sesiones, credenciales, usuarios, migraciones cascade`;
    await sql`drop function if exists movimientos_sin_cambios()`;
    await sql`drop function if exists nuevo_corto_cupon()`;
    await migrate(sql);
  });
  after(async () => {
    await sql.end();
  });
  beforeEach(async () => {
    await sql`delete from difusiones`;
    await sql`delete from regalos`;
    chain = new FakeChain();
    app = createApp({ sql, chain, price, network: signet });
    const gift = await insertGift(sql, {
      network: 'signet',
      address: wallet.address,
      lang: 'es',
      occasion: 'cumple',
      to: 'Tomi',
      from: 'Rodo',
      message: 'Los verdaderos amigos son escasos. Bitcoin también.',
      currency: 'USD',
      amount: 25,
      usdPerBtc: 80_000,
    });
    giftId = gift.id;
  });

  it('id con formato válido y 404 para regalos inexistentes', async () => {
    assert.match(giftId, /^[A-Za-z0-9_-]{22}$/);
    assert.equal((await app.request('/api/gifts/AAAAAAAAAAAAAAAAAAAAAA')).status, 404);
    assert.equal((await app.request('/api/gifts/no-es-un-id')).status, 404);
  });

  it('estados según la cadena: esperando → en la red → activo', async () => {
    const estado = async () => ((await (await app.request(`/api/gifts/${giftId}`)).json()) as { estado: string }).estado;
    assert.equal(await estado(), 'esperando');
    chain.fund(50_000n, false);
    assert.equal(await estado(), 'en_la_red');
    chain.utxos = chain.utxos.map((u) => ({ ...u, confirmed: true }));
    assert.equal(await estado(), 'activo');
  });

  it('muestra la tarjeta, montos y cotizaciones, y nunca secretos', async () => {
    chain.fund(50_000n);
    const res = await app.request(`/api/gifts/${giftId}`);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    const body = (await res.json()) as Record<string, unknown>;
    assert.equal(body.para, 'Tomi');
    assert.equal(body.idioma, 'es');
    assert.deepEqual(body.sats, { confirmados: '50000', sinConfirmar: '0', esperados: null });
    assert.deepEqual(body.original, { moneda: 'USD', monto: 25, usdPorBtc: 80_000 });
    assert.equal(body.usdPorBtcHoy, 100_000);
    const text = JSON.stringify(body);
    for (const w of secrets.passphraseWords) assert.ok(!text.includes(` ${w} `));
  });

  it('entrega solo UTXO confirmados con su transacción completa', async () => {
    chain.fund(50_000n, true, 1);
    chain.fund(7_000n, false, 2);
    const { utxos } = (await (await app.request(`/api/gifts/${giftId}/utxos`)).json()) as { utxos: Array<{ rawTx: string }> };
    assert.equal(utxos.length, 1);
    assert.match(utxos[0]?.rawTx ?? '', /^[0-9a-f]+$/);
  });

  it('reclamo ahora: verifica el barrido, lo difunde y marca el regalo', async () => {
    chain.fund(50_000n);
    const sweep = await signedSweep(3);
    const res = await post(`/api/gifts/${giftId}/claim`, { hex: sweep.hex, modo: 'ahora' });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { txid: sweep.txid, estado: 'reclamado' });
    assert.deepEqual(chain.broadcasts, [sweep.hex]);
    const gift = await findGift(sql, giftId);
    assert.equal(gift?.claimTxid, sweep.txid);
    const again = await post(`/api/gifts/${giftId}/claim`, { hex: sweep.hex, modo: 'ahora' });
    assert.equal(again.status, 409);
  });

  it('un reclamo que la red olvidó (expulsado de la mempool) se libera para firmar otra vez', async () => {
    chain.fund(50_000n);
    const sweep = await signedSweep(3);
    assert.equal((await post(`/api/gifts/${giftId}/claim`, { hex: sweep.hex, modo: 'ahora' })).status, 200);
    // La red expulsa el barrido de la mempool y los fondos siguen en el regalo.
    chain.raw.delete(sweep.txid);
    const utxos = await app.request(`/api/gifts/${giftId}/utxos`);
    assert.equal(utxos.status, 200);
    assert.equal((await findGift(sql, giftId))?.claimTxid, null);
    // Si la red sí la conoce, el regalo sigue reclamado.
    assert.equal((await post(`/api/gifts/${giftId}/claim`, { hex: sweep.hex, modo: 'ahora' })).status, 200);
    assert.equal((await app.request(`/api/gifts/${giftId}/utxos`)).status, 409);
  });

  it('rechaza transacciones que no son un barrido completo del regalo', async () => {
    chain.fund(50_000n, true, 1);
    const sweep = await signedSweep(3);
    // Llegó otro pago confirmado después de firmar: el barrido ya no es completo.
    chain.fund(10_000n, true, 2);
    assert.equal((await post(`/api/gifts/${giftId}/claim`, { hex: sweep.hex, modo: 'ahora' })).status, 409);
    assert.equal((await post(`/api/gifts/${giftId}/claim`, { hex: 'zz', modo: 'ahora' })).status, 422);
    assert.equal((await post(`/api/gifts/${giftId}/claim`, { hex: sweep.hex, modo: 'ya' })).status, 400);
    assert.equal(chain.broadcasts.length, 0);
  });

  it('regla 3 (docs/operacion.md): el barrido tiene una sola salida; con dos se rechaza y no se difunde', async () => {
    chain.fund(50_000n, true, 1);
    const sweep = await signedSweep(3);
    // Mismo barrido firmado, con la salida repetida: una salida más para «otro».
    const h = sweep.hex;
    const outStart = 12 + 2 + 82; // versión + marca segwit, cantidad de entradas, la única entrada
    const scriptLen = parseInt(h.slice(outStart + 2 + 16, outStart + 2 + 18), 16);
    const output = h.slice(outStart + 2, outStart + 2 + 16 + 2 + scriptLen * 2);
    const twoOutputs = `${h.slice(0, outStart)}02${output}${output}${h.slice(outStart + 2 + output.length)}`;
    assert.throws(() => verifySweep(twoOutputs, chain.utxos), (e: unknown) => e instanceof ApiError && e.code === 'transaccion_invalida' && /una sola salida/.test(e.message));
    assert.equal((await post(`/api/gifts/${giftId}/claim`, { hex: twoOutputs, modo: 'ahora' })).status, 422);
    assert.equal(chain.broadcasts.length, 0);
  });

  it('una transacción ajena no se difunde', async () => {
    chain.fund(50_000n);
    const other = makeFundingTx([{ script: destination.script, amount: 1_000n }], 9);
    assert.equal((await post(`/api/gifts/${giftId}/claim`, { hex: other.rawTx, modo: 'ahora' })).status, 422);
    assert.equal(chain.broadcasts.length, 0);
  });

  it('si la red rechaza la difusión, el regalo no queda marcado', async () => {
    chain.fund(50_000n);
    const sweep = await signedSweep(3);
    chain.rejectBroadcast = new ChainError('min relay fee not met', 400);
    assert.equal((await post(`/api/gifts/${giftId}/claim`, { hex: sweep.hex, modo: 'ahora' })).status, 422);
    assert.equal((await findGift(sql, giftId))?.claimTxid, null);
  });

  it('esperar a que baje: guarda el barrido y lo difunde cuando la red lo acepta', async () => {
    chain.fund(50_000n);
    chain.feeRates = { fastest: 20, halfHour: 15, hour: 10, economy: 8, minimum: 5 };
    const sweep = await signedSweep(2);
    const res = await post(`/api/gifts/${giftId}/claim`, { hex: sweep.hex, modo: 'esperar' });
    assert.equal(res.status, 202);
    const estado = async () => ((await (await app.request(`/api/gifts/${giftId}`)).json()) as { estado: string }).estado;
    assert.equal(await estado(), 'reclamo_programado');
    assert.deepEqual(await processPending({ sql, chain, network: signet }), { difundidas: 0, canceladas: 0 });
    chain.feeRates = { fastest: 3, halfHour: 2, hour: 2, economy: 1, minimum: 1 };
    assert.deepEqual(await processPending({ sql, chain, network: signet }), { difundidas: 1, canceladas: 0 });
    assert.equal(await estado(), 'reclamado');
    assert.deepEqual(chain.broadcasts, [sweep.hex]);
  });

  it('esperar a que baje: se cancela si los fondos se movieron', async () => {
    chain.fund(50_000n);
    chain.feeRates = { fastest: 20, halfHour: 15, hour: 10, economy: 8, minimum: 5 };
    const sweep = await signedSweep(2);
    await post(`/api/gifts/${giftId}/claim`, { hex: sweep.hex, modo: 'esperar' });
    chain.utxos = [];
    assert.deepEqual(await processPending({ sql, chain, network: signet }), { difundidas: 0, canceladas: 1 });
  });

  it('tareas programadas: solo con el token correcto', async () => {
    const token = 'x'.repeat(40);
    const withToken = createApp({ sql, chain, price, network: signet, tasksToken: token });
    const call = (t?: string) =>
      withToken.request('/api/tareas/difusiones', { method: 'POST', headers: t === undefined ? {} : { 'x-tarea-token': t } });
    assert.equal((await call()).status, 401);
    assert.equal((await call('y'.repeat(40))).status, 401);
    assert.equal((await call(token)).status, 200);
    // Sin token configurado, el endpoint queda cerrado.
    assert.equal((await app.request('/api/tareas/difusiones', { method: 'POST', headers: { 'x-tarea-token': token } })).status, 401);
  });

  it('si la cadena no responde: 502 sin detalles internos', async () => {
    chain.addressStats = async () => {
      throw new ChainError('caído');
    };
    const res = await app.request(`/api/gifts/${giftId}`);
    assert.equal(res.status, 502);
    assert.deepEqual(await res.json(), { error: 'cadena_no_disponible' });
  });

  it('el pago trabado por comisión baja se avisa', async () => {
    const body = async () => (await (await app.request(`/api/gifts/${giftId}`)).json()) as { estado: string; pagoTrabado: boolean };
    chain.fund(50_000n, false);
    chain.mempool = [{ txid: 'a'.repeat(64), feeRate: 3, value: 50_000n }];
    assert.equal((await body()).pagoTrabado, false);
    chain.mempool = [{ txid: 'a'.repeat(64), feeRate: 0.5, value: 50_000n }];
    assert.deepEqual(await body(), { ...(await body()), estado: 'en_la_red', pagoTrabado: true });
  });
});

describe('API para regalar', () => {
  const root = masterRootFromMnemonic(MASTER);
  const nuevo = (index: number, extra: Record<string, unknown> = {}) => ({
    direccion: deriveGift(root, index, 'pt', signet).address,
    idioma: 'pt',
    ocasion: 'navidad',
    para: 'Ana',
    de: 'Rodo',
    mensaje: 'Feliz Navidad 🎄',
    imagen: 2,
    moneda: 'USD',
    monto: 25,
    sats: '25000', // USD 25 a USD 100.000 por bitcoin
    ...extra,
  });

  before(async () => {
    sql = connect(DB);
    await migrate(sql);
  });
  after(async () => {
    await sql.end();
  });
  beforeEach(async () => {
    await sql`delete from difusiones`;
    await sql`delete from regalos`;
    chain = new FakeChain();
    app = createApp({ sql, chain, price, arsPrice: { btcArs: async () => ({ price: 160_000_000, source: 'criptoya' as const }) }, network: signet, createLimitPerHour: 8, advancedRecovery: true });
  });

  it('crea el regalo con la cotización del servidor y lo muestra esperando el pago', async () => {
    const res = await post('/api/gifts', nuevo(1));
    assert.equal(res.status, 201);
    const { id } = (await res.json()) as { id: string };
    const gift = await findGift(sql, id);
    assert.equal(gift?.address, deriveGift(root, 1, 'pt', signet).address);
    assert.equal(gift?.usdPerBtc, 100_000);
    assert.equal(gift?.satsExpected, 25_000n);
    assert.equal(gift?.message, 'Feliz Navidad 🎄');
    const view = (await (await app.request(`/api/gifts/${id}`)).json()) as { estado: string; sats: { esperados: string } };
    assert.equal(view.estado, 'esperando');
    assert.equal(view.sats.esperados, '25000');
  });

  it('recupero avanzado: regalo multifirma 1-de-2 con su script de testigo; el servidor lo valida', async () => {
    const walletRoot = masterRootFromMnemonic('legal winner thank year wave sausage worth useful legal winner thank yellow');
    const key = parseRecoveryKey(recoveryKeyText(walletRoot, signet), signet);
    const ms = deriveMultisigGift(root, 2, 'pt', signet, key);
    const ruta = `${key.fingerprintHex}/48h/1h/0h/2h/0/2`;
    const testigo = Buffer.from(ms.witnessScript).toString('hex');
    // Sin script, una P2WSH no se acepta; con el script de otro regalo, tampoco.
    assert.equal((await post('/api/gifts', nuevo(2, { direccion: ms.address }))).status, 400);
    const other = deriveMultisigGift(root, 3, 'pt', signet, key);
    assert.equal((await post('/api/gifts', nuevo(2, { direccion: ms.address, testigo: Buffer.from(other.witnessScript).toString('hex'), rutaRecupero: ruta }))).status, 400);
    assert.equal((await post('/api/gifts', nuevo(2, { direccion: ms.address, testigo, rutaRecupero: 'x' }))).status, 400);
    const res = await post('/api/gifts', nuevo(2, { direccion: ms.address, testigo, rutaRecupero: ruta }));
    assert.equal(res.status, 201);
    const { id } = (await res.json()) as { id: string };
    const view = (await (await app.request(`/api/gifts/${id}`)).json()) as { direccion: string; testigo: string };
    assert.deepEqual([view.direccion, view.testigo], [ms.address, testigo]);
    const plain = (await (await post('/api/gifts', nuevo(4))).json()) as { id: string };
    assert.equal(((await (await app.request(`/api/gifts/${plain.id}`)).json()) as { testigo: unknown }).testigo, null);
    assert.equal(((await (await app.request('/api/salud')).json()) as { recuperoAvanzado: boolean }).recuperoAvanzado, true);
  });

  it('recupero avanzado guardado: apagado salvo pedido en redes de prueba; en mainnet, apagado siempre', async () => {
    const mainnet = getNetwork('mainnet', { allowMainnet: true });
    assert.equal(advancedRecoveryEnabled(mainnet, true), false);
    assert.equal(advancedRecoveryEnabled(signet), false);
    assert.equal(advancedRecoveryEnabled(signet, true), true);
    const off = createApp({ sql, chain, price, network: signet });
    assert.equal(((await (await off.request('/api/salud')).json()) as { recuperoAvanzado: boolean }).recuperoAvanzado, false);
    const walletRoot = masterRootFromMnemonic('legal winner thank year wave sausage worth useful legal winner thank yellow');
    const key = parseRecoveryKey(recoveryKeyText(walletRoot, signet), signet);
    const ms = deriveMultisigGift(root, 5, 'pt', signet, key);
    const res = await off.request('/api/gifts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(nuevo(5, { direccion: ms.address, testigo: Buffer.from(ms.witnessScript).toString('hex'), rutaRecupero: `${key.fingerprintHex}/48h/1h/0h/2h/0/5` })) });
    assert.equal(res.status, 403);
  });

  it('la misma dirección no se registra dos veces: el navegador prueba el índice siguiente', async () => {
    assert.equal((await post('/api/gifts', nuevo(1))).status, 201);
    const again = await post('/api/gifts', nuevo(1));
    assert.equal(again.status, 409);
    assert.deepEqual(await again.json(), { error: 'regalo_existente', detalle: 'regalo_existente' });
  });

  it('vista previa del link: la imagen del regalo y «Un regalo para …» en /r/<id>, sin datos de la clave', async () => {
    const INDEX = '<!doctype html><html><head><title>Regalale Bitcoin</title><meta property="og:title" content="Regalale Bitcoin" /><meta property="og:description" content="x" /><meta property="og:image" content="https://ejemplo.test/og.jpg" /><meta property="og:image:alt" content="x" /></head><body><div id="app"></div></body></html>';
    const share = createApp({ sql, chain, price, network: signet, createLimitPerHour: 8, accounts: { origins: ['https://ejemplo.test'], publicUrl: 'https://ejemplo.test', mailer: { send: async () => undefined }, cookieSecure: true }, indexHtml: async () => INDEX });
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(3000, 9)]);
    const req = (body: unknown) => share.request('/api/gifts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    // Solo JPEG.
    assert.equal((await req(nuevo(7, { vista: Buffer.from('<svg/>'.repeat(300)).toString('base64') }))).status, 400);
    const res = await req(nuevo(7, { para: 'Ana <3', vista: jpeg.toString('base64') }));
    assert.equal(res.status, 201);
    const { id } = (await res.json()) as { id: string };
    const img = await share.request(`/api/gifts/${id}/vista.jpg`);
    assert.deepEqual([img.status, img.headers.get('content-type')], [200, 'image/jpeg']);
    assert.ok(Buffer.from(await img.arrayBuffer()).equals(jpeg));
    const page = await share.request(`/r/${id}`);
    const html = await page.text();
    assert.equal(page.status, 200);
    assert.ok(html.includes(`<meta property="og:image" content="https://ejemplo.test/api/gifts/${id}/vista.jpg" />`), html);
    assert.ok(html.includes('<title>Um presente para Ana &lt;3</title>'), 'en el idioma del regalo y escapado');
    assert.ok(html.includes('<div id="app"></div>'), 'es la misma web');
    assert.ok(page.headers.get('content-security-policy')?.includes("default-src 'self'"));
    // Sin imagen propia para compartir, la general; un id que no existe, la web tal cual.
    const sin = (await (await req(nuevo(8))).json()) as { id: string };
    assert.ok((await (await share.request(`/r/${sin.id}`)).text()).includes('content="https://ejemplo.test/og.jpg"'));
    assert.equal((await share.request(`/api/gifts/${sin.id}/vista.jpg`)).headers.get('location'), 'https://ejemplo.test/og.jpg');
    assert.equal(await (await share.request('/r/AAAAAAAAAAAAAAAAAAAAAA')).text(), INDEX);
  });

  it('estilos: dibujo por defecto, elegido, o imagen propia validada y servida como archivo inerte', async () => {
    const plain = (await (await post('/api/gifts', nuevo(1))).json()) as { id: string };
    assert.equal(((await (await app.request(`/api/gifts/${plain.id}`)).json()) as { estilo: string }).estilo, 'ilustracion');
    assert.equal((await post('/api/gifts', nuevo(2, { estilo: 'mano' }))).status, 201);
    assert.equal((await post('/api/gifts', nuevo(3, { estilo: 'cualquiera' }))).status, 400);
    // Imagen propia: firma WebP real, nada de SVG ni de imagen sin el estilo.
    const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 '), Buffer.alloc(200, 7)]);
    const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg">${'<g/>'.repeat(40)}</svg>`);
    assert.equal((await post('/api/gifts', nuevo(4, { estilo: 'propia' }))).status, 400);
    assert.equal((await post('/api/gifts', nuevo(4, { estilo: 'propia', imagenPropia: svg.toString('base64') }))).status, 400);
    assert.equal((await post('/api/gifts', nuevo(4, { estilo: 'propia', imagenPropia: Buffer.alloc(700_000, 1).toString('base64') }))).status, 400);
    const own = await post('/api/gifts', nuevo(4, { estilo: 'propia', imagenPropia: webp.toString('base64') }));
    assert.equal(own.status, 201);
    const { id } = (await own.json()) as { id: string };
    const img = await app.request(`/api/gifts/${id}/imagen`);
    assert.equal(img.status, 200);
    assert.equal(img.headers.get('content-type'), 'image/webp');
    assert.equal(img.headers.get('x-content-type-options'), 'nosniff');
    assert.match(img.headers.get('content-security-policy') ?? '', /sandbox/);
    assert.deepEqual(Buffer.from(await img.arrayBuffer()), webp);
    assert.equal((await app.request(`/api/gifts/${plain.id}/imagen`)).status, 404);
  });

  it('una dirección con movimientos previos cuenta como usada (base perdida o restaurada)', async () => {
    chain.fund(1_000n);
    const res = await post('/api/gifts', nuevo(1));
    assert.equal(res.status, 409);
    assert.equal(((await res.json()) as { error: string }).error, 'regalo_existente');
  });

  it('montos: en sats, mínimo de la red, techo y coherencia con los dólares', async () => {
    assert.equal((await post('/api/gifts', nuevo(1, { moneda: 'SAT', monto: 30_000, sats: '30000' }))).status, 201);
    const status = async (extra: Record<string, unknown>) => (await post('/api/gifts', nuevo(2, extra))).status;
    assert.equal(await status({ moneda: 'SAT', monto: 300, sats: '300' }), 422); // no alcanza para barrerlo
    assert.equal(await status({ monto: 150, sats: '150000' }), 422); // supera USD 100
    assert.equal(await status({ monto: 25, sats: '50000' }), 422); // sats de otro monto
    assert.equal(await status({ moneda: 'SAT', monto: 30_000, sats: '31000' }), 422);
    assert.equal(await status({ sats: '25000.5' }), 400);
    assert.equal(await status({ sats: 25000 }), 400);
    assert.equal(await status({ moneda: 'EUR' }), 400);
  });

  it('valida la tarjeta: largos, ocasión, imagen, idioma y dirección de la red', async () => {
    const status = async (extra: Record<string, unknown>) => (await post('/api/gifts', nuevo(3, extra))).status;
    assert.equal(await status({ para: '' }), 400);
    assert.equal(await status({ para: 'x'.repeat(31) }), 400);
    assert.equal(await status({ de: 'x'.repeat(31) }), 400);
    assert.equal(await status({ mensaje: 'x'.repeat(281) }), 400);
    assert.equal(await status({ mensaje: '🎄'.repeat(280) }), 201); // se cuentan caracteres, no bytes
    assert.equal(await status({ ocasion: 'condolencias' }), 400);
    assert.equal(await status({ ocasion: 'otra', ocasionLibre: 'x'.repeat(41) }), 400);
    assert.equal(await status({ imagen: 5 }), 400);
    assert.equal(await status({ idioma: 'fr' }), 400);
    assert.equal(await status({ direccion: 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu' }), 400); // mainnet
    assert.equal(await status({ direccion: 'tb1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3q0sl5k7' }), 400); // no es P2WPKH
    assert.equal((await app.request('/api/gifts', { method: 'POST', body: 'no es json' })).status, 400);
  });

  it('ocasión del catálogo nuevo y ocasión libre', async () => {
    const res = await post('/api/gifts', nuevo(7, { ocasion: 'otra', ocasionLibre: 'Mudanza de Ana' }));
    assert.equal(res.status, 201);
    const { id } = (await res.json()) as { id: string };
    const view = (await (await app.request(`/api/gifts/${id}`)).json()) as { ocasion: string; ocasionLibre: string | null };
    assert.deepEqual([view.ocasion, view.ocasionLibre], ['otra', 'Mudanza de Ana']);
    assert.equal((await post('/api/gifts', nuevo(8, { ocasion: 'pizzaday', ocasionLibre: 'ignorado' }))).status, 201);
    const pizza = await sql<{ ocasion_libre: string | null }[]>`select ocasion_libre from regalos where ocasion = 'pizzaday'`;
    assert.equal(pizza[0]?.ocasion_libre, null);
  });

  it('limita cuántos regalos crea una misma IP', async () => {
    const from = (ip: string, i: number) =>
      app.request('/api/gifts', {
        method: 'POST',
        body: JSON.stringify(nuevo(i)),
        headers: { 'content-type': 'application/json', 'x-forwarded-for': `${ip}, 10.0.0.1` },
      });
    for (let i = 0; i < 8; i++) assert.equal((await from('1.2.3.4', 10 + i)).status, 201);
    assert.equal((await from('1.2.3.4', 20)).status, 429);
    assert.equal((await from('5.6.7.8', 21)).status, 201);
  });

  it('precio para la web', async () => {
    assert.deepEqual(await (await app.request('/api/precio')).json(), { usdPorBtc: 100_000, fuenteUsd: 'mempool.space', arsPorBtc: 160_000_000, fuenteArs: 'criptoya' });
  });

  it('regalo en pesos: los sats tienen que corresponder a la cotización BTC/ARS', async () => {
    // $ 40.000 a $ 160.000.000 por bitcoin = 25.000 sats.
    assert.equal((await post('/api/gifts', nuevo(4, { moneda: 'ARS', monto: 40_000, sats: '25000' }))).status, 201);
    assert.equal((await post('/api/gifts', nuevo(5, { moneda: 'ARS', monto: 40_000, sats: '40000' }))).status, 422);
    const sinPesos = createApp({ sql, chain, price, network: signet });
    const res = await sinPesos.request('/api/gifts', {
      method: 'POST',
      body: JSON.stringify(nuevo(6, { moneda: 'ARS', monto: 40_000, sats: '25000' })),
      headers: { 'content-type': 'application/json' },
    });
    assert.equal(res.status, 422);
    assert.deepEqual(await (await sinPesos.request('/api/precio')).json(), { usdPorBtc: 100_000, fuenteUsd: 'mempool.space', arsPorBtc: null, fuenteArs: null });
  });
});

describe('Cotización BTC/ARS', () => {
  const NOW = 1_800_000_000_000;
  const criptoya = (quotes: Record<string, { totalAsk: number; time: number }>) => quotes;
  const bitso = (ask: string) => ({ success: true, payload: { book: 'btc_ars', ask } });
  const fake = (responses: Record<string, unknown>): typeof fetch =>
    (async (url: string | URL | Request) => {
      const body = responses[String(url)];
      return body === undefined ? new Response('caído', { status: 503 }) : Response.json(body);
    }) as typeof fetch;
  const urls = { criptoya: 'https://cy/btc/ars', bitso: 'https://bitso/ticker' };
  const t = NOW / 1000;

  it('mediana del precio final de compra de los exchanges locales, controlada con Bitso', async () => {
    const client = arsPriceClient(
      urls,
      fake({
        [urls.criptoya]: criptoya({ a: { totalAsk: 100, time: t }, b: { totalAsk: 110, time: t }, c: { totalAsk: 105, time: t }, viejo: { totalAsk: 999, time: t - 3600 } }),
        [urls.bitso]: bitso('104'),
      }),
      60_000,
      () => NOW,
    );
    assert.deepEqual(await client.btcArs(), { price: 105, source: 'criptoya' });
  });

  it('si las fuentes no coinciden, no cotiza; si falta una, usa la otra', async () => {
    const three = criptoya({ a: { totalAsk: 100, time: t }, b: { totalAsk: 100, time: t }, c: { totalAsk: 100, time: t } });
    await assert.rejects(arsPriceClient(urls, fake({ [urls.criptoya]: three, [urls.bitso]: bitso('150') }), 0, () => NOW).btcArs());
    assert.deepEqual(await arsPriceClient(urls, fake({ [urls.bitso]: bitso('150') }), 0, () => NOW).btcArs(), { price: 150, source: 'bitso' });
    assert.deepEqual(await arsPriceClient(urls, fake({ [urls.criptoya]: three }), 0, () => NOW).btcArs(), { price: 100, source: 'criptoya' });
    // Con menos de 3 cotizaciones frescas, CriptoYa no alcanza.
    const two = criptoya({ a: { totalAsk: 100, time: t }, b: { totalAsk: 100, time: t } });
    await assert.rejects(arsPriceClient(urls, fake({ [urls.criptoya]: two }), 0, () => NOW).btcArs());
    await assert.rejects(arsPriceClient(urls, fake({}), 0, () => NOW).btcArs());
  });
});
