import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { HDKey } from '@scure/bip32';
import { accountKeyText, deriveBip84Key, deriveListAddress, getNetwork, isCoreError, masterRootFromMnemonic, parseAccountKey } from '../src/index.ts';

const mainnet = getNetwork('mainnet', { allowMainnet: true });
const signet = getNetwork('signet');
// Vector oficial de BIP84.
const ABANDON = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const ZPUB = 'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs';

const problem = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    if (isCoreError(e, 'INVALID_XPUB')) return (e.details as { problem: string }).problem;
    throw e;
  }
  return 'ninguno';
};

describe('llave pública de lista (zpub/vpub)', () => {
  it('vector oficial de BIP84: zpub y sus primeras direcciones', () => {
    const account = parseAccountKey(`  ${ZPUB}\n`, mainnet);
    assert.equal(deriveListAddress(account, 0).address, 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu');
    assert.equal(deriveListAddress(account, 1).address, 'bc1qnjg0jd8228aq7egyzacy8cys3knf9xvrerkf9g');
    assert.equal(accountKeyText(masterRootFromMnemonic(ABANDON), mainnet), ZPUB);
  });

  it('vpub en redes de prueba: las mismas direcciones que la billetera completa', () => {
    const root = masterRootFromMnemonic(ABANDON);
    const vpub = accountKeyText(root, signet);
    assert.ok(vpub.startsWith('vpub'));
    const account = parseAccountKey(vpub, signet);
    for (const i of [0, 1, 7]) assert.equal(deriveListAddress(account, i).address, deriveBip84Key(root, signet, 0, i).address);
  });

  it('rechaza claves privadas, xpub genéricas, otra red, otra profundidad y basura', () => {
    const root = masterRootFromMnemonic(ABANDON);
    const account = root.derive("m/84'/0'/0'");
    assert.equal(problem(() => parseAccountKey(account.privateExtendedKey, mainnet)), 'privada');
    assert.equal(problem(() => parseAccountKey(account.publicExtendedKey, mainnet)), 'generica');
    assert.equal(problem(() => parseAccountKey(ZPUB, signet)), 'red');
    assert.equal(problem(() => parseAccountKey(accountKeyText(root, signet), mainnet)), 'red');
    assert.equal(problem(() => parseAccountKey('zpub123', mainnet)), 'formato');
    // Una llave de otra profundidad (por ejemplo la rama m/84'/0'/0'/0) no es la de la cuenta.
    const deep = root.derive("m/84'/0'/0'/0");
    const deepZpub = new HDKey({ versions: { public: 0x04b24746, private: 0x04b2430c }, depth: deep.depth, index: deep.index, parentFingerprint: deep.parentFingerprint, chainCode: deep.chainCode as Uint8Array, publicKey: deep.publicKey as Uint8Array }).publicExtendedKey;
    assert.equal(problem(() => parseAccountKey(deepZpub, mainnet)), 'profundidad');
  });
});
