import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { explorerTxUrl, formatFiat, formatSats, formatUsd, groupAddress, satsToUsd } from '../src/format.ts';

describe('Formatos', () => {
  it('sats con separador de miles según idioma', () => {
    assert.equal(formatSats(1234567n, 'es'), '1.234.567 sats');
    assert.equal(formatSats(1234567n, 'en'), '1,234,567 sats');
    assert.equal(formatSats(1234567n, 'pt'), '1.234.567 sats');
    assert.equal(formatSats(1234567n, 'it'), '1.234.567 sats');
  });

  it('agrupa también los números de 4 cifras en todos los idiomas', () => {
    assert.equal(formatSats(5000n, 'es'), '5.000 sats');
    assert.equal(formatSats(5000n, 'it'), '5.000 sats');
    assert.equal(formatSats(5000n, 'en'), '5,000 sats');
  });

  it('coma decimal en es/pt/it y punto en en', () => {
    const nbsp = (s: string) => s.replace(/\u00a0/g, ' ');
    assert.equal(nbsp(formatUsd(1234.5, 'es')), 'US$ 1.235');
    assert.equal(nbsp(formatUsd(7.5, 'es')), 'US$ 7,50');
    assert.equal(formatUsd(7.5, 'en'), '$7.50');
    assert.equal(nbsp(formatFiat(1234.5, 'ARS', 'es')), '$ 1.234,50');
    assert.equal(nbsp(formatFiat(1234.5, 'EUR', 'it')), '1.234,50 €');
    assert.equal(formatFiat(1234.5, 'EUR', 'en'), '€1,234.50');
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
