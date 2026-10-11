import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { explorerTxUrl, formatSats, groupAddress, satsToUsd } from '../src/format.ts';

describe('Formatos', () => {
  it('sats con separador de miles según idioma', () => {
    assert.equal(formatSats(1234567n, 'es'), '1.234.567 sats');
    assert.equal(formatSats(1234567n, 'en'), '1,234,567 sats');
  });

  it('sats a USD', () => {
    assert.equal(satsToUsd(100_000_000n, 65_000), 65_000);
    assert.equal(satsToUsd(25_000n, 100_000), 25);
  });

  it('agrupa direcciones de a 4 caracteres', () => {
    assert.equal(groupAddress('tb1qabcdefgh12'), 'tb1q abcd efgh 12');
  });

  it('links al explorador solo para txid válidos y redes conocidas', () => {
    const txid = 'ab'.repeat(32);
    assert.equal(explorerTxUrl('signet', txid), `https://mempool.space/signet/tx/${txid}`);
    assert.equal(explorerTxUrl('signet', 'javascript:alert(1)'), null);
    assert.equal(explorerTxUrl('regtest', txid), null);
  });
});
