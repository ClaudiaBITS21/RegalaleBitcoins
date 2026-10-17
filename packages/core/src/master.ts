import { HDKey } from '@scure/bip32';
import { entropyToMnemonic, mnemonicToSeedSync, validateMnemonic } from '@scure/bip39';
import { CoreError } from './errors.ts';
import { type RandomBytes, secureRandomBytes } from './random.ts';
import { ENGLISH } from './wordlists.ts';

// La clave maestra del que regala: 12 palabras BIP39 en inglés (128 bits).
// Es también el código de recuperación. De ella salen todos sus regalos vía BIP85.

export const MASTER_ENTROPY_BYTES = 16;
export const MASTER_WORDS = 12;

export function generateMasterMnemonic(randomBytes: RandomBytes = secureRandomBytes): string {
  const entropy = randomBytes(MASTER_ENTROPY_BYTES);
  if (entropy.length !== MASTER_ENTROPY_BYTES) {
    throw new CoreError('INVALID_ENTROPY', 'La fuente aleatoria devolvió un largo inesperado.');
  }
  try {
    return entropyToMnemonic(entropy, ENGLISH as string[]);
  } finally {
    entropy.fill(0);
  }
}

/** Limpia lo que escribe una persona: mayúsculas, espacios de más, saltos de línea. */
export function normalizeMnemonic(input: string): string {
  return input.normalize('NFKD').toLowerCase().trim().split(/\s+/u).join(' ');
}

export function isValidMasterMnemonic(input: string): boolean {
  const mnemonic = normalizeMnemonic(input);
  return mnemonic.split(' ').length === MASTER_WORDS && validateMnemonic(mnemonic, ENGLISH as string[]);
}

/** Raíz BIP32 de la clave maestra (semilla BIP39 sin passphrase). */
export function masterRootFromMnemonic(input: string): HDKey {
  const mnemonic = normalizeMnemonic(input);
  if (!isValidMasterMnemonic(mnemonic)) {
    throw new CoreError('INVALID_MNEMONIC', 'La clave maestra no es un mnemónico BIP39 válido de 12 palabras en inglés.');
  }
  const seed = mnemonicToSeedSync(mnemonic, '');
  try {
    return HDKey.fromMasterSeed(seed);
  } finally {
    seed.fill(0);
  }
}
