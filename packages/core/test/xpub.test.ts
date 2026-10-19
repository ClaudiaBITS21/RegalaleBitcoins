import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { HDKey } from '@scure/bip32';
import { accountKeyText, deriveBip84Key, deriveListAddress, descriptorChecksum, getNetwork, isCoreError, masterRootFromMnemonic, parseAccountKey, parsePaymentKey } from '../src/index.ts';

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

describe('llave de cobro (descriptor wpkh o zpub/vpub)', () => {
  it('checksum de descriptores: vector de BIP 380', () => {
    assert.equal(descriptorChecksum('raw(deadbeef)'), '89f8spxm');
  });

  it('el descriptor de la cuenta da las mismas direcciones que la zpub y que la billetera', () => {
    const root = masterRootFromMnemonic(ABANDON);
    const node = root.derive("m/84'/0'/0'");
    const xpub = new HDKey({ versions: { public: 0x0488b21e, private: 0x0488ade4 }, depth: node.depth, index: node.index, parentFingerprint: node.parentFingerprint, chainCode: node.chainCode as Uint8Array, publicKey: node.publicKey as Uint8Array }).publicExtendedKey;
    const fp = root.fingerprint.toString(16).padStart(8, '0');
    assert.equal(fp, '73c5da0a');
    for (const desc of [`wpkh([${fp}/84'/0'/0']${xpub})`, `wpkh([${fp}/84h/0h/0h]${xpub}/0/*)`]) {
      const key = parsePaymentKey(desc, mainnet);
      assert.equal(deriveListAddress(key, 0).address, 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu');
      assert.equal(deriveListAddress(key, 1).address, 'bc1qnjg0jd8228aq7egyzacy8cys3knf9xvrerkf9g');
      // Normalizado con la rama de recepción y su checksum: se vuelve a leer igual.
      assert.ok(key.text.endsWith('/0/*)#' + descriptorChecksum(key.text.split('#')[0] as string)));
      assert.equal(parsePaymentKey(key.text, mainnet).text, key.text);
    }
    assert.equal(deriveListAddress(parsePaymentKey(ZPUB, mainnet), 0).address, 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu');
  });

  it('rechaza checksum incorrecto, otra red, claves privadas y otros descriptores', () => {
    const root = masterRootFromMnemonic(ABANDON);
    const node = root.derive("m/84'/0'/0'");
    const xpub = new HDKey({ versions: { public: 0x0488b21e, private: 0x0488ade4 }, depth: node.depth, index: node.index, parentFingerprint: node.parentFingerprint, chainCode: node.chainCode as Uint8Array, publicKey: node.publicKey as Uint8Array }).publicExtendedKey;
    const desc = `wpkh([73c5da0a/84'/0'/0']${xpub}/0/*)`;
    assert.equal(problem(() => parsePaymentKey(`${desc}#aaaaaaaa`, mainnet)), 'formato');
    assert.equal(problem(() => parsePaymentKey(desc, signet)), 'red');
    assert.equal(problem(() => parsePaymentKey(desc.replace(xpub, node.privateExtendedKey), mainnet)), 'privada');
    assert.equal(problem(() => parsePaymentKey(desc.replace('wpkh(', 'pkh('), mainnet)), 'formato');
    assert.equal(problem(() => parsePaymentKey(`wpkh(${xpub}/0/*)`, mainnet)), 'formato');
  });
});
