import { type AccountKey, deriveListAddress, type Network, parsePaymentKey } from '@regalale/core';
import type postgres from 'postgres';
import type { ChainClient, PriceClient } from './chain.ts';
import type { Sql } from './db.ts';
import { confirmCouponUse, couponDiscount, discounted, grantCouponCredits, usableCoupon } from './coupons.ts';
import { ApiError } from './errors.ts';

// Pagos del costo por servicio (handoff 2026-10-19, «cobro y créditos»), solo on-chain:
// 1. Se elige un producto; el precio está en sats (decisión del 20/10): se paga exactamente eso.
// 2. Una dirección nueva por pago, derivada de la llave de cobro (solo lectura), índice atómico.
// 3. Se vigila la dirección: 0 confirmaciones si ninguna transacción señala RBF, si no, 1.
//    Se acepta hasta un 2 % menos; si falta más, «incompleto» (se puede completar en la misma
//    dirección); si sobra, se acredita igual.
// 4. Confirmado: «compra» en movimientos (o alta en planes).

type Tx = Sql | postgres.TransactionSql;

/** Se acepta hasta un 2 % menos de lo cotizado. */
const TOLERANCE = 0.98;
/** Lo que se vende: los packs y, por unidad (Claudia, 25/10), un regalo o una lista sueltos. */
export const BUYABLE = ['pack10', 'pack10_lista', 'lista_cumple', 'anual', 'fundador', 'regalo', 'lista_otras'] as const;
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


/** Un cambio de llave de cobro entra en vigor 24 horas después de cargarlo. */
export const KEY_CHANGE_HOURS = 24;

/** La llave de cobro vigente (descriptor normalizado), o null si todavía no se cargó. */
export async function paymentKey(sql: Tx, network: Network): Promise<AccountKey | null> {
  // Si hay una llave nueva cargada hace más de 24 horas, pasa a ser la vigente.
  await sql`
    with nueva as (
      delete from ajustes where clave = 'llave_cobro_nueva' and actualizado <= now() - make_interval(hours => ${KEY_CHANGE_HOURS})
      returning valor
    )
    insert into ajustes (clave, valor) select 'llave_cobro', valor from nueva
    on conflict (clave) do update set valor = excluded.valor, actualizado = now()`;
  const [r] = await sql<{ valor: string }[]>`select valor from ajustes where clave = 'llave_cobro'`;
  return r === undefined ? null : parsePaymentKey(r.valor, network);
}

/** La llave cargada que todavía no está vigente, con el momento en que entra en vigor. */
export async function pendingPaymentKey(sql: Tx, network: Network): Promise<{ key: AccountKey; from: Date } | null> {
  const [r] = await sql<{ valor: string; desde: Date }[]>`
    select valor, actualizado + make_interval(hours => ${KEY_CHANGE_HOURS}) as desde from ajustes where clave = 'llave_cobro_nueva'`;
  return r === undefined ? null : { key: parsePaymentKey(r.valor, network), from: r.desde };
}

/**
 * Carga la llave de cobro. La primera vez queda vigente enseguida; un cambio, a las 24 horas (así
 * hay tiempo de frenarlo si no lo hizo la responsable). Devuelve si quedó pendiente.
 */
export async function setPaymentKey(sql: Tx, network: Network, input: string): Promise<{ key: AccountKey; pending: boolean }> {
  const key = parsePaymentKey(input, network);
  const current = await paymentKey(sql, network);
  if (current !== null && current.text === key.text) {
    await sql`delete from ajustes where clave = 'llave_cobro_nueva'`;
    return { key, pending: false };
  }
  const clave = current === null ? 'llave_cobro' : 'llave_cobro_nueva';
  await sql`
    insert into ajustes (clave, valor) values (${clave}, ${key.text})
    on conflict (clave) do update set valor = excluded.valor, actualizado = now()`;
  return { key, pending: current !== null };
}

/**
 * Huella corta de la llave para mostrar y registrar (nunca la llave entera): la huella maestra del
 * descriptor, la misma que muestra la billetera; con una zpub/vpub, la de la llave de la cuenta.
 */
