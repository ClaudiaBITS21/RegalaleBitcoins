import { CoreError } from './errors.ts';
import { type Lang, WORDLISTS } from './wordlists.ts';

// La passphrase BIP39 del regalo: 4 palabras de la lista del idioma del que recibe
// (44 bits). La forma canónica va sin tildes ni diacríticos ("abaco", "camion"):
// solo la lista en castellano tiene tildes, y así el regalo se recupera igual en
// cualquier billetera, aunque no normalice Unicode o solo acepte ASCII (algunas de
// hardware). Al reclamar en la web se acepta con o sin tilde.

export const PASSPHRASE_WORDS = 4;
export const PASSPHRASE_BITS = 44;
const BITS_PER_WORD = 11;

/** Forma canónica y de comparación: sin tildes ni diacríticos, en minúsculas. */
export function foldWord(input: string): string {
  return input.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().trim();
}

interface Index {
  readonly canonical: readonly string[];
  readonly known: ReadonlySet<string>;
}

const indexes = new Map<Lang, Index>();

function indexFor(lang: Lang): Index {
  let index = indexes.get(lang);
  if (index === undefined) {
    const canonical = WORDLISTS[lang].map(foldWord);
    const known = new Set(canonical);
    if (known.size !== canonical.length) throw new Error(`La lista ${lang} es ambigua sin tildes.`);
    index = { canonical, known };
    indexes.set(lang, index);
  }
  return index;
}

/** Los primeros 44 bits de `entropy` (big endian) como 4 palabras del idioma. */
export function passphraseWordsFromEntropy(entropy: Uint8Array, lang: Lang): string[] {
  if (entropy.length < 6) {
    throw new CoreError('INVALID_ENTROPY', 'Se necesitan al menos 6 bytes para 44 bits.');
  }
  let bits = 0n;
  for (let i = 0; i < 6; i++) bits = (bits << 8n) | BigInt(entropy[i] as number);
  bits >>= 48n - BigInt(PASSPHRASE_BITS);
  const { canonical } = indexFor(lang);
  const words: string[] = [];
  for (let i = PASSPHRASE_WORDS - 1; i >= 0; i--) {
    words.push(canonical[Number((bits >> BigInt(i * BITS_PER_WORD)) & 0x7ffn)] as string);
  }
  return words;
}

/**
 * Lo que escribe el que recibe → la palabra canónica, o null si no está en la lista.
 * Acepta mayúsculas y tildes: "Ábaco" → "abaco".
 */
export function normalizeWord(input: string, lang: Lang): string | null {
  const word = foldWord(input);
  return indexFor(lang).known.has(word) ? word : null;
}

/** Autocompletado: palabras de la lista que empiezan con `prefix`, sin importar tildes. */
export function suggestWords(prefix: string, lang: Lang, limit = 6): string[] {
  const p = foldWord(prefix);
  if (p === '') return [];
  const { canonical } = indexFor(lang);
  const out: string[] = [];
  for (let i = 0; i < canonical.length && out.length < limit; i++) {
    if ((canonical[i] as string).startsWith(p)) out.push(canonical[i] as string);
  }
  return out;
}

/** Valida las 4 palabras y arma la passphrase canónica (separadas por un espacio). */
export function passphraseFromWords(words: readonly string[], lang: Lang): string {
  if (words.length !== PASSPHRASE_WORDS) {
    throw new CoreError('INVALID_WORD', `Se esperaban ${PASSPHRASE_WORDS} palabras y llegaron ${words.length}.`);
  }
  return words
    .map((word, position) => {
      const canonical = normalizeWord(word, lang);
      if (canonical === null) throw new CoreError('INVALID_WORD', 'Palabra fuera de la lista.', { position, lang });
      return canonical;
    })
    .join(' ');
}
