import { timingSafeEqual } from 'node:crypto';
import { addressFromScript, isCoreError, isLang, inspectTransaction, type InspectedTx, minimumGiftAmount, type Network, parseDestination } from '@regalale/core';
import { Hono } from 'hono';
import { type ArsPriceClient, ChainError, type ChainClient, type PriceClient, type Utxo } from './chain.ts';
import type { Sql } from './db.ts';
import { processPending } from './broadcaster.ts';
import { findGift, type Gift, insertGift, isDuplicateAddress, pendingFor, recordClaim, schedulePending } from './gifts.ts';
import { RateLimiter } from './ratelimit.ts';
import { giftState } from './state.ts';

export interface AppDeps {
  readonly sql: Sql;
  readonly chain: ChainClient;
  readonly price: PriceClient;
  /** Sin cotización en pesos, los regalos solo se arman en dólares o sats. */
  readonly arsPrice?: ArsPriceClient;
  readonly network: Network;
  /** Si está, habilita POST /api/tareas/difusiones con el encabezado x-tarea-token. */
  readonly tasksToken?: string | null;
  /** Regalos que puede crear una misma IP por hora. */
  readonly createLimitPerHour?: number;
}

/** Techo de la beta: un regalo no puede superar este valor en dólares. */
export const CEILING_USD = 100;
/** Margen entre la cotización del navegador y la del servidor. */
const PRICE_TOLERANCE = 0.05;
export const OCCASIONS = ['cumple', 'navidad', 'nacimiento', 'bautismo', 'casamiento', 'graduacion', 'amigo', 'porque', 'otra'] as const;
export const LIMITS = { to: 30, from: 30, message: 280 } as const;

