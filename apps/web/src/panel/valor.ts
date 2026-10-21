// Cuánto vale hoy un regalo y cuánto cambió (Claudia, 21/10): en la moneda en que se armó (dólares
// o pesos), contra lo que se puso. Si se armó en sats, en dólares, contra la cotización de ese día.
// Los sats no cambian: lo que cambia es el precio del bitcoin.

export interface GiftValue {
  readonly moneda: 'USD' | 'ARS';
  /** Valor de hoy. */
  readonly hoy: number;
  /** Variación contra lo que se puso (0,05 = +5 %); null si no se sabe cuánto se puso. */
  readonly variacion: number | null;
}

const SATS_PER_BTC = 100_000_000;

export function giftValue(
  sats: bigint | null,
  original: { readonly moneda: string; readonly monto: number; readonly usdPorBtc: number | null } | null,
  cotizacion: { readonly usdPorBtc: number | null; readonly arsPorBtc: number | null },
): GiftValue | null {
  if (sats === null || sats <= 0n) return null;
  const btc = Number(sats) / SATS_PER_BTC;
  if (original?.moneda === 'ARS' && cotizacion.arsPorBtc !== null) {
    const hoy = btc * cotizacion.arsPorBtc;
    return { moneda: 'ARS', hoy, variacion: original.monto > 0 ? hoy / original.monto - 1 : null };
  }
  if (cotizacion.usdPorBtc === null) return null;
  const hoy = btc * cotizacion.usdPorBtc;
  // Lo que valía en dólares al armarlo: el monto si fue en dólares; si no (sats, o pesos sin la
  // cotización en pesos de hoy), los sats a la cotización del dólar de ese día.
  const antes = original?.moneda === 'USD' ? original.monto : original?.usdPorBtc != null ? btc * original.usdPorBtc : null;
  return { moneda: 'USD', hoy, variacion: antes !== null && antes > 0 ? hoy / antes - 1 : null };
}
