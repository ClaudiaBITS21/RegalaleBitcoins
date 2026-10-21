import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { defaultUnit, presetsFor } from '../src/give/montos.ts';

// Paso del monto: moneda local arriba y sugeridos redondos en esa moneda.
describe('Montos sugeridos', () => {
  it('en pesos, los de dólares por mil; en sats, lo que valen hoy los de dólares', () => {
    assert.deepEqual(presetsFor('USD', [25, 50, 100], 100_000), [25, 50, 100]);
    assert.deepEqual(presetsFor('ARS', [25, 50, 100], 100_000), [25_000, 50_000, 100_000]);
    assert.deepEqual(presetsFor('SAT', [25, 50, 100], 100_000), [25_000, 50_000, 100_000]);
    assert.deepEqual(presetsFor('SAT', [25], 82_580), [30_274]);
  });

  it('arranca en pesos solo en Argentina y con cotización', () => {
    assert.equal(defaultUnit('AR', true), 'ARS');
    assert.equal(defaultUnit('AR', false), 'USD');
    assert.equal(defaultUnit('UY', true), 'USD');
    assert.equal(defaultUnit('INT', true), 'USD');
  });
});
