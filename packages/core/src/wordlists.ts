import { wordlist as english } from '@scure/bip39/wordlists/english.js';
import { wordlist as italian } from '@scure/bip39/wordlists/italian.js';
import { wordlist as portuguese } from '@scure/bip39/wordlists/portuguese.js';
import { wordlist as spanish } from '@scure/bip39/wordlists/spanish.js';

/** Idiomas de la passphrase del regalo (el del que recibe). */
export const LANGS = ['es', 'pt', 'en', 'it'] as const;
export type Lang = (typeof LANGS)[number];

for (const list of [english, spanish, portuguese, italian]) Object.freeze(list);

/**
 * Listas oficiales de BIP39. El castellano viene en forma NFKD (la tilde es un
 * carácter aparte), igual que el archivo oficial.
 */
export const WORDLISTS: Readonly<Record<Lang, readonly string[]>> = Object.freeze({
  es: spanish,
  pt: portuguese,
  en: english,
  it: italian,
});

/** La clave maestra y las semillas de los regalos van siempre en inglés. */
export const ENGLISH: readonly string[] = english;

export function isLang(value: unknown): value is Lang {
  return typeof value === 'string' && (LANGS as readonly string[]).includes(value);
}
