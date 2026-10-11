import { en } from './en.ts';
import { type Dict, es, type Key } from './es.ts';
import { it } from './it.ts';
import { pt } from './pt.ts';

export type UiLang = 'es' | 'pt' | 'en' | 'it';
export type { Key };

export const UI_LANGS: readonly UiLang[] = ['es', 'pt', 'en', 'it'];
export const DICTS: Readonly<Record<UiLang, Dict>> = { es, pt, en, it };
export const LANG_NAMES: Readonly<Record<UiLang, string>> = { es: 'Español', pt: 'Português', en: 'English', it: 'Italiano' };

/** Reemplaza {nombre} por su valor. */
export function format(template: string, vars: Readonly<Record<string, string | number>> = {}): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
}

export function translate(lang: UiLang, key: Key, vars?: Readonly<Record<string, string | number>>): string {
  return format(DICTS[lang][key], vars);
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
