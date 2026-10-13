import type { UiLang } from './i18n/index.ts';

const LOCALES: Readonly<Record<UiLang, string>> = { es: 'es-AR', pt: 'pt-BR', en: 'en-US', it: 'it-IT' };

// Separadores según idioma: es/pt/it usan punto para miles y coma para decimales; en, al revés.
// Agrupar siempre: CLDR deja sin separador los números de 4 cifras en italiano (1234).
const GROUPING = { useGrouping: 'always' } as const;

export function formatSats(sats: bigint, lang: UiLang): string {
  return `${new Intl.NumberFormat(LOCALES[lang], GROUPING).format(sats)} sats`;
}

export function formatUsd(amount: number, lang: UiLang): string {
  return new Intl.NumberFormat(LOCALES[lang], { ...GROUPING, style: 'currency', currency: 'USD', maximumFractionDigits: amount < 10 ? 2 : 0 }).format(amount);
}

/** Dólares siempre con centavos ("US$ 1.234,50"): para montos que la persona eligió. */
export function formatUsdExact(amount: number, lang: UiLang): string {
  return new Intl.NumberFormat(LOCALES[lang], { ...GROUPING, style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
}

export function formatFiat(amount: number, currency: string, lang: UiLang): string {
  if (currency === 'SAT') return formatSats(BigInt(Math.round(amount)), lang);
  return new Intl.NumberFormat(LOCALES[lang], { ...GROUPING, style: 'currency', currency, maximumFractionDigits: 2 }).format(amount);
}

export function satsToUsd(sats: bigint, usdPerBtc: number): number {
  return (Number(sats) / 1e8) * usdPerBtc;
}

/** Dirección en grupos de 4 para leerla y compararla con la billetera. */
export function groupAddress(address: string): string {
  return address.match(/.{1,4}/g)?.join(' ') ?? address;
}

const EXPLORERS: Readonly<Record<string, string>> = {
  mainnet: 'https://mempool.space/tx/',
  testnet: 'https://mempool.space/testnet4/tx/',
  signet: 'https://mempool.space/signet/tx/',
};

export function explorerTxUrl(network: string, txid: string): string | null {
  const base = EXPLORERS[network];
  return base === undefined || !/^[0-9a-f]{64}$/.test(txid) ? null : `${base}${txid}`;
}

export type AmountParse = { ok: true; value: bigint } | { ok: false; error: 'vacio' | 'formato' | 'decimales' };

const SEPARATORS: Readonly<Record<UiLang, { group: string; decimal: string }>> = {
  es: { group: '.', decimal: ',' },
  pt: { group: '.', decimal: ',' },
  it: { group: '.', decimal: ',' },
  en: { group: ',', decimal: '.' },
};

/**
 * Lee un monto escrito por la persona con los separadores de su idioma: en es/pt/it
 * "1.234,5" son mil doscientos treinta y cuatro y medio; en en, "1,234.5". Un separador
 * de miles mal puesto ("1.5" en castellano) no se adivina: se rechaza.
 * Devuelve el valor en la unidad mínima: centavos (decimals = 2) o sats (decimals = 0).
 */
export function parseAmount(input: string, lang: UiLang, decimals: 0 | 2): AmountParse {
  const clean = input.replace(/[\s  ]/g, '');
  if (clean === '') return { ok: false, error: 'vacio' };
  const { group, decimal } = SEPARATORS[lang];
  const g = group === '.' ? '\\.' : group;
  const d = decimal === '.' ? '\\.' : decimal;
  const match = new RegExp(`^(\\d{1,3}(?:${g}\\d{3})+|\\d+)(?:${d}(\\d+))?$`).exec(clean);
  if (match === null) return { ok: false, error: 'formato' };
  const whole = (match[1] as string).split(group).join('');
  const fraction = (match[2] ?? '').replace(/0+$/, '');
  if (fraction.length > decimals) return { ok: false, error: 'decimales' };
  return { ok: true, value: BigInt(whole + fraction.padEnd(decimals, '0')) };
}

/** Sats como BTC con punto decimal y sin ceros de más, para el link de pago (BIP21). */
export function satsToBtcString(sats: bigint): string {
  const whole = sats / 100_000_000n;
  const fraction = (sats % 100_000_000n).toString().padStart(8, '0').replace(/0+$/, '');
  return fraction === '' ? whole.toString() : `${whole}.${fraction}`;
}

/** Link de pago BIP21: las billeteras completan dirección y monto al escanear el QR. */
export function paymentUri(address: string, sats: bigint): string {
  return `bitcoin:${address.toUpperCase()}?amount=${satsToBtcString(sats)}`;
}

/** Centavos de dólar a sats con la cotización dada. */
export function usdCentsToSats(cents: bigint, usdPerBtc: number): bigint {
  return BigInt(Math.round((Number(cents) * 1_000_000) / usdPerBtc));
}
