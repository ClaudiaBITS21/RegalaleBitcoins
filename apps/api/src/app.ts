import { addressFromScript, isCoreError, inspectTransaction, type InspectedTx, type Network } from '@regalale/core';
import { Hono } from 'hono';
import { ChainError, type ChainClient, type PriceClient, type Utxo } from './chain.ts';
import type { Sql } from './db.ts';
import { findGift, type Gift, pendingFor, recordClaim, schedulePending } from './gifts.ts';
import { giftState } from './state.ts';

export interface AppDeps {
  readonly sql: Sql;
  readonly chain: ChainClient;
  readonly price: PriceClient;
  readonly network: Network;
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
  | 'difusion_rechazada';

class ApiError extends Error {
  readonly status: 400 | 404 | 409 | 422 | 502;
  readonly code: ErrorCode;
  constructor(status: 400 | 404 | 409 | 422 | 502, code: ErrorCode, message: string = code) {
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

  app.get('/api/gifts/:id', async (c) => {
    const gift = await giftOr404(sql, c.req.param('id'));
    if (gift.network !== network.name) throw new ApiError(404, 'regalo_no_encontrado');
    const [stats, pending, usdNow] = await Promise.all([
      chain.addressStats(gift.address),
      pendingFor(sql, gift.id),
      price.btcUsd().catch(() => null),
    ]);
    const funds = giftState(gift, stats, pending !== null);
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
      sats: { confirmados: funds.confirmedSats.toString(), sinConfirmar: funds.unconfirmedSats.toString() },
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

/** La dirección de destino del barrido, para registrarla (o el script en hex si no es estándar). */
function describeOutput(tx: InspectedTx, network: Network): string {
  const script = tx.outputs[0]?.script ?? new Uint8Array(0);
  return addressFromScript(script, network) ?? Buffer.from(script).toString('hex');
}
