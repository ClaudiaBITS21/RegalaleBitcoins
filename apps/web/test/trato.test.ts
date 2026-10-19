import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { es } from '../src/i18n/es.ts';
import { REASONS } from '../src/content/razones.ts';
import { esTu } from '../src/content/razones-tu.ts';
import { translate } from '../src/i18n/index.ts';
import { detectTrato } from '../src/i18n/trato.ts';
import { tu } from '../src/i18n/tu.ts';
import { VOSEO } from './voseo.ts';

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

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
    // Incluye la marca: con tú es «Regálale Bitcoin» (manual de marca), así que «Regalale» sin
    // acento también cuenta como voseo.
    const quedan = (Object.keys(es) as (keyof typeof es)[]).filter((k) => VOSEO.test(translate('es', k, undefined, 'tu')));
    assert.deepEqual(quedan, []);
  });

  it('las 21 razones y los mensajes de ejemplo también van con tú, con la misma forma', () => {
    assert.equal(esTu.length, REASONS.es.length);
    for (const [titulo, detalle] of esTu) assert.ok(!VOSEO.test(titulo) && !VOSEO.test(detalle), `${titulo} ${detalle}`);
    const leer = (f: string) => JSON.parse(readFileSync(new URL(`../src/content/mensajes/${f}`, import.meta.url), 'utf8')) as Record<string, unknown>;
    const vos = leer('es.json');
    const conTu = leer('es-tu.json');
    assert.deepEqual(Object.keys(conTu), Object.keys(vos));
    const textos = (v: unknown): string[] => (typeof v === 'string' ? [v] : Array.isArray(v) ? v.flatMap(textos) : v !== null && typeof v === 'object' ? Object.values(v).flatMap(textos) : []);
    for (const k of Object.keys(vos)) {
      if (k === '_revisar') continue;
      const a = textos(vos[k]);
      const b = textos(conTu[k]);
      assert.equal(b.length, a.length, k);
      b.forEach((t, i) => {
        assert.ok(!VOSEO.test(t), `${k}: ${t}`);
        assert.deepEqual(placeholders(t), placeholders(a[i] ?? ''), `${k}: ${t}`);
      });
    }
  });

  it('con vos, todo sigue igual que antes', () => {
    for (const k of Object.keys(es) as (keyof typeof es)[]) assert.equal(translate('es', k), es[k].replace(/\{(\w+)\}/g, '{$1}'));
  });
});
