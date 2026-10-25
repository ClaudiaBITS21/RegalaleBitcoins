import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { deserializar, pasosRetomables, serializar } from '../src/give/borrador.ts';
import type { Draft } from '../src/give/GivePage.tsx';

const draft: Draft = {
  occasion: 'cumple',
  occasionFree: '',
  to: 'Juli',
  from: 'Clau',
  message: '¡Feliz cumple, Juli!',
  example: null,
  undo: null,
  style: 'propia',
  ownImage: { dataUrl: 'data:image/jpeg;base64,AAAA', base64: 'AAAA' },
  lang: 'es',
  currency: 'USD',
  amount: 20,
  sats: 21_000n,
  showValue: false,
};

describe('Borrador de Regalar', () => {
  it('vuelve igual que se guardó, con los sats como bigint', () => {
    const b = deserializar(serializar(['ocasion', 'para', 'cuanto'], draft));
    assert.deepEqual(b, { steps: ['ocasion', 'para', 'cuanto'], draft });
  });

  it('no guarda los pasos de las palabras ni los del regalo armado', () => {
    assert.deepEqual(pasosRetomables(['ocasion', 'para', 'cuanto', 'guardar', 'codigo', 'verificar']), ['ocasion', 'para', 'cuanto', 'guardar']);
    assert.equal(serializar(['pagar'], draft), null);
    assert.equal(serializar(['mandar'], draft), null);
  });

  it('sin lugar para la imagen propia, guarda el resto con el estilo de siempre', () => {
    const b = deserializar(serializar(['ocasion', 'para'], draft, false));
    assert.equal(b?.draft.ownImage, null);
    assert.equal(b?.draft.style, 'ilustracion');
    assert.equal(b?.draft.message, draft.message);
  });

  it('descarta lo que no reconoce', () => {
    for (const t of [null, '', '{', '{"steps":[],"draft":{}}', '{"steps":["codigo"],"draft":{"sats":"1"}}', '{"steps":["para"],"draft":{"sats":"1.5"}}']) assert.equal(deserializar(t), null, String(t));
  });
});
