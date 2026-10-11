import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { decodeGiftFragment, encodeGiftFragment } from '../src/index.ts';
import { assertCoreError, toHex } from './helpers.ts';

const entropy = Uint8Array.from({ length: 16 }, (_, i) => i * 17);

describe('Link del regalo', () => {
  it('ida y vuelta, 25 caracteres seguros para URL', () => {
    const fragment = encodeGiftFragment(entropy);
    assert.equal(fragment.length, 25);
    assert.match(fragment, /^1[A-Za-z0-9_-]{24}$/);
    assert.equal(toHex(decodeGiftFragment(fragment)), toHex(entropy));
    assert.equal(toHex(decodeGiftFragment(`#${fragment}`)), toHex(entropy));
    assert.equal(toHex(decodeGiftFragment(` ${fragment}\n`)), toHex(entropy));
  });

  it('formato fijo: vector propio', () => {
    assert.equal(encodeGiftFragment(new Uint8Array(16)), '1AAAAAAAAAAAAAAAAAAAAADdH');
  });

  it('detecta links cortados, dañados o de otra versión', () => {
    const fragment = encodeGiftFragment(entropy);
    const reason = (f: string): unknown => assertCoreError(() => decodeGiftFragment(f), 'INVALID_LINK').details?.reason;
    assert.equal(reason(''), 'empty');
    assert.equal(reason('#'), 'empty');
    assert.equal(reason(`2${fragment.slice(1)}`), 'version');
    assert.equal(reason(fragment.slice(0, -1)), 'length');
    assert.equal(reason(`${fragment}A`), 'length');
    assert.equal(reason(`${fragment.slice(0, 10)}%${fragment.slice(11)}`), 'encoding');
    // Cambiar un carácter de la semilla rompe el control.
    const swapped = fragment.slice(0, 5) + (fragment[5] === 'A' ? 'B' : 'A') + fragment.slice(6);
    assert.equal(reason(swapped), 'checksum');
  });

  it('solo acepta semillas de 16 bytes', () => {
    assertCoreError(() => encodeGiftFragment(new Uint8Array(32)), 'INVALID_ENTROPY');
  });
});
