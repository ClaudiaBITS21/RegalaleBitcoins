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

/**
 * Sats en corto, para los precios ("10,5K sats", "210K sats"): con el separador decimal del idioma.
 * La K es la misma en todos los idiomas, a propósito: los precios se leen igual en cualquier lado.
 */
export function formatSatsShort(sats: bigint, lang: UiLang): string {
  const n = Number(sats);
  const [v, suf] = n >= 1e6 ? [n / 1e6, 'M'] : n >= 1e3 ? [n / 1e3, 'K'] : [n, ''];
  return `${new Intl.NumberFormat(LOCALES[lang], { ...GROUPING, maximumFractionDigits: 1 }).format(v)}${suf} sats`;
}

/** Un precio en dólares: sin centavos si es entero ("US$ 21"), con dos si no ("US$ 10,50"). */
export function formatUsdPrice(amount: number, lang: UiLang): string {
  const digits = Number.isInteger(amount) ? 0 : 2;
  return new Intl.NumberFormat(LOCALES[lang], { ...GROUPING, style: 'currency', currency: 'USD', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(amount);
}

/** Dólares siempre con centavos ("US$ 1.234,50"): para montos que la persona eligió. */
export function formatUsdExact(amount: number, lang: UiLang): string {
  return new Intl.NumberFormat(LOCALES[lang], { ...GROUPING, style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
}

export function formatFiat(amount: number, currency: string, lang: UiLang): string {
  if (currency === 'SAT') return formatSats(BigInt(Math.round(amount)), lang);
  return new Intl.NumberFormat(LOCALES[lang], { ...GROUPING, style: 'currency', currency, maximumFractionDigits: 2 }).format(amount);
}

/** Variación con signo y un decimal: "+3,2 %", "−10 %" (sin decimal si es entera). */
export function formatChange(change: number, lang: UiLang): string {
  return new Intl.NumberFormat(LOCALES[lang], { style: 'percent', signDisplay: 'exceptZero', maximumFractionDigits: 1 }).format(change);
}

/** Valor de hoy de un regalo: dólares (sin centavos desde 10) o pesos sin decimales. */
export function formatValue(amount: number, currency: 'USD' | 'ARS', lang: UiLang): string {
  return currency === 'USD' ? formatUsd(amount, lang) : new Intl.NumberFormat(LOCALES[lang], { ...GROUPING, style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(amount);
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

/**
 * Link de pago BIP21: las billeteras completan dirección y monto al escanear el QR o pegarlo.
 * En mayúsculas el QR sale más chico (modo alfanumérico); para copiar y pegar, en minúsculas.
 */
export function paymentUri(address: string, sats: bigint, upper = true): string {
  return `bitcoin:${upper ? address.toUpperCase() : address}?amount=${satsToBtcString(sats)}`;
}

/** Un monto redondo sin centavos ("$ 25.000", "US$ 50"): para los montos sugeridos. */
export function formatWhole(amount: number, currency: 'USD' | 'ARS', lang: UiLang): string {
  return new Intl.NumberFormat(LOCALES[lang], { ...GROUPING, style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
}

/** Centavos (de dólar o de peso) a sats con la cotización de 1 BTC en esa moneda. */
export function fiatCentsToSats(cents: bigint, pricePerBtc: number): bigint {
  return BigInt(Math.round((Number(cents) * 1_000_000) / pricePerBtc));
}

export const usdCentsToSats = fiatCentsToSats;

/** Pesos con centavos ("$ 40.000,00"). */
/**
 * Un monto en la unidad menor de su moneda (centavos de peso, de real, de euro…), exacto: con
 * los decimales de la moneda. Para las transferencias de las listas, que son de cualquier país.
 */
export function formatMinor(minor: bigint, currency: string, lang: UiLang): string {
  const nf = new Intl.NumberFormat(LOCALES[lang], { ...GROUPING, style: 'currency', currency });
  const digits = nf.resolvedOptions().maximumFractionDigits ?? 2;
  const scale = 10n ** BigInt(digits);
  const whole = minor / scale;
  const frac = minor % scale;
  // Sin pasar por float: el entero (ya agrupado) y los decimales por separado, en el lugar que
  // les da el formato de la moneda.
  const integer = new Intl.NumberFormat(LOCALES[lang], { ...GROUPING, maximumFractionDigits: 0 }).format(whole);
  let out = '';
  let integerDone = false;
  for (const p of nf.formatToParts(Number(whole) + (digits > 0 ? 0.1 : 0))) {
    if (p.type === 'integer' || p.type === 'group') {
      if (!integerDone) out += integer;
      integerDone = true;
    } else out += p.type === 'fraction' ? frac.toString().padStart(digits, '0') : p.value;
  }
  return out;
}

export function formatArsExact(amount: number, lang: UiLang): string {
  return new Intl.NumberFormat(LOCALES[lang], { ...GROUPING, style: 'currency', currency: 'ARS', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
}
