export { CoreError, type CoreErrorCode, isCoreError } from './errors.ts';
export { assertNetwork, getNetwork, type GetNetworkOptions, type Network, type NetworkName } from './network.ts';
export { type RandomBytes, secureRandomBytes } from './random.ts';
export { ENGLISH, isLang, type Lang, LANGS, WORDLISTS } from './wordlists.ts';
export {
  generateMasterMnemonic,
  isValidMasterMnemonic,
  MASTER_WORDS,
  masterRootFromMnemonic,
  normalizeMnemonic,
} from './master.ts';
export {
  assertIndex,
  BIP85_APP_BIP39,
  BIP85_APP_HEX,
  BIP85_PURPOSE,
  bip85Entropy,
  bip85Hex,
  bip85HexPath,
  bip85Mnemonic,
  bip85MnemonicEntropy,
  bip85MnemonicPath,
  type Bip85MnemonicOptions,
} from './bip85.ts';
export {
  foldWord,
  normalizeWord,
  PASSPHRASE_BITS,
  PASSPHRASE_WORDS,
  passphraseFromWords,
  passphraseWordsFromEntropy,
  suggestWords,
} from './passphrase.ts';
export {
  type Bip84Key,
  bip84Path,
  deriveBip84Key,
  deriveGiftSecrets,
  GIFT_ENTROPY_BYTES,
  giftMnemonicPath,
  giftPassphrasePath,
  type GiftSecrets,
  type GiftWallet,
  openGiftWallet,
} from './gift.ts';
export { decodeGiftFragment, encodeGiftFragment, LINK_VERSION } from './link.ts';
export { cleanAddressInput, type Destination, type DestinationType, parseDestination } from './address.ts';
export {
  dustThreshold,
  estimateSweepFee,
  type FundingUtxo,
  MAX_FEE_RATE,
  MIN_FEE_RATE,
  minimumGiftAmount,
  planSweep,
  type PlanSweepOptions,
  RBF_SEQUENCE,
  readFundingUtxo,
  type SignedSweep,
  signSweep,
  type SweepInput,
  type SweepPlan,
  sweepWeight,
} from './sweep.ts';
