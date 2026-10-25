import type { GiftView } from './api.ts';
import { formatFiat, formatUsd, formatWhole, satsToUsd } from './format.ts';
import type { UiLang } from './i18n/index.ts';

/**
 * Lo que valía el regalo en plata al hacerlo, en la moneda que eligió quien regala; si eligió
 * sats, en dólares de ese día. null si no hay dato o no lo quiso mostrar.
 */
export function giftValueText(gift: GiftView, lang: UiLang): string | null {
  const o = gift.original;
  if (o === null || gift.mostrarValor === false) return null;
  if (o.moneda === 'USD' || o.moneda === 'ARS') return o.moneda === 'ARS' ? formatWhole(o.monto, 'ARS', lang) : formatFiat(o.monto, o.moneda, lang);
  if (o.moneda === 'SAT' && o.usdPorBtc !== null) return formatUsd(satsToUsd(BigInt(Math.round(o.monto)), o.usdPorBtc), lang);
  return null;
}