function sameToken(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Tasa mínima que se acepta difundir (sat/vB) y tope de sanidad. */
const MIN_RELAY_SAT_VB = 0.1;
const MAX_SAT_VB = 1000;

type ErrorCode =
  | 'regalo_no_encontrado'
  | 'regalo_no_disponible'
  | 'pedido_invalido'
  | 'transaccion_invalida'
  | 'fondos_cambiaron'
  | 'ya_reclamado'
  | 'cadena_no_disponible'
  | 'difusion_rechazada'
  | 'regalo_existente'
  | 'monto_invalido'
  | 'demasiados_pedidos';

class ApiError extends Error {
  readonly status: 400 | 404 | 409 | 422 | 429 | 502;
  readonly code: ErrorCode;
  constructor(status: 400 | 404 | 409 | 422 | 429 | 502, code: ErrorCode, message: string = code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function confirmedUtxos(utxos: Utxo[]): Utxo[] {
  return utxos.filter((u) => u.confirmed);
}

/**
 * Verifica que la transacción firmada sea un barrido del regalo: gasta exactamente
 * todos sus UTXO confirmados, nada más, y tiene una sola salida. Devuelve la
 * transacción leída y la tasa de comisión efectiva.
 */
export function verifySweep(hex: string, utxos: Utxo[]): { tx: InspectedTx; feeRate: number; fee: bigint } {
  let tx: InspectedTx;
  try {
    tx = inspectTransaction(hex);
  } catch (error) {
    if (isCoreError(error)) throw new ApiError(422, 'transaccion_invalida');
    throw error;
  }
  const available = new Map(confirmedUtxos(utxos).map((u) => [`${u.txid}:${u.vout}`, u.value]));
  const spent = new Set(tx.inputs.map((i) => `${i.txid}:${i.vout}`));
  if (spent.size !== tx.inputs.length) throw new ApiError(422, 'transaccion_invalida', 'Entradas repetidas.');
  if (tx.outputs.length !== 1) throw new ApiError(422, 'transaccion_invalida', 'El barrido tiene que tener una sola salida.');
  for (const key of spent) {
    if (!available.has(key)) throw new ApiError(409, 'fondos_cambiaron', 'La transacción gasta algo que no es un UTXO confirmado del regalo.');
  }
  if (spent.size !== available.size) throw new ApiError(409, 'fondos_cambiaron', 'Llegaron fondos nuevos: hay que volver a armar el barrido.');
  const total = [...available.values()].reduce((a, b) => a + b, 0n);
  const fee = total - (tx.outputs[0]?.amount ?? 0n);
  const feeRate = Number(fee) / tx.vsize;
  if (fee <= 0n || feeRate < MIN_RELAY_SAT_VB || feeRate > MAX_SAT_VB) {
    throw new ApiError(422, 'transaccion_invalida', `Comisión fuera de rango: ${feeRate.toFixed(2)} sat/vB.`);
  }
  return { tx, feeRate, fee };
}

async function giftOr404(sql: Sql, id: string): Promise<Gift> {
  const gift = await findGift(sql, id);
  if (gift === null) throw new ApiError(404, 'regalo_no_encontrado');
  return gift;
}

export function createApp(deps: AppDeps): Hono {
  const { sql, chain, price, network } = deps;
  const app = new Hono();

  app.use('/api/*', async (c, next) => {
    await next();
    c.header('cache-control', 'no-store');
    c.header('x-content-type-options', 'nosniff');
  });

  app.onError((error, c) => {
    if (error instanceof ApiError) return c.json({ error: error.code, detalle: error.message }, error.status);
    if (error instanceof ChainError) return c.json({ error: 'cadena_no_disponible' }, 502);
    console.error(error);
    return c.json({ error: 'error_interno' }, 500);
  });

  app.get('/api/salud', (c) => c.json({ ok: true, red: network.name }));

  /** Difusiones programadas: lo dispara Cloud Scheduler cada pocos minutos. */
  app.post('/api/tareas/difusiones', async (c) => {
    const expected = deps.tasksToken;
    const given = c.req.header('x-tarea-token') ?? '';
    if (expected === undefined || expected === null || !sameToken(given, expected)) return c.json({ error: 'no_autorizado' }, 401);
    return c.json(await processPending({ sql, chain, network }));
  });

  app.get('/api/precio', async (c) => {
    const [usdPorBtc, ars] = await Promise.all([price.btcUsd(), deps.arsPrice?.btcArs().catch(() => null) ?? null]);
    // Las fuentes se muestran junto a la conversión, para que se pueda verificar.
    return c.json({ usdPorBtc, fuenteUsd: 'mempool.space', arsPorBtc: ars?.price ?? null, fuenteArs: ars?.source ?? null });
  });

  const createLimiter = new RateLimiter(deps.createLimitPerHour ?? 30, 60 * 60 * 1000);

  /**
   * El que regala registra el regalo antes de pagarlo: datos de la tarjeta, la dirección
   * derivada en su navegador y cuánto va a mandar. Nunca recibe semillas ni palabras.
   * 409 regalo_existente si la dirección ya está registrada: el navegador prueba el índice siguiente.
   */
  app.post('/api/gifts', async (c) => {
    const ip = clientIp(c.req.header('x-forwarded-for'));
    if (!createLimiter.allowed(ip)) throw new ApiError(429, 'demasiados_pedidos');
    const g = parseNewGift(await c.req.json().catch(() => null), network);
    const [usdPerBtc, fees, arsPerBtc] = await Promise.all([
      price.btcUsd(),
      chain.fees(),
      g.currency === 'ARS' ? (deps.arsPrice?.btcArs().then((q) => q.price) ?? Promise.reject(new ApiError(422, 'monto_invalido'))) : null,
    ]);
    checkAmount(g, usdPerBtc, arsPerBtc, minimumGiftAmount(fees.economy));
    try {
      const gift = await insertGift(sql, { ...g, network: network.name, usdPerBtc });
      createLimiter.record(ip);
      return c.json({ id: gift.id }, 201);
    } catch (error) {
      if (isDuplicateAddress(error)) throw new ApiError(409, 'regalo_existente');
      throw error;
    }
  });

  app.get('/api/gifts/:id', async (c) => {
    const gift = await giftOr404(sql, c.req.param('id'));
    if (gift.network !== network.name) throw new ApiError(404, 'regalo_no_encontrado');
    const [stats, pending, usdNow] = await Promise.all([
      chain.addressStats(gift.address),
      pendingFor(sql, gift.id),
      price.btcUsd().catch(() => null),
    ]);
    const funds = giftState(gift, stats, pending !== null);
    // Pago trabado: alguna transacción sin confirmar paga menos que la comisión "económica".
    let stuck = false;
    if (funds.state === 'en_la_red') {
      const [payments, fees] = await Promise.all([chain.mempoolPayments(gift.address), chain.fees()]);
      stuck = payments.some((p) => p.value > 0n && p.feeRate < fees.economy);
    }
    return c.json({
      id: gift.id,
      red: gift.network,
      idioma: gift.lang,
      ocasion: gift.occasion,
      para: gift.to,
      de: gift.from,
      mensaje: gift.message,
      imagen: gift.image,
      direccion: gift.address,
      estado: funds.state,
      sats: {
        confirmados: funds.confirmedSats.toString(),
        sinConfirmar: funds.unconfirmedSats.toString(),
        esperados: gift.satsExpected === null ? null : gift.satsExpected.toString(),
      },
      pagoTrabado: stuck,
      original: gift.amount === null ? null : { moneda: gift.currency, monto: gift.amount, usdPorBtc: gift.usdPerBtc },
      usdPorBtcHoy: usdNow,
      reclamo: gift.claimTxid === null ? (pending === null ? null : { txid: pending.txid, tipo: 'programado' }) : { txid: gift.claimTxid, tipo: gift.claimKind },
    });
  });

  /** UTXO confirmados con su transacción completa: el navegador verifica los montos contra el txid. */
  app.get('/api/gifts/:id/utxos', async (c) => {
    const gift = await giftOr404(sql, c.req.param('id'));
    if (gift.claimTxid !== null) throw new ApiError(409, 'ya_reclamado');
    const utxos = confirmedUtxos(await chain.addressUtxos(gift.address));
    const txids = [...new Set(utxos.map((u) => u.txid))];
    const raw = new Map(await Promise.all(txids.map(async (t) => [t, await chain.txHex(t)] as const)));
    return c.json({ utxos: utxos.map((u) => ({ txid: u.txid, vout: u.vout, rawTx: raw.get(u.txid) })) });
  });

  app.get('/api/fees', async (c) => c.json(await chain.fees()));

  app.post('/api/gifts/:id/claim', async (c) => {
    const body = (await c.req.json().catch(() => null)) as { hex?: unknown; modo?: unknown } | null;
    if (body === null || typeof body.hex !== 'string' || (body.modo !== 'ahora' && body.modo !== 'esperar')) {
      throw new ApiError(400, 'pedido_invalido');
    }
    const gift = await giftOr404(sql, c.req.param('id'));
    if (gift.claimTxid !== null) throw new ApiError(409, 'ya_reclamado');
    const utxos = await chain.addressUtxos(gift.address);
    if (confirmedUtxos(utxos).length === 0) throw new ApiError(409, 'regalo_no_disponible');
    const { tx, feeRate } = verifySweep(body.hex, utxos);
    const destination = describeOutput(tx, network);

    if (body.modo === 'esperar') {
      const fees = await chain.fees();
      if (feeRate < fees.minimum) {
        await schedulePending(sql, { giftId: gift.id, txid: tx.txid, hex: body.hex.toLowerCase(), satVb: feeRate });
        return c.json({ txid: tx.txid, estado: 'reclamo_programado' }, 202);
      }
    }
    let txid: string;
    try {
      txid = await chain.broadcast(body.hex.toLowerCase());
    } catch (error) {
      if (error instanceof ChainError && error.status !== undefined && error.status < 500) {
        throw new ApiError(422, 'difusion_rechazada', error.message);
      }
      throw error;
    }
    if (txid !== tx.txid) throw new ApiError(502, 'cadena_no_disponible', 'El servidor de cadena devolvió otro txid.');
    await recordClaim(sql, gift.id, { txid, kind: 'reclamo', destination });
    return c.json({ txid, estado: 'reclamado' });
  });

  return app;
}

/** IP del cliente: Cloud Run y Firebase Hosting la ponen primera en x-forwarded-for. */
function clientIp(forwarded: string | undefined): string {
  return forwarded?.split(',')[0]?.trim() || 'local';
}

type ParsedGift = Omit<Parameters<typeof insertGift>[1], 'network' | 'usdPerBtc'> & {
  satsExpected: bigint;
  currency: 'USD' | 'ARS' | 'SAT';
  amount: number;
};

function text(value: unknown, max: number, required: boolean): string | null {
  if (value === undefined || value === null || value === '') {
    if (required) throw new ApiError(400, 'pedido_invalido');
    return null;
  }
  if (typeof value !== 'string') throw new ApiError(400, 'pedido_invalido');
  const clean = value.normalize('NFC').trim();
  // Se cuentan caracteres como los ve la persona (emojis incluidos), no unidades UTF-16.
  if ([...clean].length > max || (required && clean === '')) throw new ApiError(400, 'pedido_invalido');
  return clean === '' ? null : clean;
}

function parseNewGift(body: unknown, network: Network): ParsedGift {
  if (body === null || typeof body !== 'object') throw new ApiError(400, 'pedido_invalido');
  const b = body as Record<string, unknown>;
  let address: string;
  try {
    const d = parseDestination(String(b.direccion ?? ''), network);
    if (d.type !== 'p2wpkh') throw new ApiError(400, 'pedido_invalido');
    address = d.address;
  } catch (error) {
    if (error instanceof ApiError || isCoreError(error)) throw new ApiError(400, 'pedido_invalido');
    throw error;
  }
  if (typeof b.idioma !== 'string' || !isLang(b.idioma)) throw new ApiError(400, 'pedido_invalido');
  if (typeof b.ocasion !== 'string' || !(OCCASIONS as readonly string[]).includes(b.ocasion)) throw new ApiError(400, 'pedido_invalido');
  if (typeof b.imagen !== 'number' || !Number.isInteger(b.imagen) || b.imagen < 1 || b.imagen > 4) throw new ApiError(400, 'pedido_invalido');
  if (typeof b.sats !== 'string' || !/^[1-9]\d{0,15}$/.test(b.sats)) throw new ApiError(400, 'monto_invalido');
  if (b.moneda !== 'USD' && b.moneda !== 'ARS' && b.moneda !== 'SAT') throw new ApiError(400, 'monto_invalido');
  if (typeof b.monto !== 'number' || !Number.isFinite(b.monto) || b.monto <= 0) throw new ApiError(400, 'monto_invalido');
  return {
    address,
    lang: b.idioma,
    occasion: b.ocasion,
    to: text(b.para, LIMITS.to, true) as string,
    from: text(b.de, LIMITS.from, false),
    message: text(b.mensaje, LIMITS.message, false) ?? '',
    image: b.imagen,
    currency: b.moneda,
    amount: b.monto,
    satsExpected: BigInt(b.sats),
  };
}

/** Monto coherente: mayor al mínimo de la red, debajo del techo y, en dólares, de acuerdo con la cotización. */
function checkAmount(g: ParsedGift, usdPerBtc: number, arsPerBtc: number | null, minimumSats: bigint): void {
  const usd = (Number(g.satsExpected) / 1e8) * usdPerBtc;
  if (g.satsExpected < minimumSats) throw new ApiError(422, 'monto_invalido', 'Debajo del mínimo que se puede reclamar con las comisiones de hoy.');
  if (usd > CEILING_USD * (1 + PRICE_TOLERANCE)) throw new ApiError(422, 'monto_invalido', `Supera el techo de USD ${CEILING_USD}.`);
  if (g.currency === 'SAT' && BigInt(Math.round(g.amount)) !== g.satsExpected) throw new ApiError(422, 'monto_invalido');
  if (g.currency === 'USD' || g.currency === 'ARS') {
    const fiat = g.currency === 'USD' ? usd : (Number(g.satsExpected) / 1e8) * (arsPerBtc as number);
    if (Math.round(g.amount * 100) !== g.amount * 100 || Math.abs(fiat - g.amount) > g.amount * PRICE_TOLERANCE) {
      throw new ApiError(422, 'monto_invalido', 'Los sats no corresponden al monto elegido.');
    }
  }
}

/** La dirección de destino del barrido, para registrarla (o el script en hex si no es estándar). */
function describeOutput(tx: InspectedTx, network: Network): string {
  const script = tx.outputs[0]?.script ?? new Uint8Array(0);
  return addressFromScript(script, network) ?? Buffer.from(script).toString('hex');
}
