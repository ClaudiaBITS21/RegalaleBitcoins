import { browserCountry } from './content/temporada.ts';

// De dónde llegó quien crea una cuenta (Claudia, 25/10), para la estadística de altas: el sitio
// de donde vino (solo el dominio), la etiqueta utm_source del link o «cupon», o «directo». Se
// anota en la primera página de la visita y se manda una sola vez, al crear la cuenta, junto con
// el país aproximado (por la zona horaria). El servidor solo suma 1 a un contador: no queda en
// la cuenta.

const KEY = 'regalale.origen';
const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 56);

function detect(): string {
  const url = new URL(window.location.href);
  const utm = clean(url.searchParams.get('utm_source') ?? '');
  if (utm !== '') return `utm:${utm}`;
  if (/^\/(c|invitacion)\//.test(url.pathname)) return 'cupon';
  try {
    const ref = document.referrer === '' ? null : new URL(document.referrer);
    if (ref !== null && ref.host !== url.host) {
      const host = clean(ref.hostname.replace(/^www\./, ''));
      if (host !== '') return host;
    }
  } catch {
    // Referrer raro: como si no hubiera.
  }
  return 'directo';
}

/** Al abrir el sitio: anota el origen de esta visita (solo la primera página cuenta). */
export function captureOrigin(): void {
  try {
    if (sessionStorage.getItem(KEY) === null) sessionStorage.setItem(KEY, detect());
  } catch {
    // Sin almacenamiento: queda «directo».
  }
}

/** Lo que se manda al crear la cuenta. */
export function signupStats(): { pais: string; origen: string } {
  let origen = 'directo';
  try {
    origen = sessionStorage.getItem(KEY) ?? 'directo';
  } catch {
    // Sin almacenamiento.
  }
  return { pais: browserCountry(), origen };
}
