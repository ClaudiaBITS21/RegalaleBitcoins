import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { es } from '../src/i18n/es.ts';
import { translate } from '../src/i18n/index.ts';
import { detectTrato } from '../src/i18n/trato.ts';
import { tu } from '../src/i18n/tu.ts';

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

/** Formas de voseo (y léxico rioplatense) que no pueden quedar en la versión con tú. */
export const VOSEO =
  /(?<!\p{L})(vos|sos|podés|tenés|querés|sabés|hacés|ponés|venís|decís|elegís|abrís|recibís|escribís|mandás|regalás|pagás|tocá|abrí|elegí|mirá|escribí|guardá|guardalo|guardala|entrá|pegá|pegalo|copiá|bajá|confirmá|probá|fijate|andá|poné|decile|mandale|regalale|abrilo|anotá|anotalas|usá|seguí|tené|agregá|agregalo|cambiá|completá|revisá|esperá|volvé|hacé|pedí|celu|acá|plata)(?!\p{L})/iu;

describe('Vos o tú según dónde está la persona', () => {
  it('la zona horaria manda: Argentina, Uruguay y Paraguay con vos; el resto con tú', () => {
    assert.equal(detectTrato(['es-MX'], 'America/Argentina/Buenos_Aires'), 'vos');
    assert.equal(detectTrato(['es'], 'America/Buenos_Aires'), 'vos');
    assert.equal(detectTrato(['es'], 'America/Montevideo'), 'vos');
    assert.equal(detectTrato(['es'], 'America/Asuncion'), 'vos');
    assert.equal(detectTrato(['es-AR'], 'America/Mexico_City'), 'tu');
    assert.equal(detectTrato(['es-ES'], 'Europe/Madrid'), 'tu');
    assert.equal(detectTrato(['es'], 'America/Bogota'), 'tu');
    assert.equal(detectTrato(['es'], 'America/Santiago'), 'tu');
  });

  it('sin zona útil, la región del idioma; sin ningún dato, vos', () => {
    assert.equal(detectTrato(['es-MX', 'en'], 'UTC'), 'tu');
    assert.equal(detectTrato(['en-US', 'es-UY'], 'Etc/GMT+3'), 'vos');
    assert.equal(detectTrato(['es-419'], undefined), 'vos');
    assert.equal(detectTrato([], undefined), 'vos');
  });

  it('la versión con tú solo cambia claves que existen, con los mismos marcadores', () => {
    for (const [key, value] of Object.entries(tu)) {
      assert.ok(key in es, `tu.${key} no existe en es`);
      assert.deepEqual(placeholders(value ?? ''), placeholders(es[key as keyof typeof es]), `tu.${key}`);
      assert.notEqual(value, es[key as keyof typeof es], `tu.${key} es igual al voseo`);
    }
  });

  it('con tú no queda ningún texto en voseo', () => {
    const quedan = (Object.keys(es) as (keyof typeof es)[]).filter((k) => VOSEO.test(translate('es', k, undefined, 'tu')));
    assert.deepEqual(quedan, []);
  });

  it('con vos, todo sigue igual que antes', () => {
    for (const k of Object.keys(es) as (keyof typeof es)[]) assert.equal(translate('es', k), es[k].replace(/\{(\w+)\}/g, '{$1}'));
  });
});
