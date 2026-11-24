import { browserCountry } from './content/temporada.ts';

// De dónde llegó la visita (Claudia, 25/10), para la estadística de altas y el embudo por campaña
// (24/11, eventos.ts): el sitio de donde vino (solo el dominio), la etiqueta utm_source del link,
// «cupon», «regalo» (entró por el link de un regalo que le hicieron) o «directo». Se anota en la
// primera página de la visita. Al crear la cuenta se manda junto con el país aproximado (por la
// zona horaria). El servidor solo suma 1 a un contador: no queda en la cuenta ni en ningún regalo.
//
// El origen se recuerda 7 días en este navegador (Claudia, 24/11): lo que pase en esa semana
// cuenta para la campaña por la que llegó la persona, aunque vuelva otro día escribiendo la
// dirección. Queda en localStorage (solo el origen y el día en que vence) y nunca viaja como tal:
// el servidor recibe la misma etiqueta de siempre.

const KEY = 'regalale.origen';
const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 56);

function detect(): string {
  const url = new URL(window.location.href);
  const utm = clean(url.searchParams.get('utm_source') ?? '');
  if (utm !== '') return `utm:${utm}`;
  if (/^\/(c|invitacion)\//.test(url.pathname)) return 'cupon';
  if (/^\/r\//.test(url.pathname)) return 'regalo';
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

const REMEMBER_KEY = 'regalale.origen.recordado';
/** Cuánto se recuerda el origen: el tiempo que hay entre campaña y campaña. */
export const REMEMBER_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface RememberedOrigin {
  readonly origen: string;
  /** Día en que deja de valer, como número de día desde 1970 (sin hora). */
  readonly vence: number;
}

/**
 * El origen de esta visita y lo que queda recordado. Un link de campaña o de cupón manda siempre
 * (y renueva los 7 días); si no, vale lo recordado mientras no venza; si no hay nada, lo detectado
 * (y se recuerda, salvo «directo», que no dice nada).
 */
export function resolveOrigin(detected: string, remembered: RememberedOrigin | null, now: number): { origen: string; recordar: RememberedOrigin | null } {
  const hoy = Math.floor(now / DAY_MS);
  const vigente = remembered !== null && remembered.vence > hoy && remembered.vence <= hoy + REMEMBER_DAYS ? remembered : null;
  const nuevo = { origen: detected, vence: hoy + REMEMBER_DAYS };
  if (detected.startsWith('utm:') || detected === 'cupon') return { origen: detected, recordar: nuevo };
  if (vigente !== null) return { origen: vigente.origen, recordar: vigente };
  return { origen: detected, recordar: detected === 'directo' ? null : nuevo };
}

function readRemembered(): RememberedOrigin | null {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(REMEMBER_KEY) ?? 'null');
    if (v === null || typeof v !== 'object') return null;
    const { origen, vence } = v as { origen?: unknown; vence?: unknown };
    return typeof origen === 'string' && /^[a-z0-9:._-]{1,64}$/.test(origen) && typeof vence === 'number' && Number.isInteger(vence) ? { origen, vence } : null;
  } catch {
    return null;
  }
}

/** Al abrir el sitio: anota el origen de esta visita (solo la primera página cuenta). */
export function captureOrigin(): void {
  try {
    if (sessionStorage.getItem(KEY) !== null) return;
    const { origen, recordar } = resolveOrigin(detect(), readRemembered(), Date.now());
    sessionStorage.setItem(KEY, origen);
    try {
      if (recordar === null) localStorage.removeItem(REMEMBER_KEY);
      else localStorage.setItem(REMEMBER_KEY, JSON.stringify(recordar));
    } catch {
      // Sin almacenamiento duradero: el origen vale solo para esta visita.
    }
  } catch {
    // Sin almacenamiento: queda «directo».
  }
}

/** El origen anotado para esta visita. */
export function visitOrigin(): string {
  try {
    return sessionStorage.getItem(KEY) ?? 'directo';
  } catch {
    // Sin almacenamiento.
    return 'directo';
  }
}

/** Lo que se manda al crear la cuenta. */
export function signupStats(): { pais: string; origen: string } {
  return { pais: browserCountry(), origen: visitOrigin() };
}
