import { hmac } from '@noble/hashes/hmac.js';
import { sha512 } from '@noble/hashes/sha2.js';
import { utf8ToBytes } from '@noble/hashes/utils.js';
import type { HDKey } from '@scure/bip32';
import { entropyToMnemonic } from '@scure/bip39';
import { CoreError } from './errors.ts';

// BIP85: Deterministic Entropy From BIP32 Keychains (versión 2.1.0).
// https://github.com/bitcoin/bips/blob/master/bip-0085.mediawiki

export const BIP85_PURPOSE = 83696968;
export const BIP85_APP_BIP39 = 39;
export const BIP85_APP_HEX = 128169;

const HMAC_KEY = utf8ToBytes('bip-entropy-from-k');
const HARDENED_PATH = /^m(\/\d+')+$/;
const MAX_INDEX = 0x7fffffff;

const WORDS_TO_BYTES: Readonly<Record<number, number>> = { 12: 16, 15: 20, 18: 24, 21: 28, 24: 32 };

export function assertIndex(index: number): void {
  if (!Number.isInteger(index) || index < 0 || index > MAX_INDEX) {
    throw new CoreError('INVALID_INDEX', `Índice inválido: ${index}`);
  }
}

/**
 * Entropía BIP85 cruda (64 bytes): HMAC-SHA512(key="bip-entropy-from-k", msg=k),
 * con k la clave privada en `path`. El path tiene que ser totalmente endurecido.
 */
export function bip85Entropy(root: HDKey, path: string): Uint8Array {
  if (root.depth !== 0) {
    throw new CoreError('INVALID_PATH', 'BIP85 se deriva desde la clave raíz BIP32.');
  }
  if (!HARDENED_PATH.test(path) || !path.startsWith(`m/${BIP85_PURPOSE}'/`)) {
    throw new CoreError('INVALID_PATH', `Path BIP85 inválido: ${path}`);
  }
  for (const segment of path.slice(2).split('/')) {
    if (Number(segment.slice(0, -1)) > MAX_INDEX) throw new CoreError('INVALID_PATH', `Índice fuera de rango en ${path}`);
  }
  const child = root.derive(path);
  const k = child.privateKey;
  if (k === null) {
    child.wipePrivateData();
    throw new CoreError('INVALID_PATH', 'BIP85 necesita una clave privada.');
  }
  try {
    return hmac(sha512, HMAC_KEY, k);
  } finally {
    child.wipePrivateData();
  }
}

function truncate(entropy: Uint8Array, bytes: number): Uint8Array {
  const out = entropy.slice(0, bytes);
  entropy.fill(0);
  return out;
}

export interface Bip85MnemonicOptions {
  /** Código de idioma de BIP85 (0 = inglés). */
  readonly language: number;
  readonly words: 12 | 15 | 18 | 21 | 24;
  readonly index: number;
}

export function bip85MnemonicPath({ language, words, index }: Bip85MnemonicOptions): string {
  assertIndex(language);
  assertIndex(index);
  if (WORDS_TO_BYTES[words] === undefined) throw new CoreError('INVALID_PATH', `Cantidad de palabras inválida: ${words}`);
  return `m/${BIP85_PURPOSE}'/${BIP85_APP_BIP39}'/${language}'/${words}'/${index}'`;
}

/** Aplicación BIP39 (39'): la entropía que alimenta un mnemónico. */
export function bip85MnemonicEntropy(root: HDKey, options: Bip85MnemonicOptions): Uint8Array {
  const bytes = WORDS_TO_BYTES[options.words] as number;
  return truncate(bip85Entropy(root, bip85MnemonicPath(options)), bytes);
}

export function bip85Mnemonic(root: HDKey, options: Bip85MnemonicOptions, wordlist: readonly string[]): string {
  const entropy = bip85MnemonicEntropy(root, options);
  try {
    return entropyToMnemonic(entropy, wordlist as string[]);
  } finally {
    entropy.fill(0);
  }
}

export function bip85HexPath(numBytes: number, index: number): string {
  if (!Number.isInteger(numBytes) || numBytes < 16 || numBytes > 64) {
    throw new CoreError('INVALID_PATH', `num_bytes tiene que estar entre 16 y 64: ${numBytes}`);
  }
  assertIndex(index);
  return `m/${BIP85_PURPOSE}'/${BIP85_APP_HEX}'/${numBytes}'/${index}'`;
}

/** Aplicación HEX (128169'): `numBytes` bytes de entropía. */
export function bip85Hex(root: HDKey, numBytes: number, index: number): Uint8Array {
  return truncate(bip85Entropy(root, bip85HexPath(numBytes, index)), numBytes);
}
