import type { Context, Hono } from 'hono';
import { currentAccount } from './accountRoutes.ts';
import { isAdmin } from './admins.ts';
import type { Account } from './accounts.ts';
import type postgres from 'postgres';
import type { Sql } from './db.ts';
import { ApiError } from './errors.ts';

// Cupones (handoff 2026-10-21, «cupones»). Un cupón da un descuento en planes, regalos o listas
// gratis, o las dos cosas. Una vez por cuenta y uno por compra. El descuento se usa al comprar; los
// regalos o listas gratis se canjean en «Mi plan» (o llegan con el pago, si el cupón trae las dos
// cosas). Los créditos de un cupón no vencen (Rodolfo, 21/10) y, si tienen ocasión, solo sirven
// para regalos de esa ocasión del catálogo. Crear, pausar o reactivar exige passkey y queda en
// registro_admin.

type Tx = Sql | postgres.TransactionSql;

/** Ocasiones que puede tener un cupón (las del handoff); null = cualquiera. */
export const COUPON_OCCASIONS = ['navidad', 'reyes', 'dianino', 'cumple', 'bautismo', 'casamiento', 'babyshower', 'diamadre', 'diapadre'] as const;
/** Productos en los que puede valer el descuento. */
export const COUPON_PRODUCTS = ['pack10', 'pack10_lista', 'anual', 'fundador'] as const;
/** Un uso reservado por un pago dura lo mismo que el lugar de Genesis. */
const RESERVE_DAYS = 1;

export interface Coupon {
  readonly codigo: string;
  readonly descuento: number | null;
  readonly productos: string[];
  readonly da_unidad: 'regalo' | 'lista_otras' | null;
  readonly da_cantidad: number | null;
  readonly ocasion: string | null;
  readonly desde: Date;
  readonly hasta: Date | null;
  readonly max_usos: number;
  readonly activo: boolean;
  readonly nota: string;
  readonly creado_por: string;
  readonly creado: Date;
}

/** Letras y números, 4 a 20, sin distinguir mayúsculas. */
export function normalizeCode(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const code = input.trim().toUpperCase();
  return /^[A-Z0-9]{4,20}$/.test(code) ? code : null;
}

/** Lo que cuesta un producto con el descuento: se redondea hacia abajo lo descontado. */
export function discounted(price: bigint, percent: number): { sats: bigint; resigned: bigint } {
  const resigned = (price * BigInt(percent)) / 100n;
  return { sats: price - resigned, resigned };
}

/** Usos que cuentan para el máximo: los confirmados y las reservas vigentes. */
async function usesTaken(tx: Tx, code: string): Promise<number> {
  const [r] = await tx<{ n: string }[]>`
    select count(*) as n from cupon_usos
    where cupon = ${code} and (estado = 'usado' or (estado = 'reservado' and creado > now() - make_interval(days => ${RESERVE_DAYS})))`;
  return Number(r?.n ?? 0);
}

/**
 * Busca el cupón y controla que se pueda usar ahora en esta cuenta. Libera antes las reservas
 * vencidas de pagos que no se confirmaron. Toma un candado por cupón: dos usos simultáneos no
 * pasan el máximo.
 */
export async function usableCoupon(tx: Tx, code: string, accountId: string): Promise<Coupon> {
  await tx`select pg_advisory_xact_lock(hashtext(${`cupon:${code}`}))`;
  await tx`
    update cupon_usos set estado = 'liberado'
    where cupon = ${code} and estado = 'reservado' and creado <= now() - make_interval(days => ${RESERVE_DAYS})
      and (pago_id is null or pago_id not in (select id from pagos where estado = 'confirmado'))`;
  const [c] = await tx<Coupon[]>`select * from cupones where codigo = ${code}`;
  if (c === undefined || !c.activo) throw new ApiError(404, 'cupon_invalido');
  const now = Date.now();
  if (c.desde.getTime() > now || (c.hasta !== null && c.hasta.getTime() <= now)) throw new ApiError(409, 'cupon_vencido');
  const [own] = await tx`select 1 from cupon_usos where cupon = ${code} and usuario_id = ${accountId} and estado <> 'liberado'`;
  if (own !== undefined) throw new ApiError(409, 'cupon_usado');
  if ((await usesTaken(tx, code)) >= c.max_usos) throw new ApiError(409, 'cupon_agotado');
  return c;
}

/** El descuento del cupón para un producto, o el error si no vale ahí. */
export function couponDiscount(c: Coupon, product: string): number {
  if (c.descuento === null) throw new ApiError(409, 'cupon_es_de_canje');
  if (c.productos.length > 0 && !c.productos.includes(product)) throw new ApiError(409, 'cupon_no_aplica');
  return c.descuento;
}

