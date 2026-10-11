import { HDKey } from '@scure/bip32';
import { entropyToMnemonic, mnemonicToSeedSync } from '@scure/bip39';
import { p2wpkh } from '@scure/btc-signer';
import { assertIndex, bip85Hex, bip85HexPath, bip85MnemonicEntropy, bip85MnemonicPath } from './bip85.ts';
import { CoreError } from './errors.ts';
import { assertNetwork, type Network } from './network.ts';
import { passphraseFromWords, passphraseWordsFromEntropy } from './passphrase.ts';
import { ENGLISH, type Lang } from './wordlists.ts';

// Un regalo i del que regala, a partir de su raíz BIP32 (clave maestra):
//   semilla:    BIP85 aplicación BIP39, inglés, 12 palabras  m/83696968'/39'/0'/12'/{i}'
//   passphrase: BIP85 aplicación HEX, 16 bytes                m/83696968'/128169'/16'/{i}'
//               → primeros 44 bits → 4 palabras del idioma del que recibe
//   dirección:  BIP84 sobre semilla+passphrase                m/84'/{coin}'/0'/0/0
// Ver docs/derivacion.md.

export const GIFT_ENTROPY_BYTES = 16;
export const GIFT_MNEMONIC_LANGUAGE = 0; // inglés, código BIP85
export const GIFT_PASSPHRASE_HEX_BYTES = 16;

export function giftMnemonicPath(index: number): string {
  return bip85MnemonicPath({ language: GIFT_MNEMONIC_LANGUAGE, words: 12, index });
}

export function giftPassphrasePath(index: number): string {
  return bip85HexPath(GIFT_PASSPHRASE_HEX_BYTES, index);
}

export interface GiftSecrets {
  readonly index: number;
  readonly lang: Lang;
  /** 16 bytes: es lo que viaja en el link. */
  readonly entropy: Uint8Array;
  /** Las mismas 16 bytes como 12 palabras en inglés. */
  readonly mnemonic: string;
  readonly passphraseWords: readonly string[];
}

/** Deriva semilla y passphrase del regalo `index` desde la clave maestra. */
export function deriveGiftSecrets(root: HDKey, index: number, lang: Lang): GiftSecrets {
  assertIndex(index);
  const entropy = bip85MnemonicEntropy(root, { language: GIFT_MNEMONIC_LANGUAGE, words: 12, index });
  const passEntropy = bip85Hex(root, GIFT_PASSPHRASE_HEX_BYTES, index);
  try {
    return Object.freeze({
      index,
      lang,
      entropy,
      mnemonic: entropyToMnemonic(entropy, ENGLISH as string[]),
      passphraseWords: Object.freeze(passphraseWordsFromEntropy(passEntropy, lang)),
    });
  } finally {
    passEntropy.fill(0);
  }
}

export function bip84Path(network: Network, change: 0 | 1, index: number): string {
  assertIndex(index);
  return `m/84'/${network.coinType}'/0'/${change}/${index}`;
}

export interface Bip84Key {
  readonly path: string;
  readonly publicKey: Uint8Array;
  readonly privateKey: Uint8Array;
  readonly address: string;
  readonly script: Uint8Array;
}

export function deriveBip84Key(root: HDKey, network: Network, change: 0 | 1, index: number): Bip84Key {
  assertNetwork(network);
  const path = bip84Path(network, change, index);
  const key = root.derive(path);
  const { publicKey, privateKey } = key;
  if (publicKey === null || privateKey === null) throw new CoreError('INVALID_PATH', 'Se necesita una clave privada.');
  const payment = p2wpkh(publicKey, network.btc);
  const result = { path, publicKey: publicKey.slice(), privateKey: privateKey.slice(), address: payment.address as string, script: payment.script };
  key.wipePrivateData();
  return result;
}

/** La billetera de un solo uso del regalo. Contiene la clave privada: llamar a wipe() al terminar. */
export interface GiftWallet {
  readonly network: Network;
  readonly path: string;
  readonly address: string;
  readonly script: Uint8Array;
  readonly publicKey: Uint8Array;
  readonly privateKey: Uint8Array;
  wipe(): void;
}

/**
 * Abre la billetera del regalo con lo que tiene el que recibe: la semilla del link
 * y las 4 palabras. Unas palabras equivocadas abren otra billetera válida y vacía:
 * hay que comparar `address` con la dirección registrada del regalo.
 */
export function openGiftWallet(entropy: Uint8Array, passphraseWords: readonly string[], lang: Lang, network: Network): GiftWallet {
  assertNetwork(network);
  if (entropy.length !== GIFT_ENTROPY_BYTES) {
    throw new CoreError('INVALID_ENTROPY', `La semilla del regalo tiene que tener ${GIFT_ENTROPY_BYTES} bytes.`);
  }
  const passphrase = passphraseFromWords(passphraseWords, lang);
  const seed = mnemonicToSeedSync(entropyToMnemonic(entropy, ENGLISH as string[]), passphrase);
  const root = HDKey.fromMasterSeed(seed);
  seed.fill(0);
  try {
    const key = deriveBip84Key(root, network, 0, 0);
    return {
      network,
      path: key.path,
      address: key.address,
      script: key.script,
      publicKey: key.publicKey,
      privateKey: key.privateKey,
      wipe() {
        key.privateKey.fill(0);
      },
    };
  } finally {
    root.wipePrivateData();
  }
}
