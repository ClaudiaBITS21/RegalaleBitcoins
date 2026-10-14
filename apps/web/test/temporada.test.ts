import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isOccasion, seasonalOccasion } from '../src/content/occasions.ts';
import { COUNTRIES, detectCountry, easterSunday, upcomingOccasion } from '../src/content/temporada.ts';

// Fecha local, como la ve la persona (mes 1 = enero, para leer los casos más fácil).
const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12);
const utcDay = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d) / 86_400_000;

describe('País de quien entra', () => {
  it('la zona horaria manda, aunque el navegador esté en otro idioma', () => {
    assert.equal(detectCountry(['en-US', 'en'], 'America/Argentina/Buenos_Aires'), 'AR');
    assert.equal(detectCountry([], 'America/Argentina/Cordoba'), 'AR');
    assert.equal(detectCountry(['es-AR'], 'America/Sao_Paulo'), 'BR');
    assert.equal(detectCountry(['es'], 'America/Mexico_City'), 'MX');
    assert.equal(detectCountry(['en'], 'America/Indiana/Indianapolis'), 'US');
    assert.equal(detectCountry(['es'], 'Atlantic/Canary'), 'ES');
  });

  it('sin una zona conocida, vale la región del idioma', () => {
    assert.equal(detectCountry(['pt-BR', 'pt'], 'UTC'), 'BR');
    assert.equal(detectCountry(['it-IT'], undefined), 'IT');
    assert.equal(detectCountry(['es-419', 'es-MX'], ''), 'MX');
    assert.equal(detectCountry(['de-DE', 'en-US'], 'Europe/Berlin'), 'US');
  });

  it('un país sin fechas propias usa las comunes; sin ningún dato, la Argentina', () => {
    assert.equal(detectCountry(['de-DE'], 'Europe/Berlin'), 'INT');
    assert.equal(detectCountry(['zh-Hant-TW'], 'Asia/Taipei'), 'INT');
    assert.equal(detectCountry(['es', 'en'], undefined), 'AR');
    assert.equal(detectCountry(['es-419'], 'Etc/UTC'), 'AR');
    assert.equal(detectCountry([], undefined), 'AR');
  });
});

describe('Ocasión de temporada según el país', () => {
  it('calcula el domingo de Pascua', () => {
    assert.equal(easterSunday(2024), utcDay(2024, 3, 31));
    assert.equal(easterSunday(2025), utcDay(2025, 4, 20));
    assert.equal(easterSunday(2026), utcDay(2026, 4, 5));
    assert.equal(easterSunday(2027), utcDay(2027, 3, 28));
  });

  it('Día de la Madre: octubre en la Argentina, mayo en Brasil, México, España, Italia y Estados Unidos', () => {
    assert.deepEqual(upcomingOccasion(at(2026, 10, 14), 'AR'), { key: 'diamadre', inDays: 4 }); // 3.er domingo: 18/10
    assert.deepEqual(upcomingOccasion(at(2026, 10, 18), 'AR'), { key: 'diamadre', inDays: 0 }); // el mismo día cuenta
    assert.deepEqual(upcomingOccasion(at(2026, 4, 20), 'BR'), { key: 'diamadre', inDays: 20 }); // 2.º domingo: 10/5
    assert.deepEqual(upcomingOccasion(at(2026, 5, 1), 'MX'), { key: 'diamadre', inDays: 9 }); // 10 de mayo
    assert.deepEqual(upcomingOccasion(at(2026, 4, 20), 'ES'), { key: 'diamadre', inDays: 13 }); // 1.er domingo: 3/5
    assert.deepEqual(upcomingOccasion(at(2026, 4, 20), 'IT'), { key: 'diamadre', inDays: 20 });
    assert.deepEqual(upcomingOccasion(at(2026, 4, 20), 'US'), { key: 'diamadre', inDays: 20 });
  });

  it('Día del Padre y Día del Niño de cada país', () => {
    assert.equal(seasonalOccasion(at(2026, 6, 1), 'AR'), 'diapadre'); // 21/6
    assert.equal(seasonalOccasion(at(2026, 7, 21), 'AR'), 'dianino'); // 16/8
    assert.equal(seasonalOccasion(at(2026, 7, 27), 'BR'), 'diapadre'); // 2.º domingo de agosto: 9/8
    assert.equal(seasonalOccasion(at(2026, 10, 1), 'BR'), 'dianino'); // 12/10
    assert.equal(seasonalOccasion(at(2026, 4, 20), 'MX'), 'dianino'); // 30/4
    assert.equal(seasonalOccasion(at(2026, 3, 1), 'ES'), 'diapadre'); // 19/3
    assert.equal(seasonalOccasion(at(2026, 3, 1), 'IT'), 'diapadre');
    assert.equal(seasonalOccasion(at(2026, 6, 1), 'US'), 'diapadre');
    assert.equal(seasonalOccasion(at(2026, 6, 1), 'BR'), 'sanvalentin'); // Dia dos Namorados: 12/6
  });

  it('con dos fechas en la ventana gana la más cercana', () => {
    assert.equal(seasonalOccasion(at(2026, 9, 1), 'AR'), 'maestro'); // 11/9 antes que el 18/10
    assert.equal(seasonalOccasion(at(2026, 9, 12), 'AR'), 'diamadre');
    assert.equal(seasonalOccasion(at(2026, 3, 1), 'AR'), 'pascuas'); // 5/4
    assert.equal(seasonalOccasion(at(2026, 12, 26), 'AR'), 'anionuevo');
  });

  it('sin nada en 6 semanas: la del mes si no pasó, si no la próxima del país', () => {
    // 19/10 en la Argentina: la Madre ya pasó y Navidad está a más de 6 semanas.
    assert.equal(upcomingOccasion(at(2026, 10, 19), 'AR'), null);
    assert.equal(seasonalOccasion(at(2026, 10, 19), 'AR'), 'navidad');
    // En Brasil el mes de octubre no puede dar el Día de la Madre.
    assert.equal(seasonalOccasion(at(2026, 10, 20), 'BR'), 'navidad');
    assert.equal(seasonalOccasion(at(2026, 4, 6), 'AR'), 'pizzaday'); // Pascuas recién pasó
  });

  it('siempre devuelve una ocasión del catálogo, todos los días y en todos los países', () => {
    for (const country of [...COUNTRIES, 'INT'] as const) {
      for (let d = 0; d < 366; d++) assert.ok(isOccasion(seasonalOccasion(new Date(2026, 0, 1 + d, 12), country)), `${country} día ${d}`);
    }
  });
});
