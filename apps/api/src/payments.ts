import { type AccountKey, deriveListAddress, type Network, parsePaymentKey } from '@regalale/core';
import type postgres from 'postgres';
import type { ChainClient, PriceClient } from './chain.ts';
import type { Sql } from './db.ts';
import { ApiError } from './errors.ts';

// Pagos del costo por servicio (handoff 2026-10-19, «cobro y créditos»), solo on-chain:
// 1. Se elige un producto y el servidor cotiza en sats; la cotización vale 30 minutos.
// 2. Una dirección nueva por pago, derivada de la llave de cobro (solo lectura), índice atómico.
// 3. Se vigila la dirección: 0 confirmaciones si ninguna transacción señala RBF, si no, 1.
//    Se acepta hasta un 2 % menos; si falta más, «incompleto» (se puede completar en la misma
//    dirección); si sobra, se acredita igual. Si el primer pago llega con la cotización vencida,
//    se compara con el precio de ese momento.
// 4. Confirmado: «compra» en movimientos (o alta en planes).

type Tx = Sql | postgres.TransactionSql;

export const QUOTE_MINUTES = 30;
/** Se acepta hasta un 2 % menos de lo cotizado. */
const TOLERANCE = 0.98;
/** Lo que se vende suelto; «lista_otras» va como pack con 10 regalos (existe para upgrades y códigos). */
export const BUYABLE = ['pack10', 'pack10_lista', 'lista_cumple', 'anual', 'fundador'] as const;
export const FOUNDERS_MAX = 100;
/** Pagos que se siguen mirando: dos semanas desde que se crearon. */
const WATCH_DAYS = 14;

export type PaymentState = 'pendiente' | 'visto' | 'confirmado' | 'incompleto' | 'vencido' | 'devuelto';

export interface Payment {
  readonly id: string;
  readonly accountId: string;
  readonly product: string;
  readonly priceCents: number;
  readonly sats: bigint;
  readonly address: string;
  readonly state: PaymentState;
  readonly received: bigint;
  readonly quoteExpires: Date;
  readonly seenAt: Date | null;
  readonly confirmedAt: Date | null;
}

interface Row {
  id: string;
  usuario_id: string;
  producto: string;
  precio_cents: number;
  sats: string;
  direccion: string;
  estado: PaymentState;
  sats_recibidos: string;
  vence_cotizacion: Date;
  visto_en: Date | null;
  confirmado: Date | null;
}

const fromRow = (r: Row): Payment => ({
  id: r.id,
  accountId: r.usuario_id,
  product: r.producto,
  priceCents: r.precio_cents,
  sats: BigInt(r.sats),
  address: r.direccion,
  state: r.estado,
  received: BigInt(r.sats_recibidos),
  quoteExpires: r.vence_cotizacion,
  seenAt: r.visto_en,
  confirmedAt: r.confirmado,
});

const newId = (): string => Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64url');

/** Centavos de dólar a sats con la cotización de 1 BTC. */
export const centsToSats = (cents: number, usdPerBtc: number): bigint => BigInt(Math.round((cents * 1_000_000) / usdPerBtc));

/** La llave de cobro vigente (descriptor normalizado), o null si todavía no se cargó. */
export async function paymentKey(sql: Tx, network: Network): Promise<AccountKey | null> {
  const [r] = await sql<{ valor: string }[]>`select valor from ajustes where clave = 'llave_cobro'`;
  return r === undefined ? null : parsePaymentKey(r.valor, network);
}

/** Carga la llave de cobro (el admin la confirma después de comparar las primeras direcciones). */
export async function setPaymentKey(sql: Tx, network: Network, input: string): Promise<AccountKey> {
  const key = parsePaymentKey(input, network);
  await sql`
    insert into ajustes (clave, valor) values ('llave_cobro', ${key.text})
    on conflict (clave) do update set valor = excluded.valor, actualizado = now()`;
  return key;
}

export async function foundersLeft(sql: Tx): Promise<number> {
  const [r] = await sql<{ n: string }[]>`
    select (select count(*) from planes where tipo = 'fundador') +
           (select count(*) from pagos where producto = 'fundador' and estado in ('pendiente', 'visto', 'incompleto') and vence_cotizacion > now()) as n`;
  return Math.max(0, FOUNDERS_MAX - Number(r?.n ?? 0));
}

export async function createPayment(deps: { sql: Sql; price: PriceClient; network: Network }, accountId: string, product: string): Promise<Payment> {
  const { sql, price, network } = deps;
  if (!(BUYABLE as readonly string[]).includes(product)) throw new ApiError(422, 'producto_invalido');
  const [p] = await sql<{ precio_cents: number; activo: boolean }[]>`select precio_cents, activo from productos where codigo = ${product}`;
  if (p === undefined || !p.activo || p.precio_cents <= 0) throw new ApiError(422, 'producto_invalido');
  const usdPerBtc = await price.btcUsd();
  const sats = centsToSats(p.precio_cents, usdPerBtc);
  return sql.begin(async (tx) => {
    // Un pago a la vez: el índice de la dirección y el cupo de fundadores no se leen en paralelo.
    await tx`select pg_advisory_xact_lock(hashtext('pagos'))`;
    const key = await paymentKey(tx, network);
    if (key === null) throw new ApiError(409, 'cobro_no_configurado');
    if (product === 'fundador' && (await foundersLeft(tx)) <= 0) throw new ApiError(409, 'fundadores_agotados');
    const [n] = await tx<{ next: number }[]>`select coalesce(max(indice) + 1, 0)::int as next from pagos where llave = ${key.text}`;
    const index = n?.next ?? 0;
    const address = deriveListAddress(key, index).address;
    const [r] = await tx<Row[]>`
      insert into pagos (id, usuario_id, producto, precio_cents, sats, usd_por_btc, llave, indice, direccion, vence_cotizacion)
      values (${newId()}, ${accountId}, ${product}, ${p.precio_cents}, ${sats.toString()}, ${usdPerBtc}, ${key.text}, ${index}, ${address},
              now() + make_interval(mins => ${QUOTE_MINUTES}))
      returning *`;
    return fromRow(r as Row);
  });
}

