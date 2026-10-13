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
