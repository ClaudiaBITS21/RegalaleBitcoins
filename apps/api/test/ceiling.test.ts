import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getNetwork } from '@regalale/core';
import { CEILING_USD, effectiveCeilingUsd, MAINNET_CEILING_USD } from '../src/app.ts';

describe('techo por regalo', () => {
  it('en mainnet nunca supera el autorizado, aunque la variable diga otra cosa', () => {
    const mainnet = getNetwork('mainnet', { allowMainnet: true });
    assert.equal(MAINNET_CEILING_USD, 20);
    assert.equal(effectiveCeilingUsd(mainnet, undefined), 20);
    assert.equal(effectiveCeilingUsd(mainnet, 100), 20);
    assert.equal(effectiveCeilingUsd(mainnet, 10), 10);
  });

  it('en signet usa el configurado o el de la beta', () => {
    const signet = getNetwork('signet');
    assert.equal(effectiveCeilingUsd(signet, undefined), CEILING_USD);
    assert.equal(effectiveCeilingUsd(signet, 50), 50);
    assert.equal(effectiveCeilingUsd(signet, Number.NaN), CEILING_USD);
  });
});