export async function findPayment(sql: Tx, id: string): Promise<Payment | null> {
  const [r] = await sql<Row[]>`select * from pagos where id = ${id}`;
  return r === undefined ? null : fromRow(r);
}

/** Lo que otorga el producto: créditos en movimientos o un plan. */
async function grant(tx: Tx, payment: Payment): Promise<void> {
  const [p] = await tx<{ regalos: number; listas_cumple: number; listas_otras: number; plan: 'anual' | 'fundador' | null }[]>`
    select regalos, listas_cumple, listas_otras, plan from productos where codigo = ${payment.product}`;
  if (p === undefined) throw new Error(`Producto desconocido: ${payment.product}`);
  for (const [unidad, cantidad] of [['regalo', p.regalos], ['lista_cumple', p.listas_cumple], ['lista_otras', p.listas_otras]] as const) {
    if (cantidad <= 0) continue;
    await tx`
      insert into movimientos (usuario_id, tipo, unidad, cantidad, origen, referencia)
      values (${payment.accountId}, 'compra', ${unidad}, ${cantidad}, 'pago', ${payment.id})`;
  }
  if (p.plan === 'anual') await tx`insert into planes (usuario_id, tipo, hasta, referencia) values (${payment.accountId}, 'anual', now() + interval '365 days', ${payment.id})`;
  if (p.plan === 'fundador') await tx`insert into planes (usuario_id, tipo, hasta, referencia) values (${payment.accountId}, 'fundador', null, ${payment.id})`;
}

/**
 * Mira la dirección del pago y actualiza su estado; si alcanza, lo confirma y acredita (una sola
 * vez: la transición a «confirmado» es atómica).
 */
export async function refreshPayment(deps: { sql: Sql; chain: ChainClient; price: PriceClient }, payment: Payment): Promise<Payment> {
  const { sql, chain, price } = deps;
  if (payment.state === 'confirmado' || payment.state === 'devuelto') return payment;
  const [stats, mempool] = await Promise.all([chain.addressStats(payment.address), chain.mempoolPayments(payment.address)]);
  const received = stats.confirmedFunded + stats.mempoolFunded;
  // Lo que cuenta ya: lo confirmado más lo que está en la mempool sin señalar RBF.
  const usable = stats.confirmedFunded + mempool.filter((m) => m.rbf === false).reduce((a, m) => a + m.value, 0n);
  const now = new Date();
  const seenAt = payment.seenAt ?? (received > 0n ? now : null);
  let required = payment.sats;
  if (seenAt !== null && seenAt > payment.quoteExpires) {
    // Llegó con la cotización vencida: se compara con el precio de ese momento.
    required = centsToSats(payment.priceCents, await price.btcUsd());
  }
  const enough = (amount: bigint) => amount * 100n >= required * BigInt(Math.round(TOLERANCE * 100));
  let state: PaymentState;
  if (received === 0n) state = now > payment.quoteExpires ? 'vencido' : 'pendiente';
  else if (enough(usable)) state = 'confirmado';
  else if (enough(received)) state = 'visto'; // alcanza, pero falta una confirmación (señala RBF)
  else state = 'incompleto';
  const txids = mempool.map((m) => m.txid);
  if (state === 'confirmado') {
    return sql.begin(async (tx) => {
      const [r] = await tx<Row[]>`
        update pagos set estado = 'confirmado', confirmado = now(), sats_recibidos = ${received.toString()}, visto_en = coalesce(visto_en, now())
        where id = ${payment.id} and estado <> 'confirmado' and estado <> 'devuelto' returning *`;
      if (r === undefined) return (await findPayment(tx, payment.id)) as Payment;
      const confirmed = fromRow(r);
      await grant(tx, confirmed);
      return confirmed;
    });
  }
  const [r] = await sql<Row[]>`
    update pagos set estado = ${state}, sats_recibidos = ${received.toString()}, visto_en = ${seenAt},
      txids = (select array(select distinct unnest(txids || ${txids}::text[])))
    where id = ${payment.id} and estado <> 'confirmado' and estado <> 'devuelto' returning *`;
  return r === undefined ? ((await findPayment(sql, payment.id)) as Payment) : fromRow(r);
}

/** La tarea programada revisa los pagos abiertos de las últimas dos semanas. */
export async function watchPayments(deps: { sql: Sql; chain: ChainClient; price: PriceClient }): Promise<number> {
  const open = await deps.sql<Row[]>`
    select * from pagos
    where estado in ('pendiente', 'visto', 'incompleto', 'vencido') and creado > now() - make_interval(days => ${WATCH_DAYS})
    order by creado limit 200`;
  let confirmed = 0;
  for (const r of open) {
    try {
      if ((await refreshPayment(deps, fromRow(r))).state === 'confirmado') confirmed++;
    } catch (error) {
      console.error(`No se pudo revisar el pago ${r.id}: ${(error as Error).message}`);
    }
  }
  return confirmed;
}

/** Lo que ve quien paga (nunca la llave ni el índice). */
export function paymentView(p: Payment) {
  return {
    id: p.id,
    producto: p.product,
    precioUsd: p.priceCents / 100,
    sats: p.sats.toString(),
    direccion: p.address,
    estado: p.state,
    satsRecibidos: p.received.toString(),
    venceCotizacion: p.quoteExpires.toISOString(),
    confirmado: p.confirmedAt?.toISOString() ?? null,
  };
}
