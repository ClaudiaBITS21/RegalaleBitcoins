import assert from 'node:assert/strict';
import { test } from 'node:test';
import { giftValue } from '../src/panel/valor.ts';

const close = (a: number | null | undefined, b: number) => assert.ok(a !== null && a !== undefined && Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);

test('en dólares: valor de hoy y variación contra lo que se puso', () => {
  const v = giftValue(100_000n, { moneda: 'USD', monto: 100, usdPorBtc: 100_000 }, { usdPorBtc: 110_000, arsPorBtc: null });
  assert.equal(v?.moneda, 'USD');
  close(v?.hoy, 110);
  close(v?.variacion, 0.1);
});

test('en pesos: con la cotización en pesos de hoy', () => {
  const v = giftValue(100_000n, { moneda: 'ARS', monto: 160_000, usdPorBtc: 100_000 }, { usdPorBtc: 110_000, arsPorBtc: 144_000_000 });
  assert.equal(v?.moneda, 'ARS');
  close(v?.hoy, 144_000);
  close(v?.variacion, -0.1);
});

test('en sats: en dólares, contra la cotización del día en que se armó', () => {
  const v = giftValue(200_000n, { moneda: 'SAT', monto: 200_000, usdPorBtc: 50_000 }, { usdPorBtc: 60_000, arsPorBtc: null });
  close(v?.hoy, 120);
  close(v?.variacion, 0.2);
});

test('sin cotización o sin sats no se muestra; sin dato original, el valor sin variación', () => {
  assert.equal(giftValue(100_000n, null, { usdPorBtc: null, arsPorBtc: null }), null);
  assert.equal(giftValue(0n, null, { usdPorBtc: 100_000, arsPorBtc: null }), null);
  assert.equal(giftValue(100_000n, null, { usdPorBtc: 100_000, arsPorBtc: null })?.variacion, null);
  // En pesos pero sin la cotización en pesos de hoy: en dólares, contra la cotización de ese día.
  const v = giftValue(100_000n, { moneda: 'ARS', monto: 160_000, usdPorBtc: 100_000 }, { usdPorBtc: 120_000, arsPorBtc: null });
  assert.equal(v?.moneda, 'USD');
  close(v?.variacion, 0.2);
});
