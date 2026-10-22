// Borrador de «Regalar» guardado en la pestaña (sessionStorage) para no perder lo escrito si la
// página se recarga: en la app instalada, «Ver planes» sale de /regalar y al volver con «Atrás»
// la página arranca de nuevo. Solo la parte de antes de las claves: ocasión, nombres, mensaje,
// estilo y monto. Nada secreto (clave maestra, palabras, regalo armado) pasa por acá.

import type { Draft } from './GivePage.tsx';

const KEY = 'regalale.regalar.borrador';

/** Pasos que se pueden retomar sin nada en memoria; el resto corta el borrador ahí. */
const RETOMABLES: readonly string[] = ['ocasion', 'para', 'cuanto', 'guardar', 'tengoCodigo'];

export interface Borrador<S extends string> {
  readonly steps: S[];
  readonly draft: Draft;
}

type Guardado = Omit<Draft, 'sats'> & { sats: string };

/** Los pasos desde el principio hasta el último retomable (vacío si el primero no lo es). */
export function pasosRetomables<S extends string>(steps: readonly S[]): S[] {
  const corte = steps.findIndex((s) => !RETOMABLES.includes(s));
  return corte < 0 ? [...steps] : steps.slice(0, corte);
}

export function serializar<S extends string>(steps: readonly S[], draft: Draft, conImagen = true): string | null {
  const pasos = pasosRetomables(steps);
  if (pasos.length === 0) return null;
  const d: Guardado = { ...draft, sats: draft.sats.toString() };
  if (!conImagen && d.ownImage !== null) {
    d.ownImage = null;
    if (d.style === 'propia') d.style = 'ilustracion';
  }
  return JSON.stringify({ steps: pasos, draft: d });
}

export function deserializar<S extends string>(texto: string | null): Borrador<S> | null {
  if (texto === null) return null;
  try {
    const { steps, draft } = JSON.parse(texto) as { steps: unknown; draft: Guardado };
    if (!Array.isArray(steps) || steps.length === 0 || !steps.every((s) => typeof s === 'string' && RETOMABLES.includes(s))) return null;
    if (typeof draft !== 'object' || draft === null || typeof draft.sats !== 'string' || !/^\d+$/.test(draft.sats)) return null;
    return { steps: steps as S[], draft: { ...draft, sats: BigInt(draft.sats) } };
  } catch {
    return null;
  }
}

/** Guarda el borrador; si no entra (imagen propia grande), sin la imagen. Sin almacenamiento, nada. */
export function guardarBorrador<S extends string>(steps: readonly S[], draft: Draft): void {
  try {
    const texto = serializar(steps, draft);
    if (texto === null) return borrarBorrador();
    try {
      sessionStorage.setItem(KEY, texto);
    } catch {
      sessionStorage.setItem(KEY, serializar(steps, draft, false) as string);
    }
  } catch {
    // Modo privado o sin espacio: el borrador vale solo mientras la página esté abierta.
  }
}

/** Lo recupera solo si se volvió a la página (Atrás) o se la recargó, no al entrar de nuevo a Regalar. */
export function recuperarBorrador<S extends string>(): Borrador<S> | null {
  try {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    if (nav === undefined || nav.type === 'navigate') return null;
    return deserializar<S>(sessionStorage.getItem(KEY));
  } catch {
    return null;
  }
}

export function borrarBorrador(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Sin almacenamiento: no había nada guardado.
  }
}
