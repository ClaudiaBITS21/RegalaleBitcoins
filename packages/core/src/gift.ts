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

/** Las 16 bytes de la semilla de un regalo (las del link) como 12 palabras BIP39 en inglés. */
export function giftMnemonicFromEntropy(entropy: Uint8Array): string {
  if (entropy.length !== GIFT_ENTROPY_BYTES) {
    throw new CoreError('INVALID_ENTROPY', `La semilla del regalo tiene que tener ${GIFT_ENTROPY_BYTES} bytes.`);
  }
  return entropyToMnemonic(entropy, ENGLISH as string[]);
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

/** Clave extendida de la cuenta BIP84 del regalo (m/84'/coin'/0'), para describirlo con dos xpub. */
export interface GiftAccountKey {
  readonly fingerprint: number;
  readonly fingerprintHex: string;
  readonly coinType: 0 | 1;
  /** xpub/tpub de m/84'/coin'/0'. La clave del regalo es su hija /0/0. */
  readonly xpub: string;
}

/** La billetera de un solo uso del regalo. Contiene la clave privada: llamar a wipe() al terminar. */
export interface GiftWallet {
  readonly network: Network;
  readonly path: string;
  readonly address: string;
  readonly script: Uint8Array;
  readonly publicKey: Uint8Array;
  readonly privateKey: Uint8Array;
  /** Origen de la clave del regalo (solo datos públicos). */
  readonly account: GiftAccountKey;
  /** Solo en regalos multifirma (recupero avanzado): el script de testigo de la 1-de-2. */
  readonly witnessScript?: Uint8Array;
  wipe(): void;
}

const XPUB_VERSIONS = { public: 0x0488b21e, private: 0x0488ade4 } as const;
const TPUB_VERSIONS = { public: 0x043587cf, private: 0x04358394 } as const;

function giftAccountKey(root: HDKey, network: Network): GiftAccountKey {
  const node = root.derive(`m/84'/${network.coinType}'/0'`);
  const xpub = new HDKey({
    versions: network.name === 'mainnet' ? XPUB_VERSIONS : TPUB_VERSIONS,
    depth: node.depth,
    index: node.index,
    parentFingerprint: node.parentFingerprint,
    chainCode: node.chainCode as Uint8Array,
    publicKey: node.publicKey as Uint8Array,
  }).publicExtendedKey;
  node.wipePrivateData();
  return Object.freeze({ fingerprint: root.fingerprint, fingerprintHex: root.fingerprint.toString(16).padStart(8, '0'), coinType: network.coinType, xpub });
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
    const account = giftAccountKey(root, network);
    return {
      account,
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

/** Lo que el que regala necesita de un regalo: sus secretos y la dirección donde pagarlo. */
export interface DerivedGift extends GiftSecrets {
  readonly address: string;
  /** Clave pública del regalo (m/84'/coin'/0'/0/0 de su billetera) y su origen. */
  readonly publicKey: Uint8Array;
  readonly account: GiftAccountKey;
}

/**
 * Deriva el regalo `index` completo desde la clave maestra: la semilla del link, las 4
 * palabras y la dirección de pago, calculada igual que la calcula el que recibe.
 */
export function deriveGift(root: HDKey, index: number, lang: Lang, network: Network): DerivedGift {
  const secrets = deriveGiftSecrets(root, index, lang);
  const wallet = openGiftWallet(secrets.entropy, secrets.passphraseWords, lang, network);
  wallet.wipe();
  return Object.freeze({ ...secrets, address: wallet.address, publicKey: wallet.publicKey, account: wallet.account });
}
