import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { confirmMail, loginMail, readyMail, reminderMail } from '../src/mail.ts';
import { OCCASION_NAMES, occasionName } from '../src/ocasiones.ts';
import { OCCASION_LABELS } from '../../web/src/content/occasions.ts';

const LINK = 'https://regalalebitcoin.com/panel#acceso=' + 'a'.repeat(43);

describe('Mails con el diseño de la marca', () => {
  it('felicitaciones: primer regalo o uno nuevo; confirmar el mail o ver los regalos', () => {
    const first = readyMail('ana@example.com', 'es', { para: 'Tomi', sats: 30500n, first: true, verified: false, link: LINK });
    assert.equal(first.subject, '¡Felicitaciones! Hiciste tu primer regalo');
    assert.ok(first.text.includes('¡Gracias por regalar bitcoin! Tu regalo ya se puede abrir.'));
    // Sin para quién ni cuánto (08/11/2026).
    assert.ok(!first.text.includes('Tomi') && !first.text.includes('sats'));
    assert.ok(first.html?.includes('Confirmar mi mail'));
    const next = readyMail('ana@example.com', 'it', { para: 'Tomi', sats: 1234n, first: false, verified: true, link: LINK });
    assert.equal(next.subject, 'Congratulazioni! Hai fatto un nuovo regalo');
    assert.ok(!next.text.includes('1.234'));
    assert.ok(next.html?.includes('Vedi i miei regali') && !next.html.includes('Conferma la mia email'));
  });

  it('lo que escribe la persona va escapado en el HTML', () => {
    const m = readyMail('ana@example.com', 'en', { para: '<img src=x onerror=alert(1)>', sats: 1n, first: true, verified: true, link: LINK });
    assert.ok(!m.html?.includes('<img src=x'));
  });

  it('el recordatorio dice la ocasión y el día en que se armó el regalo (05/11)', () => {
    const creado = new Date('2026-11-03T15:00:00Z');
    const es = reminderMail('a@b.co', 'es', 'Rodolfo', LINK, { ocasion: occasionName('cumple', 'es'), creado });
    assert.ok(es.text.startsWith('El regalo para Rodolfo (Cumpleaños, armado el 3 de noviembre de 2026) está pago'), es.text);
    assert.ok(es.html?.includes('El regalo para Rodolfo (Cumpleaños, armado el 3 de noviembre de 2026) está pago'));
    const en = reminderMail('a@b.co', 'en', 'Rodolfo', LINK, { ocasion: occasionName('otra', 'en', 'Mudanza'), creado });
    assert.ok(en.text.startsWith('The gift for Rodolfo (Mudanza, made on November 3, 2026) is paid'), en.text);
    // Sin ocasión, solo la fecha; sin nada, como antes.
    assert.ok(reminderMail('a@b.co', 'es', 'Tomi', LINK, { ocasion: occasionName('otra', 'es', null), creado }).text.startsWith('El regalo para Tomi (armado el 3 de noviembre de 2026) está'));
    assert.ok(reminderMail('a@b.co', 'es', 'Tomi', LINK).text.startsWith('El regalo para Tomi está pago'));
  });

  it('los nombres de las ocasiones son los mismos que los de la web', () => {
    assert.deepEqual(OCCASION_NAMES, OCCASION_LABELS);
  });

  it('todos los mails llevan HTML con el logotipo, el botón y el pie', () => {
    for (const m of [loginMail('a@b.co', 'pt', LINK), confirmMail('a@b.co', 'es', LINK), reminderMail('a@b.co', 'es', 'Tomi', LINK)]) {
      assert.ok(m.html?.includes('https://regalalebitcoin.com/mail/logo-naranja.png'), m.subject);
      assert.ok(m.html?.includes(`href="${LINK}"`), m.subject);
      assert.ok(m.html?.includes('regalalebitcoin.com</a>'), m.subject);
      assert.ok(m.text.includes(LINK), m.subject);
    }
  });
});