/** Acredita los regalos o listas gratis del cupón (si los trae). */
export async function grantCouponCredits(tx: Tx, c: Coupon, accountId: string): Promise<void> {
  if (c.da_unidad === null || c.da_cantidad === null) return;
  await tx`
    insert into movimientos (usuario_id, tipo, unidad, cantidad, origen, referencia, ocasion)
    values (${accountId}, 'otorgamiento', ${c.da_unidad}, ${c.da_cantidad}, 'codigo', ${c.codigo}, ${c.ocasion})`;
}

/**
 * Al confirmarse un pago con cupón: el uso reservado pasa a usado (aunque el cupón haya vencido en
 * el medio: el pago se creó con el cupón vigente) y se acreditan los créditos gratis que traiga.
 */
export async function confirmCouponUse(tx: Tx, paymentId: string): Promise<void> {
  const [u] = await tx<{ cupon: string; usuario_id: string }[]>`
    update cupon_usos u set estado = 'usado', usado = now()
    where u.pago_id = ${paymentId} and u.estado <> 'usado'
      and not exists (select 1 from cupon_usos o where o.cupon = u.cupon and o.usuario_id = u.usuario_id and o.id <> u.id and o.estado <> 'liberado')
    returning u.cupon, u.usuario_id`;
  if (u === undefined) return;
  const [c] = await tx<Coupon[]>`select * from cupones where codigo = ${u.cupon}`;
  if (c !== undefined) await grantCouponCredits(tx, c, u.usuario_id);
}

const couponView = (c: Coupon) => ({
  codigo: c.codigo,
  descuento: c.descuento,
  productos: c.productos,
  da: c.da_unidad === null ? null : { unidad: c.da_unidad, cantidad: c.da_cantidad, ocasion: c.ocasion },
});

