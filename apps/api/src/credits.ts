import type postgres from 'postgres';
import type { ChainClient } from './chain.ts';
import type { Sql } from './db.ts';

// Créditos (handoff 2026-10-19, «cobro y créditos»). El saldo es la suma de los movimientos, que
// solo se agregan. Crear un regalo no consume: el crédito se usa cuando llega el primer depósito,
// una sola vez, en este orden: plan vigente (no descuenta, se registra el uso) → bienvenida →
// créditos pagos. Si el regalo se cancela (recupero) sin abrirse, el crédito vuelve a su origen.

export const WELCOME_GIFTS = 5;

/** La conexión o una transacción abierta. */
type Tx = Sql | postgres.TransactionSql;

/**
 * Lo gratis (la bienvenida), editable desde el admin (Claudia, 23/10): cuántos regalos y listas
 * trae y qué servicios incluye. Vive en la fila «bienvenida» de productos.
 */
export interface FreeOffer {
  readonly regalos: number;
  readonly listas: number;
  readonly ia: boolean;
  readonly tarjeta: boolean;
  readonly saludo: boolean;
}

export async function freeOffer(sql: Tx): Promise<FreeOffer> {
  const [r] = await sql<{ regalos: number; listas_otras: number; ia: boolean; tarjeta: boolean; saludo: boolean }[]>`
    select regalos, listas_otras, ia, tarjeta, saludo from productos where codigo = 'bienvenida'`;
  if (r === undefined) return { regalos: WELCOME_GIFTS, listas: 0, ia: false, tarjeta: false, saludo: false };
  return { regalos: r.regalos, listas: r.listas_otras, ia: r.ia, tarjeta: r.tarjeta, saludo: r.saludo };
}

/**
 * Cambia lo gratis. A las cuentas que todavía están en lo gratis (nunca compraron: sin pagos
 * confirmados ni planes) les suma o resta la diferencia en lo que les queda de la bienvenida, sin
 * bajar de cero; las que compraron conservan lo que tienen. Devuelve cuántas cuentas cambiaron.
 */
export async function setFreeOffer(sql: Sql, next: FreeOffer): Promise<{ before: FreeOffer; accounts: number }> {
  return sql.begin(async (tx) => {
    await tx`select codigo from productos where codigo = 'bienvenida' for update`;
    const before = await freeOffer(tx);
    await tx`
      update productos set regalos = ${next.regalos}, listas_otras = ${next.listas}, ia = ${next.ia}, tarjeta = ${next.tarjeta}, saludo = ${next.saludo}
      where codigo = 'bienvenida'`;
    const changed = new Set<string>();
    for (const [unidad, delta] of [['regalo', next.regalos - before.regalos], ['lista_otras', next.listas - before.listas]] as const) {
      if (delta === 0) continue;
      const rows = await tx<{ usuario_id: string }[]>`
        insert into movimientos (usuario_id, tipo, unidad, cantidad, origen, referencia, motivo)
        select u.id, 'ajuste', ${unidad}, greatest(${delta}::int, -coalesce(s.saldo, 0))::int, 'bienvenida', 'gratis', 'Cambio de lo gratis'
        from usuarios u
        left join (select usuario_id, sum(cantidad) as saldo from movimientos where unidad = ${unidad} and origen = 'bienvenida' group by 1) s on s.usuario_id = u.id
        where not exists (select 1 from pagos p where p.usuario_id = u.id and p.estado = 'confirmado')
          and not exists (select 1 from planes pl where pl.usuario_id = u.id)
          and not exists (select 1 from movimientos m where m.usuario_id = u.id and m.origen = 'pago')
          and greatest(${delta}::int, -coalesce(s.saldo, 0)) <> 0
        returning usuario_id`;
      for (const r of rows) changed.add(r.usuario_id);
    }
    return { before, accounts: changed.size };
  });
}

/** ¿Está activo el cobro? Mientras no lo esté, regalar es gratis y no se consume nada. */
export async function chargingActive(sql: Tx): Promise<boolean> {
  const [r] = await sql<{ valor: string }[]>`select valor from ajustes where clave = 'cobro_activo'`;
  return r?.valor === 'si';
}

export async function setChargingActive(sql: Tx, active: boolean): Promise<void> {
  await sql`
    insert into ajustes (clave, valor) values ('cobro_activo', ${active ? 'si' : 'no'})
    on conflict (clave) do update set valor = excluded.valor, actualizado = now()`;
}

/** Lo gratis (regalos y listas de bienvenida, según el admin), al crear la cuenta (en la misma transacción). */
export async function grantWelcome(tx: Tx, accountId: string): Promise<void> {
  const free = await freeOffer(tx);
  for (const [unidad, cantidad] of [['regalo', free.regalos], ['lista_otras', free.listas]] as const) {
    if (cantidad <= 0) continue;
    await tx`
      insert into movimientos (usuario_id, tipo, unidad, cantidad, origen, referencia)
      values (${accountId}, 'otorgamiento', ${unidad}, ${cantidad}, 'bienvenida', 'bienvenida')`;
  }
}

