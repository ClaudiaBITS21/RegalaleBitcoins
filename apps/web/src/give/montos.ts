import type { Country } from '../content/temporada.ts';

export type Unit = 'USD' | 'ARS' | 'SAT';

/**
 * Montos sugeridos en la moneda elegida (pedido de Rodolfo, 21/10). En pesos, los mismos números
 * que en dólares por mil (25.000, 50.000, 100.000): no es la conversión exacta, son números
 * redondos que se entienden de un vistazo. En sats, los sats que valen hoy los sugeridos en
 * dólares, que van en chico abajo.
 */
export function presetsFor(unit: Unit, usd: readonly number[], usdPerBtc: number): readonly number[] {
  if (unit === 'USD') return usd;
  if (unit === 'ARS') return usd.map((n) => n * 1000);
  return usd.map((n) => Math.round((n * 1e8) / usdPerBtc));
}

/** La moneda local con la que arranca el paso: pesos en Argentina si hay cotización; si no, dólares. */
export function defaultUnit(country: Country, hasArs: boolean): Unit {
  return country === 'AR' && hasArs ? 'ARS' : 'USD';
}
