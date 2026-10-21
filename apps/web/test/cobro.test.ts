import assert from 'node:assert/strict';
import { test } from 'node:test';
import { newListKey, openCobro, sealCobro, wrapKeyFor } from '../src/lists/cobro.ts';
import { cbuValido, decimales, ibanValido, validarDato } from '../src/lists/medios.ts';

const LISTA = 'AbCdEfGhIjKlMnOpQrStUv';
const OTRA = 'ZyXwVuTsRqPoNmLkJiHgFe';
const VECTOR = 'v1.AAECAwQFBgcICQoL.PCC7fqGMrTm3Y_7p0IdaQaGy5kCfWWVefCLdvC5eMIYxIJrIn_QhqkSVTN24twoUzC0J-S-6wqgdrQhcaoqej9BxswmntFQMfTrETJKRVrmKjn2lXbl2bTuuSrd5';
const COBRO = { medio: 'alias', dato: 'ana.leo.mp', titular: 'Ana Pérez' } as const;

test('dato de cobro: se abre con la clave de la lista; no con otra clave ni en otra lista (AAD)', async () => {
  const key = newListKey();
  assert.match(key, /^[A-Za-z0-9_-]{43}$/);
  const sealed = await sealCobro(key, LISTA, COBRO);
  assert.match(sealed, /^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+$/);
  assert.ok(!sealed.includes('ana'));
  assert.deepEqual(await openCobro(key, LISTA, sealed), COBRO);
  assert.equal(await openCobro(newListKey(), LISTA, sealed), null);
  assert.equal(await openCobro(key, OTRA, sealed), null);
  // Una clave alterada (un carácter del link) no abre nada: no muestra otro alias.
  const flipped = (key[0] === 'A' ? 'B' : 'A') + key.slice(1);
  assert.equal(await openCobro(flipped, LISTA, sealed), null);
});

test('vector de prueba del formato v1 (docs/arquitectura.md)', async () => {
  const key = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8'; // bytes 0..31
  const iv = Uint8Array.from({ length: 12 }, (_, i) => i);
  const sealed = await sealCobro(key, LISTA, { medio: 'iban', dato: 'DE89370400440532013000', titular: 'Erika Mustermann' }, iv);
  assert.equal(sealed, VECTOR);
  assert.deepEqual(await openCobro(key, LISTA, VECTOR), { medio: 'iban', dato: 'DE89370400440532013000', titular: 'Erika Mustermann' });
});

test('clave de la lista guardada con la clave maestra: solo la misma maestra y la misma lista', async () => {
  const root = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
  const mine = await wrapKeyFor(root);
  const key = newListKey();
  const wrapped = await mine.wrap(key, LISTA);
  assert.equal(await mine.unwrap(wrapped, LISTA), key);
  assert.equal(await mine.unwrap(wrapped, OTRA), null);
  assert.equal(await (await wrapKeyFor(Uint8Array.from({ length: 32 }, () => 9))).unwrap(wrapped, LISTA), null);
});

test('medios: CBU/CVU, IBAN, PIX y Bre-B sin documento', () => {
  assert.ok(cbuValido('2850590940090418135201'));
  assert.ok(!cbuValido('2850590940090418135202'));
  assert.deepEqual(validarDato('cbu', '2850590940090418135202'), { ok: false, problema: 'verificador' });
  assert.deepEqual(validarDato('cbu', '28505909 40090418135201'), { ok: true, dato: '2850590940090418135201' });
  assert.ok(ibanValido('DE89370400440532013000'));
  assert.deepEqual(validarDato('iban', 'de89 3704 0044 0532 0130 01'), { ok: false, problema: 'verificador' });
  assert.deepEqual(validarDato('iban', 'es91 2100 0418 4502 0005 1332'), { ok: true, dato: 'ES9121000418450200051332' });
  assert.deepEqual(validarDato('alias', 'Ana.Leo.MP'), { ok: true, dato: 'ana.leo.mp' });
  assert.deepEqual(validarDato('pix', '123.456.789-09'), { ok: false, problema: 'documento' });
  assert.deepEqual(validarDato('pix', '12.345.678/0001-95'), { ok: false, problema: 'documento' });
  assert.deepEqual(validarDato('pix', '+55 (11) 98765-4321'), { ok: true, dato: '+5511987654321' });
  assert.deepEqual(validarDato('pix', 'Ana@Exemplo.com.br'), { ok: true, dato: 'ana@exemplo.com.br' });
  assert.deepEqual(validarDato('pix', '123e4567-e89b-42d3-a456-556642440000'), { ok: true, dato: '123e4567-e89b-42d3-a456-556642440000' });
  assert.deepEqual(validarDato('breb', '1020304050'), { ok: false, problema: 'documento' });
  assert.deepEqual(validarDato('breb', '+57 310 123 4567'), { ok: true, dato: '3101234567' });
  assert.deepEqual(validarDato('breb', '@anaperez'), { ok: true, dato: '@anaperez' });
  assert.deepEqual(validarDato('otro', 'x'.repeat(121)), { ok: false, problema: 'largo' });
  assert.equal(decimales('ARS'), 2);
  assert.equal(decimales('EUR'), 2);
});
