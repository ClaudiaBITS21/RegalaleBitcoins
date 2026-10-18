// Vos o tú: el castellano del sitio se escribe en voseo en la Argentina, Uruguay y Paraguay, y
// con tú en el resto. Se decide por dónde dice el dispositivo que está la persona, sin llamar a
// ningún servicio; quien lee puede cambiarlo en el selector de idioma.

export type Trato = 'vos' | 'tu';

/** Países donde se escribe con vos. */
const VOS = ['AR', 'UY', 'PY'];

/** Zonas horarias de esos países (incluidos los alias viejos de la Argentina). */
const TZ_VOS = /^America\/(Argentina\/|Buenos_Aires$|Catamarca$|Cordoba$|Jujuy$|Mendoza$|Rosario$|Montevideo$|Asuncion$)/;

/**
 * Primero la zona horaria (alguien en Ciudad de México con el navegador en es-AR está en
 * México); si no dice nada útil (UTC, Etc/…), la región del idioma (es-AR, es-MX…). Sin
 * ningún dato, vos.
 */
export function detectTrato(languages: readonly string[], timeZone: string | undefined): Trato {
  if (timeZone !== undefined && timeZone.includes('/') && !timeZone.startsWith('Etc/')) return TZ_VOS.test(timeZone) ? 'vos' : 'tu';
  for (const tag of languages) {
    const [base, ...rest] = tag.split('-');
    if (base?.toLowerCase() !== 'es') continue;
    // La región es la parte de 2 letras: es-AR, es-MX (es-419 no dice el país).
    const region = rest.find((p) => /^[A-Za-z]{2}$/.test(p));
    if (region !== undefined) return VOS.includes(region.toUpperCase()) ? 'vos' : 'tu';
  }
  return 'vos';
}

/** Lo que dice el navegador, envuelto para que nunca rompa la página. */
export function browserTrato(): Trato {
  try {
    const langs = typeof navigator === 'undefined' ? [] : (navigator.languages ?? [navigator.language]);
    return detectTrato(langs, Intl.DateTimeFormat().resolvedOptions().timeZone);
  } catch {
    return 'vos';
  }
}