export function keyFingerprint(key: AccountKey): string {
  const m = /^wpkh\(\[([0-9a-fA-F]{8})\//.exec(key.text);
  return m?.[1]?.toLowerCase() ?? Buffer.from(key.hd.identifier ?? new Uint8Array()).toString('hex').slice(0, 8);
}

/**
 * Cuántos quedan de un producto con cupo (Genesis Block: 21): el cupo menos los pagos confirmados y
 * los que están en curso (reservan su lugar 1 día). null = sin límite.
 */
export async function unitsLeft(sql: Tx, product: string): Promise<number | null> {
  const [r] = await sql<{ cupo: number | null; n: string }[]>`
    select (select cupo from productos where codigo = ${product}) as cupo,
           (select count(*) from pagos where producto = ${product}
              and (estado = 'confirmado' or (estado in ('pendiente', 'visto', 'incompleto') and creado > now() - interval '1 day')))
           + (select count(*) from cupon_usos where producto = ${product} and pago_id is null and estado = 'usado') as n`;
  return r?.cupo == null ? null : Math.max(0, r.cupo - Number(r.n));
}

/** Lugares de fundador (Genesis Block) que quedan. */
export async function foundersLeft(sql: Tx): Promise<number> {
  return (await unitsLeft(sql, 'fundador')) ?? 1_000_000;
}

/** Un producto que salió gratis con un cupón del 100 %: no hay pago on-chain, se acredita en el acto. */
export interface FreeWithCoupon {
  readonly free: true;
  readonly product: string;
  readonly coupon: string;
}

export async function createPayment(
  deps: { sql: Sql; price: PriceClient; network: Network },
  accountId: string,
  product: string,
  couponCode: string | null = null,
): Promise<Payment | FreeWithCoupon> {
  const { sql, price, network } = deps;
  if (!(BUYABLE as readonly string[]).includes(product)) throw new ApiError(422, 'producto_invalido');
  const [p] = await sql<{ precio_sats: string; activo: boolean }[]>`select precio_sats, activo from productos where codigo = ${product}`;
  if (p === undefined || !p.activo || BigInt(p.precio_sats) <= 0n) throw new ApiError(422, 'producto_invalido');
  const original = BigInt(p.precio_sats);
  // El equivalente en dólares queda como referencia (no se usa para cobrar).
  const usdPerBtc = await price.btcUsd().catch(() => 0);
  return sql.begin(async (tx) => {
    // Un pago a la vez: el índice de la dirección y el cupo de fundadores no se leen en paralelo.
    await tx`select pg_advisory_xact_lock(hashtext('pagos'))`;
    const key = await paymentKey(tx, network);
    if (key === null) throw new ApiError(409, 'cobro_no_configurado');
    const left = await unitsLeft(tx, product);
    if (left !== null && left <= 0) throw new ApiError(409, product === 'fundador' ? 'fundadores_agotados' : 'agotado');
    // Con cupón: el descuento (redondeado hacia abajo) y el uso reservado hasta que se confirme.
    const coupon = couponCode === null ? null : await usableCoupon(tx, couponCode, accountId);
    const percent = coupon === null ? null : couponDiscount(coupon, product);
    const { sats, resigned } = percent === null ? { sats: original, resigned: 0n } : discounted(original, percent);
    if (coupon !== null && sats === 0n) {
      // 100 %: no hay pago on-chain; se acredita directo, con el cupón como origen.
      await tx`
        insert into cupon_usos (cupon, usuario_id, producto, estado, resignado, usado)
        values (${coupon.codigo}, ${accountId}, ${product}, 'usado', ${resigned.toString()}, now())`;
      await grantProduct(tx, accountId, product, 'codigo', coupon.codigo);
      await grantCouponCredits(tx, coupon, accountId);
      return { free: true, product, coupon: coupon.codigo } as const;
    }
    const cents = usdPerBtc > 0 ? Math.round((Number(sats) * usdPerBtc) / 1_000_000) : 0;
    const [n] = await tx<{ next: number }[]>`select coalesce(max(indice) + 1, 0)::int as next from pagos where llave = ${key.text}`;
    const index = n?.next ?? 0;
    const address = deriveListAddress(key, index).address;
    const [r] = await tx<Row[]>`
      insert into pagos (id, usuario_id, producto, precio_cents, sats, usd_por_btc, llave, indice, direccion, vence_cotizacion,
                         cupon, descuento, precio_original_sats)
      values (${newId()}, ${accountId}, ${product}, ${cents}, ${sats.toString()}, ${usdPerBtc}, ${key.text}, ${index}, ${address},
              now() + make_interval(days => ${WATCH_DAYS}),
              ${coupon?.codigo ?? null}, ${percent}, ${coupon === null ? null : original.toString()})
      returning *`;
    const payment = fromRow(r as Row);
    if (coupon !== null) {
      await tx`
        insert into cupon_usos (cupon, usuario_id, producto, pago_id, estado, resignado)
        values (${coupon.codigo}, ${accountId}, ${product}, ${payment.id}, 'reservado', ${resigned.toString()})`;
    }
    return payment;
  });
}

export async function findPayment(sql: Tx, id: string): Promise<Payment | null> {
  const [r] = await sql<Row[]>`select * from pagos where id = ${id}`;
  return r === undefined ? null : fromRow(r);
}

/**
 * Lo que otorga un producto: créditos en movimientos o un plan (con el cupo que tiene hoy el
 * producto). Viene de un pago o de un cupón del 100 % (origen «codigo», referencia el cupón).
 */
async function grantProduct(tx: Tx, accountId: string, product: string, origen: 'pago' | 'codigo', referencia: string): Promise<void> {
  const [p] = await tx<{ regalos: number; listas_cumple: number; listas_otras: number; plan: 'anual' | 'fundador' | null; regalos_libres: boolean; dias: number | null }[]>`
    select regalos, listas_cumple, listas_otras, plan, regalos_libres, dias from productos where codigo = ${product}`;
  if (p === undefined) throw new Error(`Producto desconocido: ${product}`);
  if (p.plan !== null) {
    await tx`
      insert into planes (usuario_id, tipo, hasta, regalos, listas, referencia)
      values (${accountId}, ${p.plan}, ${p.dias === null ? null : daysFromNow(p.dias)}, ${p.regalos_libres ? null : p.regalos},
              ${p.listas_cumple + p.listas_otras}, ${referencia})`;
    return;
  }
  for (const [unidad, cantidad] of [['regalo', p.regalos], ['lista_cumple', p.listas_cumple], ['lista_otras', p.listas_otras]] as const) {
    if (cantidad <= 0) continue;
    await tx`
      insert into movimientos (usuario_id, tipo, unidad, cantidad, origen, referencia)
      values (${accountId}, 'compra', ${unidad}, ${cantidad}, ${origen}, ${referencia})`;
  }
}

async function grant(tx: Tx, payment: Payment): Promise<void> {
  await grantProduct(tx, payment.accountId, payment.product, 'pago', payment.id);
  await confirmCouponUse(tx, payment.id);
}

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 86_400_000);
}

