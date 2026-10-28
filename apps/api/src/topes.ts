// Tope diario de los regalos de una cuenta (autorizado el 28/10/2026, docs/mainnet.md): la suma,
// en dólares, de los regalos que cargó en las últimas 24 horas (ventana móvil). Se controla en el
// servidor al registrar cada regalo. Cuenta el monto elegido al crearlo, pagado o no (contar solo
// los pagados dejaría cargar muchos sin pagar para pagarlos todos después). No cuentan los
// descartados: solo se descartan regalos cuya dirección nunca recibió nada.

import type { Sql } from './db.ts';
import { ApiError } from './errors.ts';

export const DAY_MS = 24 * 60 * 60 * 1000;
/** Margen para redondeos de la cotización (un regalo de USD 100 en pesos no da justo 100). */
const EPSILON_USD = 0.01;

/** El monto del regalo en dólares: el elegido si fue en dólares; si no, sats × cotización. */
export function giftUsd(g: { readonly currency: string; readonly amount: number; readonly satsExpected: bigint }, usdPerBtc: number): number {
  return g.currency === 'USD' ? g.amount : (Number(g.satsExpected) / 1e8) * usdPerBtc;
}

export interface DailyRow {
  readonly at: Date;
  readonly usd: number;
}

export type DailyCheck = { readonly ok: true } | { readonly ok: false; readonly remainingUsd: number; readonly from: Date };

/**
 * Si un regalo nuevo de `newUsd` entra en el tope. Si no: cuánto queda hoy y desde cuándo entra
 * (cuando salen de la ventana los regalos más viejos que hagan falta).
 */
export function dailyAllowance(rows: readonly DailyRow[], newUsd: number, limitUsd: number, now: Date): DailyCheck {
  const window = rows.filter((r) => now.getTime() - r.at.getTime() < DAY_MS).sort((a, b) => a.at.getTime() - b.at.getTime());
  let used = window.reduce((sum, r) => sum + r.usd, 0);
  if (used + newUsd <= limitUsd + EPSILON_USD) return { ok: true };
  const remainingUsd = Math.max(0, Math.floor((limitUsd - used) * 100) / 100);
  for (const r of window) {
    used -= r.usd;
    if (used + newUsd <= limitUsd + EPSILON_USD) return { ok: false, remainingUsd, from: new Date(r.at.getTime() + DAY_MS) };
  }
  // No pasa ni con la ventana vacía (un regalo más grande que el tope): no lo frena este control.
  return { ok: true };
}

export async function checkDailyLimit(sql: Sql, accountId: string, network: string, newUsd: number, limitUsd: number, now = new Date()): Promise<void> {
  const rows = await sql<{ creado: Date; moneda: string | null; monto: string | null; sats_esperados: string | null; usd_por_btc: string | null }[]>`
    select creado, moneda, monto, sats_esperados, usd_por_btc from regalos
    where usuario_id = ${accountId} and red = ${network} and creado > ${new Date(now.getTime() - DAY_MS)} and descartado is null`;
  const daily = rows.map((r) => ({
    at: r.creado,
    usd: r.moneda === 'USD' && r.monto !== null ? Number(r.monto) : (Number(r.sats_esperados ?? 0) / 1e8) * Number(r.usd_por_btc ?? 0),
  }));
  const check = dailyAllowance(daily, newUsd, limitUsd, now);
  if (!check.ok) throw new ApiError(409, 'tope_diario', `Supera los USD ${limitUsd} por día de la cuenta.`, { topeUsd: limitUsd, restaUsd: check.remainingUsd, desde: check.from.toISOString() });
}
