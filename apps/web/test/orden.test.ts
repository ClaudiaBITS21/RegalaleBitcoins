import assert from 'node:assert/strict';
import { test } from 'node:test';
import { filterGifts, sortGifts } from '../src/panel/orden.ts';

const g = (para: string, creado: string, abierto: string | null, ocasion: string) => ({ para, creado, abierto, ocasion });
const gifts = [
  g('Zoe', '2026-10-01T00:00:00Z', null, 'Navidad'),
  g('Ángela', '2026-10-03T00:00:00Z', '2026-10-05T00:00:00Z', 'Cumpleaños'),
  g('bruno', '2026-10-02T00:00:00Z', '2026-10-09T00:00:00Z', 'Aniversario'),
  g('Ana', '2026-10-04T00:00:00Z', null, 'Cumpleaños'),
];
const names = (xs: readonly { para: string }[]) => xs.map((x) => x.para);
const m = (x: { ocasion: string }) => x.ocasion;

test('por fecha: lo último primero', () => {
  assert.deepEqual(names(sortGifts(gifts, 'fecha', m, 'es')), ['Ana', 'Ángela', 'bruno', 'Zoe']);
});

test('por apertura: los abiertos primero, del más reciente; después el resto por fecha', () => {
  assert.deepEqual(names(sortGifts(gifts, 'apertura', m, 'es')), ['bruno', 'Ángela', 'Ana', 'Zoe']);
});

test('por nombre, sin importar mayúsculas ni tildes', () => {
  assert.deepEqual(names(sortGifts(gifts, 'nombre', m, 'es')), ['Ana', 'Ángela', 'bruno', 'Zoe']);
});

test('por motivo y, dentro del mismo, por fecha', () => {
  assert.deepEqual(names(sortGifts(gifts, 'motivo', m, 'es')), ['bruno', 'Ana', 'Ángela', 'Zoe']);
});

test('búsqueda por nombre sin tildes', () => {
  assert.deepEqual(names(filterGifts(gifts, 'ange')), ['Ángela']);
  assert.deepEqual(names(filterGifts(gifts, '  ')), names(gifts));
});
