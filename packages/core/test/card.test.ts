import assert from 'node:assert/strict';
import { createCipheriv, hkdfSync } from 'node:crypto';
import { describe, it } from 'node:test';
import { base64urlnopad } from '@scure/base';
import { isSealedCard, openCard, sealCard } from '../src/index.ts';

// Tarjeta cifrada con la semilla del regalo (docs/derivacion.md, «Tarjeta»). El vector fija el
// esquema: si cambia, las tarjetas ya guardadas dejan de abrirse.
const SEED = Uint8Array.from({ length: 16 }, (_, i) => i);
const IV = Uint8Array.from({ length: 12 }, (_, i) => 0xa0 + i);
const ADDRESS = 'tb1qy9nq3wd36d6gd06y7sx8s07dz2fc3wuaf3jehy';
const CARD = { para: 'Andrés', de: 'Claudia', mensaje: '¡Feliz cumple! 🎂' };
const VECTOR = 't1.oKGio6Slpqeoqaqr.iWacsFYXExCSq60-z3zQZ34v5wR_l3nKrBzbcv7g2BLOuN44eYPjCbmOZ3DELGtwpztOzUWKeTyjRsx1VaZcULNg4__HyCXbkHNGEY4AcXgwFQ';

describe('Tarjeta cifrada con el link', () => {
  it('vector fijo, y el mismo resultado calculado aparte con node:crypto', async () => {
    assert.equal(await sealCard(SEED, ADDRESS, CARD, IV), VECTOR);
    const key = Buffer.from(hkdfSync('sha256', SEED, new Uint8Array(0), 'regalalebitcoins/tarjeta/v1/aes-gcm', 32));
    const c = createCipheriv('aes-256-gcm', key, IV);
    c.setAAD(Buffer.from(`regalalebitcoins/tarjeta/v1${ADDRESS}`));
    const body = Buffer.concat([c.update(JSON.stringify(CARD), 'utf8'), c.final(), c.getAuthTag()]);
    assert.equal(`t1.${base64urlnopad.encode(IV)}.${base64urlnopad.encode(body)}`, VECTOR);
  });

  it('abre con la misma semilla y dirección; no con otra semilla, otra dirección ni alterada', async () => {
    assert.deepEqual(await openCard(SEED, ADDRESS, VECTOR), CARD);
    const other = SEED.slice();
    other[0] = 99;
    await assert.rejects(openCard(other, ADDRESS, VECTOR), /INVALID_CARD|no se puede abrir/);
    await assert.rejects(openCard(SEED, 'tb1qotra', VECTOR));
    await assert.rejects(openCard(SEED, ADDRESS, `${VECTOR.slice(0, -2)}AA`));
    await assert.rejects(openCard(SEED, ADDRESS, 'v1.x.y'));
  });

  it('al azar, cada sellado es distinto y no contiene el texto; «de» puede faltar', async () => {
    const a = await sealCard(SEED, ADDRESS, { para: 'Ana', de: null, mensaje: '' });
    const b = await sealCard(SEED, ADDRESS, { para: 'Ana', de: null, mensaje: '' });
    assert.ok(a !== b && isSealedCard(a) && !a.includes('Ana'));
    assert.deepEqual(await openCard(SEED, ADDRESS, a), { para: 'Ana', de: null, mensaje: '' });
    assert.equal(isSealedCard('Ana'), false);
  });
});
