import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { encodeGiftFragment } from '@regalale/core';

import { parseGiftLink } from '../src/giftlink.ts';

describe('Abrir un regalo pegando el link', () => {
  const fragment = `#${encodeGiftFragment(new Uint8Array(16).fill(7))}`;
  const id = 'A'.repeat(22);

  it('acepta el link completo, con o sin dominio, y lo abre en este sitio', () => {
    assert.equal(parseGiftLink(`https://regalalebitcoin.com/r/${id}${fragment}`), `/r/${id}${fragment}`);
    assert.equal(parseGiftLink(`  regalalebitcoins.web.app/r/${id}${fragment}\n`), `/r/${id}${fragment}`);
    assert.equal(parseGiftLink(`Te hice un regalo: https://otro.sitio/r/${id}${fragment} abrilo`), `/r/${id}${fragment}`);
  });

  it('rechaza links sin la semilla o con la semilla rota', () => {
    assert.equal(parseGiftLink(`https://regalalebitcoin.com/r/${id}`), null);
    assert.equal(parseGiftLink(`https://regalalebitcoin.com/r/${id}#1abc`), null);
    assert.equal(parseGiftLink('hola'), null);
  });
});
