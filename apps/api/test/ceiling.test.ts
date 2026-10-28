import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getNetwork } from '@regalale/core';
import { CEILING_USD, DAILY_ACCOUNT_USD, effectiveCeilingUsd, LIST_CEILING_USD, MAINNET_CEILING_USD, MAINNET_DAILY_ACCOUNT_USD, MAINNET_LIST_CEILING_USD } from '../src/app.ts';
import { dailyAllowance, giftUsd } from '../src/topes.ts';

describe('techo por regalo', () => {
  it('en mainnet nunca supera el autorizado, aunque la variable diga otra cosa', () => {
    const mainnet = getNetwork('mainnet', { allowMainnet: true });
    assert.equal(MAINNET_CEILING_USD, 100);
    assert.equal(effectiveCeilingUsd(mainnet, undefined), 100);
    assert.equal(effectiveCeilingUsd(mainnet, 500), 100);
    assert.equal(effectiveCeilingUsd(mainnet, 10), 10);
  });

  it('en signet usa el configurado o el de la beta', () => {
    const signet = getNetwork('signet');
    assert.equal(effectiveCeilingUsd(signet, undefined), CEILING_USD);
    assert.equal(effectiveCeilingUsd(signet, 50), 50);
    assert.equal(effectiveCeilingUsd(signet, Number.NaN), CEILING_USD);
  });

  it('listas y tope diario (28/10/2026): 250 y 500 en mainnet; la variable solo baja', () => {
    const mainnet = getNetwork('mainnet', { allowMainnet: true });
    assert.equal(MAINNET_LIST_CEILING_USD, 250);
    assert.equal(MAINNET_DAILY_ACCOUNT_USD, 500);
    assert.equal(effectiveCeilingUsd(mainnet, undefined, LIST_CEILING_USD, MAINNET_LIST_CEILING_USD), 250);
    assert.equal(effectiveCeilingUsd(mainnet, 1000, LIST_CEILING_USD, MAINNET_LIST_CEILING_USD), 250);
    assert.equal(effectiveCeilingUsd(mainnet, 150, LIST_CEILING_USD, MAINNET_LIST_CEILING_USD), 150);
    assert.equal(effectiveCeilingUsd(mainnet, 900, DAILY_ACCOUNT_USD, MAINNET_DAILY_ACCOUNT_USD), 500);
  });
});

describe('tope diario por cuenta', () => {
  const now = new Date('2026-10-28T12:00:00Z');
  const ago = (h: number) => new Date(now.getTime() - h * 3600_000);

  it('cinco de USD 100 entran; el sexto, no, hasta que el primero cumple 24 h', () => {
    const rows = [20, 10, 5, 2, 1].map((h) => ({ at: ago(h), usd: 100 }));
    assert.deepEqual(dailyAllowance(rows.slice(0, 4), 100, 500, now), { ok: true });
    const sixth = dailyAllowance(rows, 100, 500, now);
    assert.equal(sixth.ok, false);
    if (!sixth.ok) {
      assert.equal(sixth.remainingUsd, 0);
      assert.equal(sixth.from.getTime(), ago(20).getTime() + 24 * 3600_000);
    }
  });

  it('ventana móvil: lo de hace más de 24 h no cuenta; avisa cuánto queda', () => {
    assert.deepEqual(dailyAllowance([{ at: ago(25), usd: 500 }, { at: ago(1), usd: 100 }], 100, 500, now), { ok: true });
    const r = dailyAllowance([{ at: ago(3), usd: 450 }], 80, 500, now);
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.remainingUsd, 50);
      assert.equal(r.from.getTime(), ago(3).getTime() + 24 * 3600_000);
    }
  });

  it('el monto en dólares: el elegido si fue en dólares; si no, sats por la cotización', () => {
    assert.equal(giftUsd({ currency: 'USD', amount: 100, satsExpected: 99_000n }, 100_000), 100);
    assert.equal(giftUsd({ currency: 'SAT', amount: 50_000, satsExpected: 50_000n }, 100_000), 50);
  });
});
