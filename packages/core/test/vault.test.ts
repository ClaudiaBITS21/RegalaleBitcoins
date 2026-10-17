import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { generateMasterMnemonic, openVault, PRF_SALT, sealVault, VAULT_VERSION } from '../src/index.ts';
import { toHex } from './helpers.ts';

const prf = (fill: number) => new Uint8Array(32).fill(fill);
const credA = new Uint8Array([1, 2, 3, 4]);
const credB = new Uint8Array([9, 9, 9]);

describe('Bóveda (clave maestra cifrada con la passkey)', () => {
  it('el salt PRF es fijo: cambiarlo dejaría todas las bóvedas sin abrir', () => {
    // SHA-256("regalalebitcoins/boveda/v1/prf"), calculado aparte con node:crypto.
    assert.equal(toHex(PRF_SALT), '6ecda6612f0e9e0888f11cbce60e632f6a2daf908ab00bb4efcf758e65638ab7');
  });

  it('cifra y abre con la misma passkey; el formato es v1 y no contiene la clave en claro', async () => {
    const mnemonic = generateMasterMnemonic();
    const sealed = await sealVault(prf(7), mnemonic, credA);
    assert.match(sealed, /^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+$/);
    assert.equal(sealed.split('.')[0], VAULT_VERSION);
    assert.ok(!sealed.includes(mnemonic.split(' ')[0] as string));
    assert.equal(await openVault(prf(7), sealed, credA), mnemonic);
    // Dos cifrados de lo mismo dan resultados distintos (IV al azar).
    assert.notEqual(await sealVault(prf(7), mnemonic, credA), sealed);
  });

  it('otra passkey, otra credencial o una bóveda tocada no abren', async () => {
    const sealed = await sealVault(prf(7), generateMasterMnemonic(), credA);
    await assert.rejects(openVault(prf(8), sealed, credA), (e) => (e as { code?: string }).code === 'INVALID_VAULT');
    await assert.rejects(openVault(prf(7), sealed, credB), (e) => (e as { code?: string }).code === 'INVALID_VAULT');
    const [v, iv, ct] = sealed.split('.') as [string, string, string];
    const flipped = `${v}.${iv}.${ct.slice(0, -2)}${ct.slice(-2) === 'AA' ? 'AB' : 'AA'}`;
    await assert.rejects(openVault(prf(7), flipped, credA), (e) => (e as { code?: string }).code === 'INVALID_VAULT');
    await assert.rejects(openVault(prf(7), 'v2.x.y', credA), (e) => (e as { code?: string }).code === 'INVALID_VAULT');
  });

  it('valida la salida PRF y la clave maestra', async () => {
    await assert.rejects(sealVault(new Uint8Array(16), generateMasterMnemonic(), credA));
    await assert.rejects(sealVault(prf(1), 'no es un mnemónico', credA), (e) => (e as { code?: string }).code === 'INVALID_MNEMONIC');
  });
});
