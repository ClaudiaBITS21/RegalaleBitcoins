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

/** Los 5 regalos de bienvenida, al crear la cuenta (en la misma transacción). */
export async function grantWelcome(tx: Tx, accountId: string): Promise<void> {
  await tx`
    insert into movimientos (usuario_id, tipo, unidad, cantidad, origen, referencia)
    values (${accountId}, 'otorgamiento', 'regalo', ${WELCOME_GIFTS}, 'bienvenida', 'bienvenida')`;
}

export interface Plan {
  readonly type: 'anual' | 'fundador';
  readonly until: Date | null;
}

export async function activePlan(sql: Tx, accountId: string): Promise<Plan | null> {
  const [p] = await sql<{ tipo: 'anual' | 'fundador'; hasta: Date | null }[]>`
    select tipo, hasta from planes
    where usuario_id = ${accountId} and desde <= now() and (hasta is null or hasta > now())
    order by hasta desc nulls first limit 1`;
  return p === undefined ? null : { type: p.tipo, until: p.hasta };
}

export interface Balance {
  /** Regalos de bienvenida que quedan. */
  readonly welcome: number;
  /** Regalos pagos (packs, códigos, campañas, ajustes del admin). */
  readonly paid: number;
  readonly birthdayLists: number;
  readonly otherLists: number;
  readonly plan: Plan | null;
}

export async function balance(sql: Tx, accountId: string): Promise<Balance> {
  const rows = await sql<{ unidad: string; bienvenida: boolean; total: string }[]>`
    select unidad, origen = 'bienvenida' as bienvenida, coalesce(sum(cantidad), 0) as total
    from movimientos where usuario_id = ${accountId}
    group by 1, 2`;
  const sum = (unit: string, welcome?: boolean) =>
    rows.filter((r) => r.unidad === unit && (welcome === undefined || r.bienvenida === welcome)).reduce((a, r) => a + Number(r.total), 0);
  return {
    welcome: sum('regalo', true),
    paid: sum('regalo', false),
    birthdayLists: sum('lista_cumple'),
    otherLists: sum('lista_otras'),
    plan: await activePlan(sql, accountId),
  };
}

/** ¿Puede crear un regalo más? Con el cobro apagado, siempre. */
export function canGive(b: Balance, charging: boolean): boolean {
  return !charging || b.plan !== null || b.welcome > 0 || b.paid > 0;
}

/**
 * Consume el crédito de los regalos con cuenta que ya recibieron su primer depósito. Lo dispara
 * la tarea programada. Con el cobro apagado, el regalo queda resuelto sin consumir (gratis).
 */
export async function consumeGiftCredits(deps: { sql: Sql; chain: ChainClient }): Promise<number> {
  const { sql, chain } = deps;
  const pending = await sql<{ id: string; direccion: string; usuario_id: string }[]>`
    select id, direccion, usuario_id from regalos
    where credito is null and usuario_id is not null and creado > now() - interval '90 days'
    order by creado limit 100`;
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
      const [cantidad, origen] = b.plan !== null ? [0, 'plan'] : b.welcome > 0 ? [-1, 'bienvenida'] : [-1, 'pago'];
      await tx`
        insert into movimientos (usuario_id, tipo, unidad, cantidad, origen, referencia)
        values (${g.usuario_id}, 'consumo', 'regalo', ${cantidad}, ${origen}, ${g.id})
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
    insert into movimientos (usuario_id, tipo, unidad, cantidad, origen, referencia)
    select m.usuario_id, 'devolucion', m.unidad, -m.cantidad, m.origen, m.referencia
    from movimientos m join regalos r on r.id = m.referencia
    where m.tipo = 'consumo' and m.cantidad < 0 and r.reclamo_tipo = 'recupero'
    on conflict do nothing
    returning id`;
  return rows.length;
}
