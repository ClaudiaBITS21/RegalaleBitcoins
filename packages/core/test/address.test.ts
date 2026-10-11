import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { p2pkh, p2sh, p2wpkh, TEST_NETWORK } from '@scure/btc-signer';
import { addressFromScript, cleanAddressInput, getNetwork, parseDestination } from '../src/index.ts';
import { assertCoreError, loadVector, toHex } from './helpers.ts';

const bip350 = loadVector<{ valid: Array<{ address: string; script: string }>; invalid: Array<{ address: string; reason: string }> }>(
  'bip350-addresses.json',
);
const signet = getNetwork('signet');
const mainnet = getNetwork('mainnet', { allowMainnet: true });
const networkFor = (address: string) => (address.toLowerCase().startsWith('bc1') ? mainnet : signet);

const pub = secp256k1.getPublicKey(new Uint8Array(32).fill(7));

describe('Dirección de destino: vectores BIP350', () => {
  // Tipos que aceptamos: v0 de 20 bytes (P2WPKH), v0 de 32 (P2WSH) y v1 de 32 (taproot).
  const supported = new Set(['0014', '0020', '5120']);
  for (const v of bip350.valid) {
    const kind = supported.has(v.script.slice(0, 4)) ? 'acepta' : 'rechaza por no soportada';
    it(`${kind}: ${v.address}`, () => {
      if (supported.has(v.script.slice(0, 4))) {
        const d = parseDestination(v.address, networkFor(v.address));
        assert.equal(toHex(d.script), v.script);
        assert.equal(d.address, v.address.toLowerCase());
        assert.ok(d.witness);
      } else {
        // Versiones futuras de segwit: válidas, pero un error de tipeo mandaría fondos a un script que nadie controla.
        assertCoreError(() => parseDestination(v.address, networkFor(v.address)), 'UNSUPPORTED_ADDRESS');
      }
    });
  }

  for (const v of bip350.invalid) {
    it(`rechaza: ${v.reason}`, () => {
      assertCoreError(() => parseDestination(v.address, networkFor(v.address)), 'INVALID_ADDRESS');
    });
  }
});

describe('Dirección de destino: casos de uso', () => {
  const wpkh = p2wpkh(pub, TEST_NETWORK).address as string;

  it('tipos soportados en signet, con su umbral segwit o no', () => {
    const cases = [
      { address: wpkh, type: 'p2wpkh', witness: true },
      { address: p2pkh(pub, TEST_NETWORK).address as string, type: 'p2pkh', witness: false },
      { address: p2sh(p2wpkh(pub), TEST_NETWORK).address as string, type: 'p2sh', witness: false },
    ];
    for (const c of cases) {
      const d = parseDestination(c.address, signet);
      assert.equal(d.type, c.type);
      assert.equal(d.witness, c.witness);
    }
  });

  it('acepta URIs bitcoin: y QR en mayúsculas', () => {
    assert.equal(parseDestination(`bitcoin:${wpkh}?amount=0.001&label=Regalo`, signet).address, wpkh);
    assert.equal(parseDestination(`BITCOIN:${wpkh.toUpperCase()}?AMOUNT=0.001`, signet).address, wpkh);
    assert.equal(parseDestination(`  ${wpkh}\n`, signet).address, wpkh);
    assert.equal(cleanAddressInput(`bitcoin:${wpkh}`), wpkh);
  });

  it('avisa si la dirección es de otra red', () => {
    const fromMainnet = 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu';
    assert.equal(assertCoreError(() => parseDestination(fromMainnet, signet), 'WRONG_NETWORK').details?.network, 'mainnet');
    assert.equal(assertCoreError(() => parseDestination(wpkh, mainnet), 'WRONG_NETWORK').details?.network, 'testnet');
    const regtest = p2wpkh(pub, getNetwork('regtest').btc).address as string;
    assert.equal(assertCoreError(() => parseDestination(regtest, signet), 'WRONG_NETWORK').details?.network, 'regtest');
    const legacyMainnet = p2pkh(pub).address as string;
    assert.equal(assertCoreError(() => parseDestination(legacyMainnet, signet), 'WRONG_NETWORK').details?.network, 'mainnet');
  });

  it('rechaza vacíos, basura y mayúsculas mezcladas', () => {
    assertCoreError(() => parseDestination('', signet), 'INVALID_ADDRESS');
    assertCoreError(() => parseDestination('   ', signet), 'INVALID_ADDRESS');
    assertCoreError(() => parseDestination('hola', signet), 'INVALID_ADDRESS');
    assertCoreError(() => parseDestination(wpkh.slice(0, -1), signet), 'INVALID_ADDRESS');
    const mixed = wpkh.slice(0, 10).toUpperCase() + wpkh.slice(10);
    assertCoreError(() => parseDestination(mixed, signet), 'INVALID_ADDRESS');
  });
});

describe('Script → dirección', () => {
  it('ida y vuelta para los tipos soportados', () => {
    for (const v of bip350.valid.filter((x) => ['0014', '0020', '5120'].includes(x.script.slice(0, 4)))) {
      const network = networkFor(v.address);
      assert.equal(addressFromScript(parseDestination(v.address, network).script, network), v.address.toLowerCase());
    }
  });

  it('null para scripts no estándar', () => {
    assert.equal(addressFromScript(Uint8Array.of(0x6a, 0x01, 0x00), signet), null); // OP_RETURN
    assert.equal(addressFromScript(new Uint8Array(0), signet), null);
  });
});
