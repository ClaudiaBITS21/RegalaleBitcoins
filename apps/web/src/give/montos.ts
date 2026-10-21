import type { Country } from '../content/temporada.ts';

export type Unit = 'USD' | 'ARS' | 'SAT';

/**
 * Montos sugeridos en la moneda elegida (pedido de Rodolfo, 21/10): en pesos y en sats, los mismos
 * números que en dólares por mil (25.000, 50.000, 100.000). No es la conversión exacta: son
 * números redondos que se entienden de un vistazo, y abajo de cada uno va su equivalente.
 */
export function presetsFor(unit: Unit, usd: readonly number[]): readonly number[] {
  return unit === 'USD' ? usd : usd.map((n) => n * 1000);
}

/** La moneda local con la que arranca el paso: pesos en Argentina si hay cotización; si no, dólares. */
export function defaultUnit(country: Country, hasArs: boolean): Unit {
  return country === 'AR' && hasArs ? 'ARS' : 'USD';
}
