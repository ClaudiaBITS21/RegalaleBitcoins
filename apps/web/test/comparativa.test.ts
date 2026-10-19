import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { COLUMNAS, COMPARATIVA, COMPARATIVA_TU, DIRECTO_COLUMNAS, FILAS, RELEVADO, type TextosComparativa, VALORES } from '../src/content/comparativa.ts';
import { VOSEO } from './voseo.ts';

interface Item {
  id: string;
  titulo: string;
  bajada: string;
  nosotros?: string;
  valores?: Record<string, string>;
}

// El JSON del handoff es la fuente de verdad: la web no puede apartarse de él sin que se note.
const json = JSON.parse(readFileSync(new URL('../../../docs/contenido/comparativa.es.json', import.meta.url), 'utf8')) as {
  relevado: string;
  kicker: string;
  titulo: string;
  bajada: string;
  valores: Record<string, string>;
  columnas: Item[];
  filas: Item[];
  directo: { titulo: string; parrafos: string[]; columnas: { izquierda: number[]; derecha: number[] } };
  cta: string;
  pie: string;
};

const textos = (c: TextosComparativa): string[] => [
  c.kicker,
  c.titulo,
  c.bajada,
  c.criterios,
  ...Object.values(c.valores),
  ...Object.values(c.columnas).flat(),
  ...Object.values(c.filas).flat(),
  c.directoTitulo,
  ...c.parrafos,
  c.cta,
  c.pie,
];

describe('Comparativa', () => {
  it('el castellano con vos es el del JSON, tal cual', () => {
    const es = COMPARATIVA.es;
    assert.equal(RELEVADO, json.relevado);
    assert.equal(es.kicker, json.kicker);
    assert.equal(es.titulo, json.titulo);
    assert.equal(es.bajada, json.bajada);
    assert.deepEqual({ ...es.valores }, json.valores);
    assert.deepEqual([...COLUMNAS], json.columnas.map((c) => c.id));
    for (const c of json.columnas) assert.deepEqual(es.columnas[c.id as (typeof COLUMNAS)[number]], [c.titulo, c.bajada]);
    assert.deepEqual([...FILAS], json.filas.map((f) => f.id));
    for (const f of json.filas) {
      const id = f.id as (typeof FILAS)[number];
      assert.deepEqual(es.filas[id], [f.titulo, f.bajada]);
      assert.equal(f.nosotros, 'si', id);
      assert.deepEqual({ ...VALORES[id] }, f.valores, id);
    }
    assert.equal(es.directoTitulo, json.directo.titulo);
    assert.deepEqual(es.parrafos, json.directo.parrafos);
    assert.deepEqual(DIRECTO_COLUMNAS.izquierda, json.directo.columnas.izquierda);
    assert.deepEqual(DIRECTO_COLUMNAS.derecha, json.directo.columnas.derecha);
    assert.equal(es.cta, json.cta);
    assert.equal(es.pie, json.pie);
  });

  it('con tú no queda voseo, y todos los idiomas tienen los mismos textos', () => {
    const quedan = textos(COMPARATIVA_TU).filter((t) => VOSEO.test(t));
    assert.deepEqual(quedan, []);
    const n = textos(COMPARATIVA.es).length;
    for (const c of [COMPARATIVA_TU, COMPARATIVA.pt, COMPARATIVA.en, COMPARATIVA.it]) {
      assert.equal(textos(c).length, n);
      assert.ok(textos(c).every((t) => t.trim() !== ''));
      // La marca va marcada (*…* o _…_) en el título en todos los idiomas.
      assert.match(c.titulo, /[*_]Reg[aá]lale Bitcoin[*_]/);
    }
  });

  it('el sitio se nombra como regalalebitcoin.com, nunca con «bitcoins»', () => {
    for (const c of Object.values(COMPARATIVA)) for (const t of textos(c)) assert.ok(!/regalalebitcoins/i.test(t), t);
  });
});
