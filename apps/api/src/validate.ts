import { ApiError } from './errors.ts';

// Validaciones compartidas por regalos y listas: textos de la persona, montos e IP.

/** Margen entre la cotización del navegador y la del servidor. */
export const PRICE_TOLERANCE = 0.05;

export interface AmountInput {
  readonly satsExpected: bigint;
  readonly currency: 'USD' | 'ARS' | 'SAT';
  readonly amount: number;
}

export function text(value: unknown, max: number, required: boolean): string | null {
  if (value === undefined || value === null || value === '') {
    if (required) throw new ApiError(400, 'pedido_invalido');
    return null;
  }
  if (typeof value !== 'string') throw new ApiError(400, 'pedido_invalido');
  const clean = value.normalize('NFC').trim();
  // Se cuentan caracteres como los ve la persona (emojis incluidos), no unidades UTF-16.
  if ([...clean].length > max || (required && clean === '')) throw new ApiError(400, 'pedido_invalido');
  return clean === '' ? null : clean;
}

/** Monto coherente: mayor al mínimo de la red, debajo del techo y, en dólares, de acuerdo con la cotización. */
export function checkAmount(g: AmountInput, usdPerBtc: number, arsPerBtc: number | null, minimumSats: bigint, ceilingUsd: number): void {
  const usd = (Number(g.satsExpected) / 1e8) * usdPerBtc;
  if (g.satsExpected < minimumSats) throw new ApiError(422, 'monto_invalido', 'Debajo del mínimo que se puede reclamar con las comisiones de hoy.');
  if (usd > ceilingUsd * (1 + PRICE_TOLERANCE)) throw new ApiError(422, 'monto_invalido', `Supera el techo de USD ${ceilingUsd}.`);
  if (g.currency === 'SAT' && BigInt(Math.round(g.amount)) !== g.satsExpected) throw new ApiError(422, 'monto_invalido');
  if (g.currency === 'USD' || g.currency === 'ARS') {
    const fiat = g.currency === 'USD' ? usd : (Number(g.satsExpected) / 1e8) * (arsPerBtc as number);
    if (Math.round(g.amount * 100) !== g.amount * 100 || Math.abs(fiat - g.amount) > g.amount * PRICE_TOLERANCE) {
      throw new ApiError(422, 'monto_invalido', 'Los sats no corresponden al monto elegido.');
    }
  }
}

export function clientIp(forwarded: string | undefined): string {
  return forwarded?.split(',')[0]?.trim() || 'local';
}
