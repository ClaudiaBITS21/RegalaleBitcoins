import type { Context, Hono } from 'hono';
import { currentAccount } from './accountRoutes.ts';
import { isAdmin } from './admins.ts';
import type { Account } from './accounts.ts';
import type postgres from 'postgres';
import type { Sql } from './db.ts';
import { ApiError } from './errors.ts';
import { parsePreview } from './share.ts';

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
  /** Solo lo usa la cuenta con este mail (en minúsculas); null = cualquiera. */
  readonly email: string | null;
  readonly lote: string | null;
  /** El link corto: regalalebitcoin.com/c/K7M2P (5 caracteres, migración 030). */
  readonly corto: string;
}

/** Letras y números, 4 a 24 (los de lote llevan prefijo y 8 al azar), sin distinguir mayúsculas. */
export function normalizeCode(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const code = input.trim().toUpperCase();
  return /^[A-Z0-9]{4,24}$/.test(code) ? code : null;
}

/** El código del link corto, en mayúsculas; null si no tiene la forma (5 del alfabeto sin 0/O/1/I/L). */
export function normalizeShortCode(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const code = input.trim().toUpperCase();
  return /^[A-HJKMNP-Z2-9]{5}$/.test(code) ? code : null;
}

/** Un mail razonable, en minúsculas; null si no parece un mail. */
export function normalizeEmail(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const email = input.trim().toLowerCase();
  return email.length <= 254 && /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[a-z]{2,}$/.test(email) ? email : null;
}

