import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { reminderText } from '../src/panel/recordatorio.ts';
import { VOSEO } from './voseo.ts';

// Recordatorio que quien regala copia desde su panel para un regalo sin abrir.
describe('Recordatorio de un regalo sin abrir', () => {
  const now = new Date('2026-10-21T12:00:00');
  const gift = { creado: '2026-10-05T15:00:00', idioma: 'es', ocasion: 'cumple', ocasionLibre: null };

  it('lleva el día, la ocasión y, si hay, el link al final', () => {
    const text = reminderText(gift, 'vos', 'https://regalalebitcoin.com/r/abc#x', now);
    assert.ok(text.startsWith('Te recuerdo que el 5 de octubre te mandé esta tarjeta por tu cumpleaños.'), text);
    assert.ok(text.includes('Avisame.'));
    assert.ok(text.endsWith('\n\nhttps://regalalebitcoin.com/r/abc#x'));
  });

  it('con tú no queda voseo; sin link, termina en el texto', () => {
    const text = reminderText(gift, 'tu', null, now);
    assert.ok(!VOSEO.test(text), text);
    assert.ok(text.endsWith('Avísame.'));
  });

  it('va en el idioma del regalo y suma el año si es de otro año', () => {
    const text = reminderText({ ...gift, idioma: 'en', creado: '2025-12-24T15:00:00', ocasion: 'navidad' }, 'vos', null, now);
    assert.ok(text.startsWith('Just a reminder: on December 24, 2025 I sent you this card for Christmas.'), text);
  });

  it('la ocasión libre va con «por»', () => {
    assert.ok(reminderText({ ...gift, ocasion: 'otra', ocasionLibre: 'tu ascenso' }, 'vos', null, now).includes('esta tarjeta por tu ascenso.'));
  });
});
