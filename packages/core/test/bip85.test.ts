import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { HDKey } from '@scure/bip32';
import {
  bip85Entropy,
  bip85Hex,
  bip85HexPath,
  bip85Mnemonic,
  bip85MnemonicEntropy,
  bip85MnemonicPath,
  ENGLISH,
} from '../src/index.ts';
import { assertCoreError, loadVector, toHex } from './helpers.ts';

interface Bip85Vectors {
  master: string;
  derived: Array<{ path: string; derivedKey: string; derivedEntropy: string }>;
  bip39: Array<{ path: string; words: 12 | 18 | 24; entropy: string; mnemonic: string }>;
  hex: Array<{ path: string; entropy: string }>;
}

const v = loadVector<Bip85Vectors>('bip85.json');
const root = HDKey.fromExtendedKey(v.master);

describe('BIP85: vectores oficiales', () => {
  for (const d of v.derived) {
    it(`entropía cruda en ${d.path}`, () => {
      assert.equal(toHex(root.derive(d.path).privateKey as Uint8Array), d.derivedKey);
      assert.equal(toHex(bip85Entropy(root, d.path)), d.derivedEntropy);
    });
  }

  for (const b of v.bip39) {
    it(`aplicación BIP39: ${b.words} palabras en inglés`, () => {
      const options = { language: 0, words: b.words, index: 0 };
      assert.equal(bip85MnemonicPath(options), b.path);
      assert.equal(toHex(bip85MnemonicEntropy(root, options)), b.entropy);
      assert.equal(bip85Mnemonic(root, options, ENGLISH), b.mnemonic);
    });
  }

  for (const h of v.hex) {
    it(`aplicación HEX: ${h.path}`, () => {
      assert.equal(bip85HexPath(64, 0), h.path);
      assert.equal(toHex(bip85Hex(root, 64, 0)), h.entropy);
    });
  }
});

describe('BIP85: validaciones', () => {
  it('solo desde la clave raíz', () => {
    assertCoreError(() => bip85Entropy(root.derive("m/0'"), "m/83696968'/0'/0'"), 'INVALID_PATH');
  });

  it('rechaza paths no endurecidos o de otro propósito', () => {
    assertCoreError(() => bip85Entropy(root, "m/83696968'/0'/0"), 'INVALID_PATH');
    assertCoreError(() => bip85Entropy(root, "m/44'/0'/0'"), 'INVALID_PATH');
    assertCoreError(() => bip85Entropy(root, 'm'), 'INVALID_PATH');
    assertCoreError(() => bip85Entropy(root, "m/83696968'/0'/2147483648'"), 'INVALID_PATH');
  });

  it('rechaza índices y tamaños fuera de rango', () => {
    assertCoreError(() => bip85HexPath(15, 0), 'INVALID_PATH');
    assertCoreError(() => bip85HexPath(65, 0), 'INVALID_PATH');
    assertCoreError(() => bip85HexPath(16, -1), 'INVALID_INDEX');
    assertCoreError(() => bip85HexPath(16, 2 ** 31), 'INVALID_INDEX');
    assertCoreError(() => bip85HexPath(16, 1.5), 'INVALID_INDEX');
  });

  it('una clave pública sola no alcanza', () => {
    const pub = HDKey.fromExtendedKey(root.publicExtendedKey);
    assert.throws(() => bip85Entropy(pub, "m/83696968'/0'/0'"));
  });
});
