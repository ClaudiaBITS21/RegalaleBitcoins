import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { confirmMail, loginMail, readyMail, reminderMail } from '../src/mail.ts';

const LINK = 'https://regalalebitcoin.com/panel#acceso=' + 'a'.repeat(43);

describe('Mails con el diseño de la marca', () => {
  it('felicitaciones: primer regalo o uno nuevo; confirmar el mail o ver los regalos', () => {
    const first = readyMail('ana@example.com', 'es', { para: 'Tomi', sats: 30500n, first: true, verified: false, link: LINK });
    assert.equal(first.subject, '¡Felicitaciones! Hiciste tu primer regalo');
    assert.ok(first.text.includes('El regalo para Tomi ya está pago y listo para abrir: 30.500 sats.'));
    assert.ok(first.html?.includes('Confirmar mi mail'));
    const next = readyMail('ana@example.com', 'it', { para: 'Tomi', sats: 1234n, first: false, verified: true, link: LINK });
    assert.equal(next.subject, 'Congratulazioni! Hai fatto un nuovo regalo');
    assert.ok(next.text.includes('1.234 sats'));
    assert.ok(next.html?.includes('Vedi i miei regali') && !next.html.includes('Conferma la mia email'));
  });

  it('lo que escribe la persona va escapado en el HTML', () => {
    const m = readyMail('ana@example.com', 'en', { para: '<img src=x onerror=alert(1)>', sats: 1n, first: true, verified: true, link: LINK });
    assert.ok(!m.html?.includes('<img src=x'));
    assert.ok(m.html?.includes('&lt;img src=x onerror=alert(1)&gt;'));
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
