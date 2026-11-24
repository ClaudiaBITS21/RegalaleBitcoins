import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { REMEMBER_DAYS, resolveOrigin } from '../src/origen.ts';

const DIA = 24 * 60 * 60 * 1000;
const hoy = 20_000;
const ahora = hoy * DIA + 5 * 60 * 60 * 1000;

describe('origen de la visita, recordado 7 días', () => {
  it('una campaña se recuerda una semana', () => {
    assert.equal(REMEMBER_DAYS, 7);
    const r = resolveOrigin('utm:labitconf', null, ahora);
    assert.deepEqual(r, { origen: 'utm:labitconf', recordar: { origen: 'utm:labitconf', vence: hoy + 7 } });
  });

  it('quien vuelve directo dentro de la semana sigue contando para la campaña, sin estirar el plazo', () => {
    const recordado = { origen: 'utm:labitconf', vence: hoy + 7 };
    assert.deepEqual(resolveOrigin('directo', recordado, ahora + 6 * DIA), { origen: 'utm:labitconf', recordar: recordado });
    // Tampoco lo pisan el link de un regalo ni venir desde otro sitio.
    assert.equal(resolveOrigin('regalo', recordado, ahora + DIA).origen, 'utm:labitconf');
    assert.equal(resolveOrigin('instagram.com', recordado, ahora + DIA).origen, 'utm:labitconf');
  });

  it('pasada la semana, ya no', () => {
    const recordado = { origen: 'utm:labitconf', vence: hoy + 7 };
    assert.deepEqual(resolveOrigin('directo', recordado, ahora + 7 * DIA), { origen: 'directo', recordar: null });
  });

  it('otra campaña (o un cupón) reemplaza a la anterior y arranca su semana', () => {
    const recordado = { origen: 'utm:labitconf', vence: hoy + 7 };
    assert.deepEqual(resolveOrigin('utm:navidad', recordado, ahora + 3 * DIA), { origen: 'utm:navidad', recordar: { origen: 'utm:navidad', vence: hoy + 10 } });
    assert.equal(resolveOrigin('cupon', recordado, ahora).origen, 'cupon');
  });

  it('quien recibió un regalo y vuelve en la semana sigue como «regalo»; «directo» no se recuerda', () => {
    const r = resolveOrigin('regalo', null, ahora);
    assert.deepEqual(r.recordar, { origen: 'regalo', vence: hoy + 7 });
    assert.equal(resolveOrigin('directo', r.recordar, ahora + 2 * DIA).origen, 'regalo');
    assert.equal(resolveOrigin('directo', null, ahora).recordar, null);
  });

  it('un vencimiento imposible (más de 7 días adelante) no vale', () => {
    assert.equal(resolveOrigin('directo', { origen: 'utm:x', vence: hoy + 400 }, ahora).origen, 'directo');
  });
});