export function registerCouponRoutes(app: Hono, deps: { sql: Sql; adminEmails: readonly string[] }): void {
  const { sql, adminEmails } = deps;

  const signedIn = async (c: Context): Promise<Account> => {
    const account = await currentAccount(sql, c);
    if (account === null) throw new ApiError(401, 'sesion_requerida');
    return account;
  };
  const admin = async (c: Context, passkey: boolean): Promise<Account> => {
    const account = await signedIn(c);
    if (!(await isAdmin(sql, adminEmails, account.email))) throw new ApiError(404, 'no_encontrado');
    if (passkey && account.viaPasskey !== true) throw new ApiError(403, 'passkey_requerida');
    c.header('cache-control', 'no-store');
    return account;
  };
  const body = async (c: Context) => ((await c.req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const codeOf = (input: unknown): string => {
    const code = normalizeCode(input);
    if (code === null) throw new ApiError(404, 'cupon_invalido');
    return code;
  };

  /** Ver qué da un cupón antes de usarlo (con un producto: el precio con el descuento). */
  app.post('/api/cuenta/cupon/ver', async (c) => {
    const account = await signedIn(c);
    const b = await body(c);
    const code = codeOf(b.codigo);
    return sql.begin(async (tx) => {
      const coupon = await usableCoupon(tx, code, account.id);
      if (typeof b.producto !== 'string') return c.json(couponView(coupon));
      const percent = couponDiscount(coupon, b.producto);
      const [p] = await tx<{ precio_sats: string }[]>`select precio_sats from productos where codigo = ${b.producto} and activo`;
      if (p === undefined) throw new ApiError(422, 'producto_invalido');
      const { sats } = discounted(BigInt(p.precio_sats), percent);
      return c.json({ ...couponView(coupon), precioOriginal: p.precio_sats, precio: sats.toString() });
    });
  });

  /** Canjear en «Mi plan» un cupón que da regalos o listas gratis. */
  app.post('/api/cuenta/cupon', async (c) => {
    const account = await signedIn(c);
    const code = codeOf((await body(c)).codigo);
    const coupon = await sql.begin(async (tx) => {
      const found = await usableCoupon(tx, code, account.id);
      // Un cupón con descuento se usa al comprar el plan (si además trae créditos, llegan con el pago).
      if (found.descuento !== null) throw new ApiError(409, 'cupon_es_de_compra');
      await tx`insert into cupon_usos (cupon, usuario_id, estado, usado) values (${code}, ${account.id}, 'usado', now())`;
      await grantCouponCredits(tx, found, account.id);
      return found;
    });
    return c.json(couponView(coupon), 201);
  });

  // ── Admin ──

  app.get('/api/admin/cupones', async (c) => {
    await admin(c, false);
    const rows = await sql<Coupon[]>`select * from cupones order by creado desc limit 500`;
    const uses = await sql<{ cupon: string; producto: string | null; usados: string; reservados: string; resignado: string }[]>`
      select cupon, producto,
             count(*) filter (where estado = 'usado') as usados,
             count(*) filter (where estado = 'reservado' and creado > now() - make_interval(days => ${RESERVE_DAYS})) as reservados,
             coalesce(sum(resignado) filter (where estado = 'usado'), 0) as resignado
      from cupon_usos group by cupon, producto`;
    return c.json({
      ocasiones: COUPON_OCCASIONS,
      productos: COUPON_PRODUCTS,
      cupones: rows.map((r) => {
        const mine = uses.filter((u) => u.cupon === r.codigo);
        return {
          ...couponView(r),
          desde: r.desde.toISOString(),
          hasta: r.hasta?.toISOString() ?? null,
          maxUsos: r.max_usos,
          activo: r.activo,
          nota: r.nota,
          creadoPor: r.creado_por,
          creado: r.creado.toISOString(),
          usados: mine.reduce((a, u) => a + Number(u.usados), 0),
          reservados: mine.reduce((a, u) => a + Number(u.reservados), 0),
          satsResignados: mine.reduce((a, u) => a + BigInt(u.resignado), 0n).toString(),
          porProducto: Object.fromEntries(mine.filter((u) => u.producto !== null && Number(u.usados) > 0).map((u) => [u.producto, Number(u.usados)])),
        };
      }),
    });
  });

  app.post('/api/admin/cupones', async (c) => {
    const account = await admin(c, true);
    const b = await body(c);
    const code = normalizeCode(b.codigo);
    if (code === null) throw new ApiError(400, 'pedido_invalido');
    const descuento = b.descuento === null || b.descuento === undefined ? null : b.descuento;
    if (descuento !== null && (typeof descuento !== 'number' || !Number.isInteger(descuento) || descuento < 1 || descuento > 100)) throw new ApiError(400, 'pedido_invalido');
    const productos = Array.isArray(b.productos) ? b.productos : [];
    if (!productos.every((p) => (COUPON_PRODUCTS as readonly unknown[]).includes(p))) throw new ApiError(400, 'pedido_invalido');
    const da = b.da === null || b.da === undefined ? null : (b.da as Record<string, unknown>);
    if (da !== null) {
      if (da.unidad !== 'regalo' && da.unidad !== 'lista_otras') throw new ApiError(400, 'pedido_invalido');
      if (typeof da.cantidad !== 'number' || !Number.isInteger(da.cantidad) || da.cantidad < 1 || da.cantidad > 1000) throw new ApiError(400, 'pedido_invalido');
      if (da.ocasion !== null && da.ocasion !== undefined && !(COUPON_OCCASIONS as readonly unknown[]).includes(da.ocasion)) throw new ApiError(400, 'pedido_invalido');
    }
    if (descuento === null && da === null) throw new ApiError(400, 'pedido_invalido');
    const maxUsos = b.maxUsos;
    if (typeof maxUsos !== 'number' || !Number.isInteger(maxUsos) || maxUsos < 1 || maxUsos > 1_000_000) throw new ApiError(400, 'pedido_invalido');
    const date = (v: unknown): Date | null => {
      if (v === null || v === undefined || v === '') return null;
      const d = typeof v === 'string' ? new Date(v) : null;
      if (d === null || Number.isNaN(d.getTime())) throw new ApiError(400, 'pedido_invalido');
      return d;
    };
    const desde = date(b.desde) ?? new Date();
    const hasta = date(b.hasta);
    if (hasta !== null && hasta <= desde) throw new ApiError(400, 'pedido_invalido');
    const nota = typeof b.nota === 'string' ? b.nota.trim().slice(0, 300) : '';
    const inserted = await sql`
      insert into cupones (codigo, descuento, productos, da_unidad, da_cantidad, ocasion, desde, hasta, max_usos, nota, creado_por)
      values (${code}, ${descuento as number | null}, ${productos as string[]}, ${(da?.unidad as string | undefined) ?? null}, ${(da?.cantidad as number | undefined) ?? null},
              ${(da?.ocasion as string | undefined) ?? null}, ${desde}, ${hasta}, ${maxUsos}, ${nota}, ${account.email})
      on conflict (codigo) do nothing returning codigo`;
    if (inserted.length === 0) throw new ApiError(409, 'cupon_existente');
    await sql`insert into registro_admin (email, accion, detalle) values (${account.email}, 'cupon_creado', ${code})`;
    return c.json({ codigo: code }, 201);
  });

  /** Pausar o reactivar (lo que da un cupón usado no se edita: se pausa y se crea otro). */
  app.post('/api/admin/cupones/:codigo/activo', async (c) => {
    const account = await admin(c, true);
    const code = codeOf(c.req.param('codigo'));
    const { activo } = await body(c);
    if (typeof activo !== 'boolean') throw new ApiError(400, 'pedido_invalido');
    const rows = await sql`update cupones set activo = ${activo} where codigo = ${code} returning codigo`;
    if (rows.length === 0) throw new ApiError(404, 'no_encontrado');
    await sql`insert into registro_admin (email, accion, detalle) values (${account.email}, ${activo ? 'cupon_reactivado' : 'cupon_pausado'}, ${code})`;
    return c.json({ codigo: code, activo });
  });
}
