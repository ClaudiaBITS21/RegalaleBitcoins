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
