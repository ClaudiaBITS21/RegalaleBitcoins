import { en } from './en.ts';
import { type Dict, es, type Key } from './es.ts';
import { it } from './it.ts';
import { pt } from './pt.ts';
import type { Trato } from './trato.ts';
import { tu } from './tu.ts';

export type UiLang = 'es' | 'pt' | 'en' | 'it';
export type { Key, Trato };

export const UI_LANGS: readonly UiLang[] = ['es', 'pt', 'en', 'it'];
export const DICTS: Readonly<Record<UiLang, Dict>> = { es, pt, en, it };
export const LANG_NAMES: Readonly<Record<UiLang, string>> = { es: 'Español', pt: 'Português', en: 'English', it: 'Italiano' };

/** Reemplaza {nombre} por su valor. */
export function format(template: string, vars: Readonly<Record<string, string | number>> = {}): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
}

/** En castellano con tú, la versión de tu.ts si la clave cambia; si no, la de siempre. */
export function translate(lang: UiLang, key: Key, vars?: Readonly<Record<string, string | number>>, trato: Trato = 'vos'): string {
  const text = lang === 'es' && trato === 'tu' ? (tu[key] ?? es[key]) : DICTS[lang][key];
  return format(text, vars);
}

/** Idioma de la interfaz: el guardado por la persona, o el del navegador, o castellano. */
export function detectLang(saved: string | null, browser: readonly string[]): UiLang {
  if (saved !== null && (UI_LANGS as readonly string[]).includes(saved)) return saved as UiLang;
  for (const tag of browser) {
    const base = tag.toLowerCase().split('-')[0];
    if ((UI_LANGS as readonly string[]).includes(base ?? '')) return base as UiLang;
  }
  return 'es';
}
