import { useEffect, useState } from 'preact/hooks';
import type { Lang } from '@regalale/core';

// Mensajes y remates de ejemplo por ocasión (docs/handoff/2026-10-17/mensajes-ejemplo.txt).
// El campo viene con un ejemplo real, elegido al azar, que la persona edita en el lugar.
// Se cargan por idioma solo cuando hacen falta.

export interface ExampleSet {
  readonly mensajes: readonly string[];
  readonly remates?: readonly string[];
}
export type Examples = Readonly<Record<string, ExampleSet | readonly string[]>>;

const FILES = import.meta.glob<{ default: Examples }>('./mensajes/*.json');
const cache = new Map<Lang, Promise<Examples>>();

export function loadExamples(lang: Lang): Promise<Examples> {
  let p = cache.get(lang);
  if (p === undefined) {
    const file = FILES[`./mensajes/${lang}.json`] ?? FILES['./mensajes/es.json'];
    p = file === undefined ? Promise.resolve({}) : file().then((m) => m.default);
    cache.set(lang, p);
  }
  return p;
}

/** Los ejemplos de un idioma, o null mientras cargan (o si no se pudieron cargar). */
export function useExamples(lang: Lang): Examples | null {
  const [data, setData] = useState<{ lang: Lang; ex: Examples } | null>(null);
  useEffect(() => {
    let live = true;
    loadExamples(lang)
      .then((ex) => live && setData({ lang, ex }))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [lang]);
  return data !== null && data.lang === lang ? data.ex : null;
}

/** Ocasión libre o sin set propio: los de "porque". */
export function examplesFor(ex: Examples, key: string, kind: 'mensajes' | 'remates'): readonly string[] {
  const own = ex[key];
  const set = own !== undefined && !Array.isArray(own) ? (own as ExampleSet) : (ex.porque as ExampleSet | undefined);
  return set?.[kind] ?? [];
}

/** Uno al azar, distinto del actual si hay más de uno. */
export function pickExample(list: readonly string[], current: string | null = null): string | null {
  const pool = list.length > 1 ? list.filter((m) => m !== current) : list;
  if (pool.length === 0) return null;
  const r = crypto.getRandomValues(new Uint32Array(1))[0] as number;
  return pool[r % pool.length] ?? null;
}

/** Reemplaza {nombre}/{nombres}; sin nombre todavía, deja un hueco visible. */
export function fillName(template: string, name: string, empty: string): string {
  const n = name.trim() === '' ? empty : name.trim();
  return template.replace(/\{nombres?\}/g, n);
}

export const REMATE_MAX = 60;

/**
 * El remate va al lado de nuestra marca: nada con forma de link o dominio (anti-phishing).
 * Bloquea esquemas, "www", direcciones de mail y cualquier "algo.tld".
 */
export function looksLikeLink(text: string): boolean {
  // Un punto seguido de espacio es puntuación ("Se apagan. Esto se guarda."); pegado, es dominio.
  return /[a-z][a-z0-9+.-]*:\/?\/|www\.|@[^\s]+\.|[a-z0-9-](\.|\[\.\]|\(\.\))[a-z]{2,}|\s(punto|dot)\s*(com|net|org|ar|io|app|xyz|me|co)\b/i.test(text);
}

/**
 * Mazo de una lista: la misma mezcla para todos los invitados (sale del id de la lista) y el
 * servidor reparte el número de turno; al terminar el mazo se vuelve a mezclar. No es secreto:
 * solo evita que dos invitados reciban el mismo ejemplo.
 */
export function deckPick<T>(list: readonly T[], listId: string, turn: number): T | undefined {
  if (list.length === 0) return undefined;
  const round = Math.floor(turn / list.length);
  let seed = 2166136261;
  for (const ch of `${listId}:${round}`) seed = Math.imul(seed ^ ch.charCodeAt(0), 16777619) >>> 0;
  const order = list.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const j = seed % (i + 1);
    [order[i], order[j]] = [order[j] as number, order[i] as number];
  }
  return list[order[turn % list.length] as number];
}
