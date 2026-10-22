// En qué país está la persona, para mandarla a la versión de CriptoYa de su país en «¿No tenés
// bitcoin?». Igual que el vos o tú (i18n/trato.ts): por lo que dice el dispositivo, sin llamar a
// ningún servicio. Solo los países donde CriptoYa tiene versión; el resto, null.

/** País → ruta en criptoya.com (la raíz es la Argentina). Verificadas el 22/10/2026. */
const CRIPTOYA: Readonly<Record<string, string>> = { AR: '', BO: 'bo', BR: 'br', CL: 'cl', CO: 'co', MX: 'mx', PE: 'pe', VE: 've' };

const TZ_PAIS: readonly (readonly [RegExp, string])[] = [
  [/^America\/(Argentina\/|Buenos_Aires$|Catamarca$|Cordoba$|Jujuy$|Mendoza$|Rosario$)/, 'AR'],
  [/^America\/La_Paz$/, 'BO'],
  [/^America\/(Sao_Paulo|Bahia|Fortaleza|Recife|Belem|Maceio|Araguaina|Santarem|Manaus|Cuiaba|Campo_Grande|Porto_Velho|Boa_Vista|Rio_Branco|Eirunepe|Noronha)$/, 'BR'],
  [/^(America\/(Santiago|Punta_Arenas)|Pacific\/Easter)$/, 'CL'],
  [/^America\/Bogota$/, 'CO'],
  [/^America\/(Mexico_City|Cancun|Merida|Monterrey|Matamoros|Chihuahua|Ciudad_Juarez|Ojinaga|Mazatlan|Bahia_Banderas|Hermosillo|Tijuana)$/, 'MX'],
  [/^America\/Lima$/, 'PE'],
  [/^America\/Caracas$/, 'VE'],
];

/**
 * Primero la zona horaria (una zona útil que no está en la lista es otro país: null); si no dice
 * nada (UTC, Etc/…), la región del idioma (es-MX, pt-BR…).
 */
export function detectCountry(languages: readonly string[], timeZone: string | undefined): string | null {
  if (timeZone !== undefined && timeZone.includes('/') && !timeZone.startsWith('Etc/')) return TZ_PAIS.find(([re]) => re.test(timeZone))?.[1] ?? null;
  for (const tag of languages) {
    const region = tag.split('-').slice(1).find((p) => /^[A-Za-z]{2}$/.test(p));
    if (region !== undefined) return region.toUpperCase();
  }
  return null;
}

/** La versión de CriptoYa del país, o null si no tiene. */
export function criptoyaUrl(country: string | null): string | null {
  const ruta = country === null ? undefined : CRIPTOYA[country];
  return ruta === undefined ? null : `https://criptoya.com/${ruta}`;
}

/** Lo que dice el navegador, envuelto para que nunca rompa la página. */
export function browserCriptoyaUrl(): string | null {
  try {
    const langs = typeof navigator === 'undefined' ? [] : (navigator.languages ?? [navigator.language]);
    return criptoyaUrl(detectCountry(langs, Intl.DateTimeFormat().resolvedOptions().timeZone));
  } catch {
    return null;
  }
}
