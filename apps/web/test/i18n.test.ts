import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DICTS, detectLang, format, translate, UI_LANGS } from '../src/i18n/index.ts';
import { es } from '../src/i18n/es.ts';

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('Traducciones', () => {
  for (const lang of UI_LANGS) {
    it(`${lang}: tiene todas las claves, con los mismos marcadores y sin textos vacíos`, () => {
      const dict = DICTS[lang];
      assert.deepEqual(Object.keys(dict).sort(), Object.keys(es).sort());
      for (const [key, value] of Object.entries(dict)) {
        assert.ok(value.trim().length > 0, `${lang}.${key} vacío`);
        assert.deepEqual(placeholders(value), placeholders(es[key as keyof typeof es]), `${lang}.${key}`);
      }
    });
  }

  it('el mensaje fijo de seguridad está en todos los idiomas', () => {
    assert.equal(translate('es', 'pie'), 'Nunca te vamos a pedir las palabras de tu billetera.');
    for (const lang of UI_LANGS) assert.ok(translate(lang, 'pie').length > 10);
  });

  it('reemplaza marcadores', () => {
    assert.equal(format('Hola {nombre}', { nombre: 'Tomi' }), 'Hola Tomi');
    assert.equal(format('Hola {otro}', {}), 'Hola {otro}');
    assert.equal(translate('es', 'palabras.etiqueta', { n: 3 }), 'Palabra 3');
  });

  it('detecta el idioma: guardado, navegador o castellano', () => {
    assert.equal(detectLang('pt', ['en-US']), 'pt');
    assert.equal(detectLang(null, ['it-IT', 'en']), 'it');
    assert.equal(detectLang(null, ['de-DE', 'en-GB']), 'en');
    assert.equal(detectLang(null, ['de-DE']), 'es');
    assert.equal(detectLang('xx', ['pt-BR']), 'pt');
  });
});

describe('Contenido', () => {
  it('las 21 razones en castellano son copia exacta del JSON fuente, y hay 21 en cada idioma', async () => {
    const { readFileSync } = await import('node:fs');
    const { REASONS } = await import('../src/content/razones.ts');
    const source = JSON.parse(readFileSync(new URL('../../../docs/contenido/razones.es.json', import.meta.url), 'utf8')) as {
      razones: Array<{ titulo: string; explicacion: string }>;
    };
    assert.deepEqual(
      REASONS.es.map(([t, d]) => [t, d]),
      source.razones.map((r) => [r.titulo, r.explicacion]),
    );
    for (const lang of UI_LANGS) {
      assert.equal(REASONS[lang].length, 21, lang);
      for (const [t, d] of REASONS[lang]) assert.ok(t.length > 0 && d.length > 0);
    }
  });

  it('el catálogo de ocasiones tiene etiqueta en los 4 idiomas y la temporada sale del catálogo', async () => {
    const { OCCASION_LABELS, OCCASION_GROUPS, FEATURED, seasonalOccasion, isOccasion } = await import('../src/content/occasions.ts');
    for (const labels of Object.values(OCCASION_LABELS)) for (const lang of UI_LANGS) assert.ok(labels[lang].length > 0);
    for (const g of OCCASION_GROUPS) for (const k of g.items) assert.ok(isOccasion(k));
    for (const [k] of FEATURED) assert.ok(isOccasion(k));
    for (let m = 0; m < 12; m++) assert.ok(isOccasion(seasonalOccasion(new Date(2026, m, 15))));
  });
});
