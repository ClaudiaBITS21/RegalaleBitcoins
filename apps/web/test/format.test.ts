import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { explorerTxUrl, formatBtc, formatFiat, formatSats, formatUsd, parseAmount, paymentUri, satsToBtcString, usdCentsToSats, groupAddress, satsToUsd } from '../src/format.ts';

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

  it('BTC exactos, con el separador decimal del idioma', () => {
    assert.equal(formatBtc(31_250n, 'es'), '0,0003125 BTC');
    assert.equal(formatBtc(31_250n, 'en'), '0.0003125 BTC');
    assert.equal(formatBtc(123_456_789n, 'it'), '1,23456789 BTC');
    assert.equal(formatBtc(1n, 'pt'), '0,00000001 BTC');
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

  it('lee montos con los separadores del idioma de quien escribe', () => {
    const ok = (value: bigint) => ({ ok: true, value });
    assert.deepEqual(parseAmount('1.234', 'es', 0), ok(1234n));
    assert.deepEqual(parseAmount('1.234,5', 'es', 2), ok(123450n));
    assert.deepEqual(parseAmount('0,5', 'es', 2), ok(50n));
    assert.deepEqual(parseAmount('25', 'pt', 2), ok(2500n));
    assert.deepEqual(parseAmount('1.000.000', 'it', 0), ok(1_000_000n));
    assert.deepEqual(parseAmount('1,234.5', 'en', 2), ok(123450n));
    assert.deepEqual(parseAmount('0.5', 'en', 2), ok(50n));
    assert.deepEqual(parseAmount(' 12 500 ', 'es', 0), ok(12500n));
    assert.deepEqual(parseAmount('10,50', 'es', 2), ok(1050n));
    assert.deepEqual(parseAmount('10,500', 'es', 2), ok(1050n)); // ceros de más al final
  });

  it('no adivina separadores mal puestos ni decimales de más', () => {
    assert.deepEqual(parseAmount('1.5', 'es', 2), { ok: false, error: 'formato' }); // en castellano el punto es de miles
    assert.deepEqual(parseAmount('1,5', 'en', 2), { ok: false, error: 'formato' });
    assert.deepEqual(parseAmount('12.34', 'es', 2), { ok: false, error: 'formato' });
    assert.deepEqual(parseAmount('1,234', 'es', 2), { ok: false, error: 'decimales' }); // 1,234 en castellano es uno coma algo
    assert.deepEqual(parseAmount('100,5', 'es', 0), { ok: false, error: 'decimales' }); // sats enteros
    assert.deepEqual(parseAmount('-5', 'es', 2), { ok: false, error: 'formato' });
    assert.deepEqual(parseAmount('5e3', 'en', 0), { ok: false, error: 'formato' });
    assert.deepEqual(parseAmount('', 'es', 2), { ok: false, error: 'vacio' });
  });

  it('link de pago BIP21 y conversión de dólares a sats', () => {
    assert.equal(satsToBtcString(25_000n), '0.00025');
    assert.equal(satsToBtcString(100_000_000n), '1');
    assert.equal(satsToBtcString(123_456_789n), '1.23456789');
    assert.equal(paymentUri('tb1qabc', 25_000n), 'bitcoin:TB1QABC?amount=0.00025');
    assert.equal(usdCentsToSats(2500n, 100_000), 25_000n);
    assert.equal(usdCentsToSats(1n, 100_000), 10n);
  });
});
