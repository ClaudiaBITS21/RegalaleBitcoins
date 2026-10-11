import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { getNetwork, type NetworkName, secureRandomBytes } from '../src/index.ts';
import { assertCoreError } from './helpers.ts';

describe('Redes', () => {
  it('mainnet está bloqueada salvo pedido explícito', () => {
    assertCoreError(() => getNetwork('mainnet'), 'MAINNET_NOT_ALLOWED');
    assertCoreError(() => getNetwork('mainnet', { allowMainnet: false }), 'MAINNET_NOT_ALLOWED');
    assert.equal(getNetwork('mainnet', { allowMainnet: true }).coinType, 0);
  });

  it('redes de prueba', () => {
    assert.equal(getNetwork('signet').btc.bech32, 'tb');
    assert.equal(getNetwork('testnet').btc.bech32, 'tb');
    assert.equal(getNetwork('regtest').btc.bech32, 'bcrt');
    for (const name of ['signet', 'testnet', 'regtest'] as const) assert.equal(getNetwork(name).coinType, 1);
  });

  it('rechaza nombres desconocidos y objetos de red inmutables', () => {
    assertCoreError(() => getNetwork('liquid' as NetworkName), 'INVALID_NETWORK');
    assertCoreError(() => getNetwork('__proto__' as NetworkName), 'INVALID_NETWORK');
    assert.throws(() => {
      (getNetwork('signet') as { coinType: number }).coinType = 0;
    }, TypeError);
  });
});

describe('Aleatoriedad', () => {
  const original = globalThis.crypto;
  afterEach(() => {
    Object.defineProperty(globalThis, 'crypto', { value: original, configurable: true, writable: true });
  });

  it('usa crypto.getRandomValues', () => {
    const a = secureRandomBytes(32);
    assert.equal(a.length, 32);
    assert.notDeepEqual(a, secureRandomBytes(32));
  });

  it('falla si no hay generador seguro, en vez de usar otra cosa', () => {
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true, writable: true });
    assertCoreError(() => secureRandomBytes(16), 'NO_SECURE_RANDOM');
  });

  it('falla si el generador devuelve ceros', () => {
    Object.defineProperty(globalThis, 'crypto', {
      value: { getRandomValues: (a: Uint8Array) => a },
      configurable: true,
      writable: true,
    });
    assertCoreError(() => secureRandomBytes(16), 'NO_SECURE_RANDOM');
  });

  it('valida el largo', () => {
    assert.throws(() => secureRandomBytes(0), RangeError);
    assert.throws(() => secureRandomBytes(1.5), RangeError);
  });
});