export interface Plan {
  readonly type: 'anual' | 'fundador';
  readonly until: Date | null;
  /** Regalos que le quedan al plan; null = libres. */
  readonly giftsLeft: number | null;
  /** Listas que incluye el plan. */
  readonly lists: number;
}

/**
 * El plan vigente que todavía cubre regalos (si hay varios, primero el de regalos libres). Los
 * regalos usados son los consumos con origen «plan» desde que empezó, salvo los recuperados.
 */
export async function activePlan(sql: Tx, accountId: string): Promise<Plan | null> {
  const plans = await sql<{ tipo: 'anual' | 'fundador'; hasta: Date | null; regalos: number | null; listas: number; usados: string }[]>`
    select p.tipo, p.hasta, p.regalos, p.listas,
      (select count(*) from movimientos m join regalos r on r.id = m.referencia
       where m.usuario_id = p.usuario_id and m.tipo = 'consumo' and m.origen = 'plan' and m.creado >= p.desde
         and r.reclamo_tipo is distinct from 'recupero') as usados
    from planes p
    where p.usuario_id = ${accountId} and p.desde <= now() and (p.hasta is null or p.hasta > now())
    order by p.regalos is null desc, p.hasta desc nulls first`;
  const all = plans.map((p) => ({ type: p.tipo, until: p.hasta, giftsLeft: p.regalos === null ? null : Math.max(0, p.regalos - Number(p.usados)), lists: p.listas }));
  return all.find((p) => p.giftsLeft === null || p.giftsLeft > 0) ?? all[0] ?? null;
}

/** ¿El plan cubre un regalo más? */
export function planCovers(plan: Plan | null): boolean {
  return plan !== null && (plan.giftsLeft === null || plan.giftsLeft > 0);
}

export interface Balance {
  /** Regalos de bienvenida que quedan. */
  readonly welcome: number;
  /** Regalos pagos (packs, códigos, campañas, ajustes del admin) que sirven para cualquier ocasión. */
  readonly paid: number;
  readonly birthdayLists: number;
  readonly otherLists: number;
  /** Créditos de cupón que solo sirven para una ocasión (21/10): ocasión → cantidad. */
  readonly giftsByOccasion: Readonly<Record<string, number>>;
  readonly listsByOccasion: Readonly<Record<string, number>>;
  readonly plan: Plan | null;
}

export async function balance(sql: Tx, accountId: string): Promise<Balance> {
  const rows = await sql<{ unidad: string; bienvenida: boolean; ocasion: string | null; total: string }[]>`
    select unidad, origen = 'bienvenida' as bienvenida, ocasion, coalesce(sum(cantidad), 0) as total
    from movimientos where usuario_id = ${accountId}
    group by 1, 2, 3`;
  const sum = (unit: string, welcome?: boolean) =>
    rows.filter((r) => r.unidad === unit && r.ocasion === null && (welcome === undefined || r.bienvenida === welcome)).reduce((a, r) => a + Number(r.total), 0);
  const byOccasion = (units: readonly string[]) => {
    const out: Record<string, number> = {};
    for (const r of rows) if (r.ocasion !== null && units.includes(r.unidad)) out[r.ocasion] = (out[r.ocasion] ?? 0) + Number(r.total);
    return Object.fromEntries(Object.entries(out).filter(([, n]) => n > 0));
  };
  return {
    welcome: sum('regalo', true),
    paid: sum('regalo', false),
    birthdayLists: sum('lista_cumple'),
    otherLists: sum('lista_otras'),
    giftsByOccasion: byOccasion(['regalo']),
    listsByOccasion: byOccasion(['lista_cumple', 'lista_otras']),
    plan: await activePlan(sql, accountId),
  };
}

/**
 * ¿Tiene lo que traen los planes (imagen con IA, tarjeta imprimible, salutación automática)? Con
 * el cobro apagado, todos; con el cobro activo, quien tiene un plan vigente o créditos comprados.
 * Lo gratis (solo la bienvenida) no lo trae (Rodolfo, 20/10). Los admins tienen todo, siempre,
 * para probar (Claudia, 22/10).
 */
export function hasPlanFeatures(b: Balance, charging: boolean, admin = false): boolean {
  return admin || !charging || planCovers(b.plan) || b.paid > 0;
}

/**
 * La salutación automática (Rodolfo, 21/10): la trae un plan vigente o haber comprado alguna vez un
 * producto que la incluye (todos menos Satoshi). Con el cobro apagado, todos la tienen.
 */
export async function hasGreetings(sql: Tx, accountId: string, b: Balance, charging: boolean, admin = false): Promise<boolean> {
  if (admin || !charging || planCovers(b.plan)) return true;
  const [row] = await sql`
    select 1 from pagos p join productos pr on pr.codigo = p.producto
    where p.usuario_id = ${accountId} and p.estado = 'confirmado' and pr.saludo limit 1`;
  return row !== undefined;
}

