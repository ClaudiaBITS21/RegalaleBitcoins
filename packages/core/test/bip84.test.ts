import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { HDKey } from '@scure/bip32';
import { mnemonicToSeedSync } from '@scure/bip39';
import { NETWORK, WIF } from '@scure/btc-signer';
import { deriveBip84Key, getNetwork } from '../src/index.ts';
import { loadVector, toHex } from './helpers.ts';

interface Bip84Vectors {
  mnemonic: string;
  rootpriv: string;
  rootpub: string;
  account: { path: string; xpriv: string; xpub: string };
  addresses: Array<{ path: string; wif: string; pubkey: string; address: string }>;
}

const v = loadVector<Bip84Vectors>('bip84.json');
// Versiones zprv/zpub de SLIP-132 que usa el vector.
const ZPRV = { private: 0x04b2430c, public: 0x04b24746 };

describe('BIP84: vectores oficiales', () => {
  const root = HDKey.fromMasterSeed(mnemonicToSeedSync(v.mnemonic, ''), ZPRV);
  const mainnet = getNetwork('mainnet', { allowMainnet: true });

  it('clave raíz', () => {
    assert.equal(root.privateExtendedKey, v.rootpriv);
    assert.equal(root.publicExtendedKey, v.rootpub);
  });

  it(`cuenta ${v.account.path}`, () => {
    const account = root.derive(v.account.path);
    assert.equal(account.privateExtendedKey, v.account.xpriv);
    assert.equal(account.publicExtendedKey, v.account.xpub);
  });

  for (const a of v.addresses) {
    it(`dirección ${a.path}`, () => {
      const [change, index] = a.path.split('/').slice(-2).map(Number) as [0 | 1, number];
      const key = deriveBip84Key(root, mainnet, change, index);
      assert.equal(key.path, a.path);
      assert.equal(toHex(key.publicKey), a.pubkey);
      assert.equal(WIF(NETWORK).encode(key.privateKey), a.wif);
      assert.equal(key.address, a.address);
    });
  }

  it('en signet usa coin type 1 y prefijo tb1', () => {
    const key = deriveBip84Key(root, getNetwork('signet'), 0, 0);
    assert.equal(key.path, "m/84'/1'/0'/0/0");
    assert.match(key.address, /^tb1q[02-9ac-hj-np-z]{38}$/);
  });
});
