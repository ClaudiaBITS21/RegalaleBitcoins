import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { HDKey } from '@scure/bip32';
import { entropyToMnemonic, mnemonicToEntropy, mnemonicToSeedSync, validateMnemonic } from '@scure/bip39';
import { wordlist as japanese } from '@scure/bip39/wordlists/japanese.js';
import { ENGLISH } from '../src/index.ts';
import { fromHex, loadVector, toHex } from './helpers.ts';

interface TrezorVectors {
  passphrase: string;
  english: Array<{ entropy: string; mnemonic: string; seed: string; xprv: string }>;
}
interface JapaneseVectors {
  vectors: Array<{ entropy: string; mnemonic: string; passphrase: string; seed: string; bip32_xprv: string }>;
}

const trezor = loadVector<TrezorVectors>('bip39-trezor.json');
const jp = loadVector<JapaneseVectors>('bip39-japanese.json');
const english = ENGLISH as string[];

describe('BIP39: vectores oficiales en inglés (passphrase "TREZOR")', () => {
  for (const [n, v] of trezor.english.entries()) {
    it(`vector ${n + 1} (${v.entropy.length * 4} bits)`, () => {
      assert.equal(entropyToMnemonic(fromHex(v.entropy), english), v.mnemonic);
      assert.equal(toHex(mnemonicToEntropy(v.mnemonic, english)), v.entropy);
      assert.ok(validateMnemonic(v.mnemonic, english));
      const seed = mnemonicToSeedSync(v.mnemonic, trezor.passphrase);
      assert.equal(toHex(seed), v.seed);
      assert.equal(HDKey.fromMasterSeed(seed).privateExtendedKey, v.xprv);
    });
  }
});

describe('BIP39: vectores japoneses (passphrase con normalización NFKD exigente)', () => {
  for (const [n, v] of jp.vectors.entries()) {
    it(`vector ${n + 1}`, () => {
      assert.equal(entropyToMnemonic(fromHex(v.entropy), japanese).normalize('NFKD'), v.mnemonic.normalize('NFKD'));
      const seed = mnemonicToSeedSync(v.mnemonic, v.passphrase);
      assert.equal(toHex(seed), v.seed);
      assert.equal(HDKey.fromMasterSeed(seed).privateExtendedKey, v.bip32_xprv);
    });
  }
});