/** Sin letras ni números que se confundan (I, O, 0, 1) al dictar o copiar a mano. */
const RANDOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Parte al azar de un código de lote: 8 caracteres (40 bits), con crypto.getRandomValues. */
export function randomCodePart(length = 8): string {
  let out = '';
  while (out.length < length) {
    const bytes = crypto.getRandomValues(new Uint8Array(length * 2));
    // 256 es múltiplo de 32: cada byte da un carácter sin sesgo.
    for (const b of bytes) if (out.length < length) out += RANDOM_ALPHABET[b % RANDOM_ALPHABET.length];
  }
  return out;
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
  if (c.email !== null) {
    const [me] = await tx<{ email: string }[]>`select lower(email) as email from usuarios where id = ${accountId}`;
    if (me?.email !== c.email) throw new ApiError(403, 'cupon_de_otra_cuenta');
  }
  const now = Date.now();
  if (c.desde.getTime() > now) throw new ApiError(409, 'cupon_no_empezo');
  if (c.hasta !== null && c.hasta.getTime() <= now) throw new ApiError(409, 'cupon_vencido');
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

/**
 * Un cupón que se puede mostrar en público (activo, sin vencer, con usos), por su código o su link
 * corto. Uno que todavía no empezó también se muestra, con su fecha de inicio (el de un evento se
 * comparte antes, Claudia 25/10); usarlo antes de esa fecha no se puede. El error dice por qué no.
 */
export async function shownCoupon(sql: Sql, by: { codigo: string } | { corto: string }): Promise<Coupon> {
  const [k] = 'codigo' in by ? await sql<Coupon[]>`select * from cupones where codigo = ${by.codigo}` : await sql<Coupon[]>`select * from cupones where corto = ${by.corto}`;
  const now = Date.now();
  if (k === undefined || !k.activo || (k.hasta !== null && k.hasta.getTime() <= now)) throw new ApiError(404, 'cupon_invalido');
  if ((await usesTaken(sql, k.codigo)) >= k.max_usos) throw new ApiError(409, 'cupon_agotado');
  return k;
}

export const LOGO_MAX_BYTES = 300_000;

/** El logo de quien promueve un cupón: solo PNG (lo arma el navegador del admin), hasta 300 KB. */
export function parseLogo(value: unknown): Uint8Array {
  if (typeof value !== 'string' || value.length > Math.ceil(LOGO_MAX_BYTES / 3) * 4 + 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw new ApiError(400, 'pedido_invalido');
  }
  const data = new Uint8Array(Buffer.from(value, 'base64'));
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (data.length < 100 || data.length > LOGO_MAX_BYTES || png.some((b, i) => data[i] !== b)) throw new ApiError(400, 'pedido_invalido');
  return data;
}

/** La imagen del cupón para la vista previa del link, si el admin ya la subió. */
export async function findCouponPreview(sql: Sql, code: string): Promise<Uint8Array | null> {
  const [r] = await sql<{ datos: Buffer }[]>`select datos from cupones_vistas where codigo = ${code}`;
  return r === undefined ? null : new Uint8Array(r.datos);
}

export const couponView = (c: Coupon) => ({
  codigo: c.codigo,
  descuento: c.descuento,
  productos: c.productos,
  da: c.da_unidad === null ? null : { unidad: c.da_unidad, cantidad: c.da_cantidad, ocasion: c.ocasion },
});

export function registerCouponRoutes(app: Hono, deps: { sql: Sql; adminEmails: readonly string[]; publicUrl: string }): void {
  const { sql, adminEmails, publicUrl } = deps;

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

  /**
   * La página de invitación (/invitacion/CODIGO), sin cuenta: qué da el código, si todavía sirve.
   * No dice para qué mail es.
   */
  app.get('/api/invitacion/:codigo', async (c) => {
    const k = await shownCoupon(sql, { codigo: codeOf(c.req.param('codigo')) });
    c.header('cache-control', 'no-store');
    return c.json({ ...couponView(k), desde: k.desde.toISOString(), paraUnMail: k.email !== null });
  });

  /**
   * El link corto (/c/K7M2P): el cupón con su código (para dejarlo cargado en la compra) y hasta
   * cuándo vale. Tampoco dice para qué mail es.
   */
  app.get('/api/c/:corto', async (c) => {
    const corto = normalizeShortCode(c.req.param('corto'));
    if (corto === null) throw new ApiError(404, 'cupon_invalido');
    const k = await shownCoupon(sql, { corto });
    c.header('cache-control', 'no-store');
    const [logo] = await sql`select 1 from cupones_logos where codigo = ${k.codigo}`;
    return c.json({ ...couponView(k), corto: k.corto, desde: k.desde.toISOString(), hasta: k.hasta?.toISOString() ?? null, paraUnMail: k.email !== null, conLogo: logo !== undefined });
  });

  /** El logo de quien promueve el cupón (PNG con transparencia). */
  app.get('/api/c/:corto/logo.png', async (c) => {
    const corto = normalizeShortCode(c.req.param('corto'));
    const [r] = corto === null ? [] : await sql<{ datos: Buffer }[]>`select l.datos from cupones_logos l join cupones k on k.codigo = l.codigo where k.corto = ${corto}`;
    if (r === undefined) throw new ApiError(404, 'no_encontrado');
    return c.body(new Uint8Array(r.datos) as Uint8Array<ArrayBuffer>, 200, {
      'content-type': 'image/png',
      'cache-control': 'public, max-age=300',
      'content-security-policy': "default-src 'none'; sandbox",
      'content-disposition': 'inline',
    });
  });

  app.get('/api/c/:corto/vista.jpg', async (c) => {
    const corto = normalizeShortCode(c.req.param('corto'));
    const [k] = corto === null ? [] : await sql<{ codigo: string }[]>`select codigo from cupones where corto = ${corto}`;
    const data = k === undefined ? null : await findCouponPreview(sql, k.codigo);
    if (data === null) return c.redirect(`${publicUrl}/og.jpg`, 302);
    // Se puede volver a subir (si cambian las condiciones): sin immutable.
    return c.body(data as Uint8Array<ArrayBuffer>, 200, {
      'content-type': 'image/jpeg',
      'cache-control': 'public, max-age=3600',
      'content-security-policy': "default-src 'none'; sandbox",
      'content-disposition': 'inline',
    });
  });

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
    const rows = await sql<(Coupon & { con_vista: boolean; vista_creada: Date | null; con_logo: boolean })[]>`
      select k.*, exists (select 1 from cupones_vistas v where v.codigo = k.codigo) as con_vista,
             (select v.creada from cupones_vistas v where v.codigo = k.codigo) as vista_creada,
             exists (select 1 from cupones_logos l where l.codigo = k.codigo) as con_logo
      from cupones k where k.lote is null order by k.creado desc limit 500`;
    const lotes = await sql<{ id: string; nombre: string; creado_por: string; creado: Date; total: string; activos: string; con_mail: string; usados: string; codigo: string }[]>`
      select l.id, l.nombre, l.creado_por, l.creado,
             count(k.*) as total, count(k.*) filter (where k.activo) as activos, count(k.email) as con_mail,
             (select count(*) from cupon_usos u join cupones x on x.codigo = u.cupon where x.lote = l.id and u.estado = 'usado') as usados,
             min(k.codigo) as codigo
      from cupon_lotes l join cupones k on k.lote = l.id
      group by l.id order by l.creado desc limit 200`;
    // Las condiciones de cada lote, de uno de sus cupones (son iguales en todos).
    const loteTerms = lotes.length === 0 ? [] : await sql<Coupon[]>`select * from cupones where codigo in ${sql(lotes.map((l) => l.codigo))}`;
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
          corto: r.corto,
          conVista: r.con_vista,
          vistaCreada: r.vista_creada?.toISOString() ?? null,
          conLogo: r.con_logo,
          desde: r.desde.toISOString(),
          hasta: r.hasta?.toISOString() ?? null,
          maxUsos: r.max_usos,
          activo: r.activo,
          nota: r.nota,
          creadoPor: r.creado_por,
          creado: r.creado.toISOString(),
          email: r.email,
          usados: mine.reduce((a, u) => a + Number(u.usados), 0),
          reservados: mine.reduce((a, u) => a + Number(u.reservados), 0),
          satsResignados: mine.reduce((a, u) => a + BigInt(u.resignado), 0n).toString(),
          porProducto: Object.fromEntries(mine.filter((u) => u.producto !== null && Number(u.usados) > 0).map((u) => [u.producto, Number(u.usados)])),
        };
      }),
      lotes: lotes.map((l) => {
        const k = loteTerms.find((x) => x.codigo === l.codigo);
        return {
          id: l.id,
          nombre: l.nombre,
          creadoPor: l.creado_por,
          creado: l.creado.toISOString(),
          total: Number(l.total),
          activos: Number(l.activos),
          conMail: Number(l.con_mail),
          usados: Number(l.usados),
          ...(k === undefined ? { descuento: null, productos: [], da: null } : couponView(k)),
          desde: k?.desde.toISOString() ?? null,
          hasta: k?.hasta?.toISOString() ?? null,
          nota: k?.nota ?? '',
        };
      }),
    });
  });

  /** Las condiciones de un cupón (o de todos los de un lote), validadas. */
  const termsOf = (b: Record<string, unknown>) => {
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
    const date = (v: unknown): Date | null => {
      if (v === null || v === undefined || v === '') return null;
      const d = typeof v === 'string' ? new Date(v) : null;
      if (d === null || Number.isNaN(d.getTime())) throw new ApiError(400, 'pedido_invalido');
      return d;
    };
    const desde = date(b.desde) ?? new Date();
    const hasta = date(b.hasta);
    if (hasta !== null && hasta <= desde) throw new ApiError(400, 'pedido_invalido');
    return {
      descuento: descuento as number | null,
      productos: productos as string[],
      daUnidad: (da?.unidad as string | undefined) ?? null,
      daCantidad: (da?.cantidad as number | undefined) ?? null,
      ocasion: (da?.ocasion as string | undefined) ?? null,
      desde,
      hasta,
      nota: typeof b.nota === 'string' ? b.nota.trim().slice(0, 300) : '',
    };
  };
  type Terms = ReturnType<typeof termsOf>;
  const insertCoupon = (tx: Tx, code: string, t: Terms, maxUsos: number, email: string | null, lote: string | null, by: string) => tx`
    insert into cupones (codigo, descuento, productos, da_unidad, da_cantidad, ocasion, desde, hasta, max_usos, nota, creado_por, email, lote)
    values (${code}, ${t.descuento}, ${t.productos}, ${t.daUnidad}, ${t.daCantidad}, ${t.ocasion}, ${t.desde}, ${t.hasta}, ${maxUsos}, ${t.nota}, ${by}, ${email}, ${lote})
    on conflict (codigo) do nothing returning codigo`;

  /** Un cupón. Con `email`, solo lo usa esa cuenta (y una vez). */
  app.post('/api/admin/cupones', async (c) => {
    const account = await admin(c, true);
    const b = await body(c);
    const code = normalizeCode(b.codigo);
    if (code === null || code.length > 20) throw new ApiError(400, 'pedido_invalido');
    const terms = termsOf(b);
    const email = b.email === null || b.email === undefined || b.email === '' ? null : normalizeEmail(b.email);
    if (email === null && b.email !== null && b.email !== undefined && b.email !== '') throw new ApiError(400, 'pedido_invalido');
    const maxUsos = email !== null ? 1 : b.maxUsos;
    if (typeof maxUsos !== 'number' || !Number.isInteger(maxUsos) || maxUsos < 1 || maxUsos > 1_000_000) throw new ApiError(400, 'pedido_invalido');
    const inserted = await insertCoupon(sql, code, terms, maxUsos, email, null, account.email);
    if (inserted.length === 0) throw new ApiError(409, 'cupon_existente');
    await sql`insert into registro_admin (email, accion, detalle) values (${account.email}, 'cupon_creado', ${email === null ? code : `${code} para ${email}`})`;
    return c.json({ codigo: code }, 201);
  });

  /**
   * Un lote: `cantidad` códigos sueltos o uno por cada mail de `emails` (por ejemplo, de un CSV;
   * pueden ser de personas que todavía no tienen cuenta). Todos de un solo uso, con prefijo y 8
   * caracteres al azar. Devuelve los códigos para armar el CSV con los links de invitación.
   */
  app.post('/api/admin/cupones/lotes', async (c) => {
    const account = await admin(c, true);
    const b = await body(c);
    const nombre = typeof b.nombre === 'string' ? b.nombre.trim().slice(0, 80) : '';
    if (nombre === '') throw new ApiError(400, 'lote_invalido');
    const prefijo = b.prefijo === undefined || b.prefijo === null || b.prefijo === '' ? '' : typeof b.prefijo === 'string' ? b.prefijo.trim().toUpperCase() : null;
    if (prefijo === null || !/^[A-Z0-9]{0,12}$/.test(prefijo)) throw new ApiError(400, 'lote_invalido');
    const terms = termsOf(b);
    let emails: (string | null)[];
    if (Array.isArray(b.emails)) {
      const ok = b.emails.map(normalizeEmail);
      if (ok.some((e) => e === null)) throw new ApiError(400, 'lote_invalido');
      emails = [...new Set(ok as string[])];
    } else {
      const n = b.cantidad;
      if (typeof n !== 'number' || !Number.isInteger(n)) throw new ApiError(400, 'lote_invalido');
      emails = Array.from({ length: n }, () => null);
    }
    if (emails.length < 1 || emails.length > 2000) throw new ApiError(400, 'lote_invalido');
    const result = await sql.begin(async (tx) => {
      const [lote] = await tx<{ id: string }[]>`insert into cupon_lotes (nombre, creado_por) values (${nombre}, ${account.email}) returning id`;
      const codes: { codigo: string; email: string | null }[] = [];
      for (const email of emails) {
        // 40 bits al azar: un choque es rarísimo, pero si pasa se sortea otro.
        for (;;) {
          const code = prefijo + randomCodePart();
          if ((await insertCoupon(tx, code, terms, 1, email, lote!.id, account.email)).length > 0) {
            codes.push({ codigo: code, email });
            break;
          }
        }
      }
      await tx`insert into registro_admin (email, accion, detalle) values (${account.email}, 'lote_creado', ${`${nombre}: ${codes.length} cupones`})`;
      return { id: lote!.id, codes };
    });
    return c.json({ lote: result.id, cupones: result.codes }, 201);
  });

  /** Los cupones de un lote, con mail y si ya se usaron (para bajar el CSV). */
  app.get('/api/admin/cupones/lotes/:id', async (c) => {
    await admin(c, false);
    const id = c.req.param('id');
    if (!/^[0-9]{1,18}$/.test(id)) throw new ApiError(404, 'no_encontrado');
    const [lote] = await sql<{ nombre: string }[]>`select nombre from cupon_lotes where id = ${id}`;
    if (lote === undefined) throw new ApiError(404, 'no_encontrado');
    const rows = await sql<{ codigo: string; email: string | null; usado: boolean }[]>`
      select k.codigo, k.email, exists (select 1 from cupon_usos u where u.cupon = k.codigo and u.estado = 'usado') as usado
      from cupones k where k.lote = ${id} order by k.email nulls last, k.codigo`;
    return c.json({ nombre: lote.nombre, cupones: rows });
  });

  /** Pausar o reactivar todos los cupones de un lote. */
  app.post('/api/admin/cupones/lotes/:id/activo', async (c) => {
    const account = await admin(c, true);
    const id = c.req.param('id');
    if (!/^[0-9]{1,18}$/.test(id)) throw new ApiError(404, 'no_encontrado');
    const { activo } = await body(c);
    if (typeof activo !== 'boolean') throw new ApiError(400, 'pedido_invalido');
    const rows = await sql`update cupones set activo = ${activo} where lote = ${id} returning codigo`;
    if (rows.length === 0) throw new ApiError(404, 'no_encontrado');
    await sql`insert into registro_admin (email, accion, detalle) values (${account.email}, ${activo ? 'lote_reactivado' : 'lote_pausado'}, ${id})`;
    return c.json({ lote: id, activo });
  });

  /** Pausar o reactivar (lo que da un cupón usado no se edita: se pausa y se crea otro). */
  /**
   * La imagen del cupón para la vista previa de su link corto. La arma el navegador del admin al
   * copiar o compartir el cupón; no exige passkey (no cambia qué da el cupón).
   */
  app.post('/api/admin/cupones/:codigo/vista', async (c) => {
    await admin(c, false);
    const code = codeOf(c.req.param('codigo'));
    const data = parsePreview((await body(c)).imagen);
    const rows = await sql`
      insert into cupones_vistas (codigo, datos) select codigo, ${Buffer.from(data)} from cupones where codigo = ${code}
      on conflict (codigo) do update set datos = excluded.datos, creada = now()
      returning codigo`;
    if (rows.length === 0) throw new ApiError(404, 'cupon_invalido');
    return c.body(null, 204);
  });

  /**
   * Poner, cambiar o sacar (imagen: null) el logo de quien promueve el cupón. Cambia lo que ve el
   * público: pide passkey y queda en registro_admin. La imagen de la vista previa se borra para que
   * el admin la vuelva a armar con el logo.
   */
  app.post('/api/admin/cupones/:codigo/logo', async (c) => {
    const account = await admin(c, true);
    const code = codeOf(c.req.param('codigo'));
    const b = await body(c);
    const data = b.imagen === null ? null : parseLogo(b.imagen);
    await sql.begin(async (tx) => {
      const [k] = await tx`select 1 from cupones where codigo = ${code}`;
      if (k === undefined) throw new ApiError(404, 'cupon_invalido');
      if (data === null) await tx`delete from cupones_logos where codigo = ${code}`;
      else await tx`insert into cupones_logos (codigo, datos) values (${code}, ${Buffer.from(data)}) on conflict (codigo) do update set datos = excluded.datos, creado = now()`;
      await tx`delete from cupones_vistas where codigo = ${code}`;
      await tx`insert into registro_admin (email, accion, detalle) values (${account.email}, ${data === null ? 'cupon_logo_quitado' : 'cupon_logo'}, ${code})`;
    });
    return c.body(null, 204);
  });

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
