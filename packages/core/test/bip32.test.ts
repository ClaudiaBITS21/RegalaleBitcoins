import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { HDKey } from '@scure/bip32';
import { fromHex, loadVector } from './helpers.ts';

interface Bip32Vectors {
  vectors: Array<{ seed: string; chains: Array<{ path: string; xpub: string; xprv: string }> }>;
  invalid: Array<{ key: string; reason: string }>;
}

const v = loadVector<Bip32Vectors>('bip32.json');

describe('BIP32: vectores oficiales 1 a 4', () => {
  for (const [n, vector] of v.vectors.entries()) {
    const master = HDKey.fromMasterSeed(fromHex(vector.seed));
    for (const chain of vector.chains) {
      it(`vector ${n + 1}: ${chain.path}`, () => {
        const key = chain.path === 'm' ? master : master.derive(chain.path);
        assert.equal(key.privateExtendedKey, chain.xprv);
        assert.equal(key.publicExtendedKey, chain.xpub);
        // También desde la clave extendida serializada.
        assert.equal(HDKey.fromExtendedKey(chain.xprv).publicExtendedKey, chain.xpub);
      });
    }
  }
});

describe('BIP32: vector 5 (claves extendidas inválidas)', () => {
  for (const { key, reason } of v.invalid) {
    it(`rechaza: ${reason}`, () => {
      assert.throws(() => HDKey.fromExtendedKey(key));
    });
  }
});