/**
 * Mira la dirección del pago y actualiza su estado; si alcanza, lo confirma y acredita (una sola
 * vez: la transición a «confirmado» es atómica).
 */
export async function refreshPayment(deps: { sql: Sql; chain: ChainClient; price: PriceClient }, payment: Payment): Promise<Payment> {
  const { sql, chain } = deps;
  if (payment.state === 'confirmado' || payment.state === 'devuelto') return payment;
  const [stats, mempool] = await Promise.all([chain.addressStats(payment.address), chain.mempoolPayments(payment.address)]);
  const received = stats.confirmedFunded + stats.mempoolFunded;
  // Lo que cuenta ya: lo confirmado más lo que está en la mempool sin señalar RBF.
  const usable = stats.confirmedFunded + mempool.filter((m) => m.rbf === false).reduce((a, m) => a + m.value, 0n);
  const seenAt = payment.seenAt ?? (received > 0n ? new Date() : null);
  // El precio está en sats: lo pedido no cambia con la cotización.
  const required = payment.sats;
  const enough = (amount: bigint) => amount * 100n >= required * BigInt(Math.round(TOLERANCE * 100));
  let state: PaymentState;
  if (received === 0n) state = 'pendiente';
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
    confirmado: p.confirmedAt?.toISOString() ?? null,
  };
}