/** Qué servicios tiene una cuenta: los de un plan o compra, o los que el admin incluyó en lo gratis. */
export interface Features {
  readonly ia: boolean;
  readonly tarjeta: boolean;
  readonly saludo: boolean;
}

export async function features(sql: Tx, accountId: string, b: Balance, charging: boolean, admin = false): Promise<Features> {
  const [free, greetings] = await Promise.all([freeOffer(sql), hasGreetings(sql, accountId, b, charging, admin)]);
  const paid = hasPlanFeatures(b, charging, admin);
  return { ia: paid || free.ia, tarjeta: paid || free.tarjeta, saludo: greetings || free.saludo };
}

/**
 * ¿Puede crear un regalo más? Con el cobro apagado, siempre; un admin, siempre. Con una ocasión,
 * cuentan también los créditos de cupón de esa ocasión del catálogo (nunca la ocasión libre).
 */
export function canGive(b: Balance, charging: boolean, occasion?: string, admin = false): boolean {
  if (admin || !charging || planCovers(b.plan) || b.welcome > 0 || b.paid > 0) return true;
  return occasion !== undefined && occasion !== 'otra' && (b.giftsByOccasion[occasion] ?? 0) > 0;
}

/**
 * Consume el crédito de los regalos con cuenta que ya recibieron su primer depósito. Lo dispara
 * la tarea programada. Con el cobro apagado, el regalo queda resuelto sin consumir (gratis). Los
 * regalos de un admin quedan registrados sin descontar (cantidad 0, origen «admin»).
 */
export async function consumeGiftCredits(deps: { sql: Sql; chain: ChainClient; adminEmails?: readonly string[] }): Promise<number> {
  const { sql, chain } = deps;
  const fixed = deps.adminEmails ?? [];
  const pending = await sql<{ id: string; direccion: string; usuario_id: string; ocasion: string; admin: boolean }[]>`
    select r.id, r.direccion, r.usuario_id, r.ocasion,
      (u.email = any(${sql.array(fixed as string[])}::text[]) or exists (select 1 from admins a where a.email = u.email)) as admin
    from regalos r join usuarios u on u.id = r.usuario_id
    where r.credito is null and r.usuario_id is not null and r.creado > now() - interval '90 days'
    order by r.creado limit 100`;
  let consumed = 0;
  for (const g of pending) {
    let stats;
    try {
      stats = await chain.addressStats(g.direccion);
    } catch {
      continue;
    }
    if (stats.confirmedFunded + stats.mempoolFunded <= 0n) continue;
    const done = await sql.begin(async (tx) => {
      // Un regalo a la vez por cuenta: el saldo no se lee dos veces en paralelo.
      await tx`select id from usuarios where id = ${g.usuario_id} for update`;
      const marked = await tx`update regalos set credito = now() where id = ${g.id} and credito is null returning id`;
      if (marked.length === 0 || !(await chargingActive(tx))) return false;
      const b = await balance(tx, g.usuario_id);
      // Sin saldo ni plan (no debería pasar: la web ofrece los packs antes de mostrar la
      // dirección), el consumo va a los pagos y el saldo queda en negativo hasta que compre.
      // Orden (21/10): plan vigente → créditos de cupón de la ocasión del regalo → bienvenida → pagos.
      const forOccasion = g.ocasion !== 'otra' && (b.giftsByOccasion[g.ocasion] ?? 0) > 0;
      const [cantidad, origen, ocasion] = g.admin
        ? [0, 'admin', null]
        : planCovers(b.plan)
          ? [0, 'plan', null]
          : forOccasion
            ? [-1, 'codigo', g.ocasion]
            : b.welcome > 0
              ? [-1, 'bienvenida', null]
              : [-1, 'pago', null];
      await tx`
        insert into movimientos (usuario_id, tipo, unidad, cantidad, origen, referencia, ocasion)
        values (${g.usuario_id}, 'consumo', 'regalo', ${cantidad}, ${origen}, ${g.id}, ${ocasion})
        on conflict do nothing`;
      return true;
    });
    if (done) consumed++;
  }
  return consumed;
}

/** Devuelve el crédito de los regalos cancelados (recuperados) que nunca se abrieron. */
export async function refundCanceledGifts(sql: Sql): Promise<number> {
  const rows = await sql`
    insert into movimientos (usuario_id, tipo, unidad, cantidad, origen, referencia, ocasion)
    select m.usuario_id, 'devolucion', m.unidad, -m.cantidad, m.origen, m.referencia, m.ocasion
    from movimientos m join regalos r on r.id = m.referencia
    where m.tipo = 'consumo' and m.cantidad < 0 and r.reclamo_tipo = 'recupero'
    on conflict do nothing
    returning id`;
  return rows.length;
}
