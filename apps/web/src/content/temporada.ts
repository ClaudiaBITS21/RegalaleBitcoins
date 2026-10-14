import type { OccasionKey } from './occasions.ts';

// Ocasión de temporada según el país de quien entra (docs/diseno/DISENO.md §4): el Día de
// la Madre en la Argentina es en octubre y en Brasil o México en mayo. El país se adivina
// en el navegador, sin consultar a nadie: zona horaria primero y, si no alcanza, la región
// del idioma. Funciones puras: la fecha y el país se inyectan (y así se prueban).

/** Países con fechas propias. El resto usa las fechas más comunes (INT). */
export const COUNTRIES = ['AR', 'UY', 'CL', 'MX', 'ES', 'BR', 'PT', 'IT', 'US'] as const;
export type Country = (typeof COUNTRIES)[number] | 'INT';
export const DEFAULT_COUNTRY: Country = 'AR';

/** Cuánto antes empieza a mostrarse una fecha como "Se viene". */
export const SEASON_WINDOW_DAYS = 42;

// Zonas horarias (IANA) → país. Solo las de los países con fechas propias.
const TZ_PREFIX: ReadonlyArray<readonly [string, Country]> = [
  ['America/Argentina/', 'AR'],
  ['America/Buenos_Aires', 'AR'],
  ['America/Cordoba', 'AR'],
  ['America/Mendoza', 'AR'],
  ['America/Montevideo', 'UY'],
  ['America/Santiago', 'CL'],
  ['America/Punta_Arenas', 'CL'],
  ['Pacific/Easter', 'CL'],
  ['America/Mexico_City', 'MX'],
  ['America/Monterrey', 'MX'],
  ['America/Merida', 'MX'],
  ['America/Cancun', 'MX'],
  ['America/Chihuahua', 'MX'],
  ['America/Ciudad_Juarez', 'MX'],
  ['America/Hermosillo', 'MX'],
  ['America/Mazatlan', 'MX'],
  ['America/Tijuana', 'MX'],
  ['America/Matamoros', 'MX'],
  ['America/Ojinaga', 'MX'],
  ['America/Bahia_Banderas', 'MX'],
  ['Europe/Madrid', 'ES'],
  ['Atlantic/Canary', 'ES'],
  ['Africa/Ceuta', 'ES'],
  ['America/Sao_Paulo', 'BR'],
  ['America/Bahia', 'BR'],
  ['America/Fortaleza', 'BR'],
  ['America/Recife', 'BR'],
  ['America/Belem', 'BR'],
  ['America/Manaus', 'BR'],
  ['America/Cuiaba', 'BR'],
  ['America/Campo_Grande', 'BR'],
  ['America/Porto_Velho', 'BR'],
  ['America/Boa_Vista', 'BR'],
  ['America/Rio_Branco', 'BR'],
  ['America/Maceio', 'BR'],
  ['America/Araguaina', 'BR'],
  ['America/Santarem', 'BR'],
  ['America/Noronha', 'BR'],
  ['America/Eirunepe', 'BR'],
  ['Europe/Lisbon', 'PT'],
  ['Atlantic/Madeira', 'PT'],
  ['Atlantic/Azores', 'PT'],
  ['Europe/Rome', 'IT'],
  ['America/New_York', 'US'],
  ['America/Chicago', 'US'],
  ['America/Denver', 'US'],
  ['America/Phoenix', 'US'],
  ['America/Los_Angeles', 'US'],
  ['America/Anchorage', 'US'],
  ['America/Detroit', 'US'],
  ['America/Indiana/', 'US'],
  ['America/Kentucky/', 'US'],
  ['America/Boise', 'US'],
  ['Pacific/Honolulu', 'US'],
];

const asCountry = (code: string): Country | null => ((COUNTRIES as readonly string[]).includes(code) ? (code as Country) : null);

/**
 * País de quien entra, sin llamar a ningún servicio. La zona horaria dice dónde está la
 * persona (alguien en Buenos Aires con el navegador en inglés sigue festejando en octubre);
 * si la zona no es de un país conocido, vale la región del idioma (es-MX, pt-BR…). Una
 * zona o región reconocible pero sin fechas propias da INT; sin ningún dato, la Argentina.
 */
export function detectCountry(languages: readonly string[], timeZone: string | undefined): Country {
  if (timeZone !== undefined && timeZone !== '') {
    for (const [prefix, country] of TZ_PREFIX) if (timeZone === prefix || (prefix.endsWith('/') && timeZone.startsWith(prefix))) return country;
  }
  let foreign = false;
  for (const tag of languages) {
    // La región es la parte de 2 letras: es-AR, pt-BR, en-US (es-419 no dice el país).
    const region = tag.split('-').slice(1).find((p) => /^[A-Za-z]{2}$/.test(p));
    if (region === undefined) continue;
    const known = asCountry(region.toUpperCase());
    if (known !== null) return known;
    foreign = true;
  }
  return foreign ? 'INT' : DEFAULT_COUNTRY;
}

/** Lo que dice el navegador, envuelto para que nunca rompa la página. */
export function browserCountry(): Country {
  try {
    const langs = typeof navigator === 'undefined' ? [] : (navigator.languages ?? [navigator.language]);
    return detectCountry(langs, Intl.DateTimeFormat().resolvedOptions().timeZone);
  } catch {
    return DEFAULT_COUNTRY;
  }
}

// Fechas como días UTC para contar sin sorpresas por el horario de verano.
const day = (y: number, m: number, d: number): number => Date.UTC(y, m, d) / 86_400_000;

/** El n-ésimo domingo del mes (m: 0 = enero). */
function nthSunday(y: number, m: number, n: number): number {
  const first = new Date(Date.UTC(y, m, 1)).getUTCDay();
  return day(y, m, 1 + ((7 - first) % 7) + 7 * (n - 1));
}

/** Domingo de Pascua (calendario gregoriano, algoritmo de Meeus/Jones/Butcher). */
export function easterSunday(y: number): number {
  const a = y % 19;
  const b = Math.floor(y / 100);
  const c = y % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const dd = ((h + l - 7 * m + 114) % 31) + 1;
  return day(y, month - 1, dd);
}

type Rule = (y: number) => number;
const fixed =
  (m: number, d: number): Rule =>
  (y) =>
    day(y, m, d);
const sunday =
  (m: number, n: number): Rule =>
  (y) =>
    nthSunday(y, m, n);

// Fechas de regalo de cada país. Las de bitcoin (Pizza Day) y Navidad, Pascuas y año nuevo
// valen para todos; las del calendario de cada país van en su tabla.
const COMMON: ReadonlyArray<readonly [OccasionKey, Rule]> = [
  ['anionuevo', fixed(0, 1)],
  ['pascuas', easterSunday],
  ['pizzaday', fixed(4, 22)],
  ['navidad', fixed(11, 25)],
];

const BY_COUNTRY: Readonly<Record<Country, ReadonlyArray<readonly [OccasionKey, Rule]>>> = {
  AR: [
    ['reyes', fixed(0, 6)],
    ['sanvalentin', fixed(1, 14)],
    ['diapadre', sunday(5, 3)],
    ['amigo', fixed(6, 20)],
    ['dianino', sunday(7, 3)],
    ['maestro', fixed(8, 11)],
    ['diamadre', sunday(9, 3)],
  ],
  UY: [
    ['reyes', fixed(0, 6)],
    ['sanvalentin', fixed(1, 14)],
    ['diamadre', sunday(4, 2)],
    ['amigo', fixed(6, 20)],
  ],
  CL: [
    ['sanvalentin', fixed(1, 14)],
    ['diamadre', sunday(4, 2)],
    ['diapadre', sunday(5, 3)],
  ],
  MX: [
    ['reyes', fixed(0, 6)],
    ['sanvalentin', fixed(1, 14)],
    ['dianino', fixed(3, 30)],
    ['diamadre', fixed(4, 10)],
    ['maestro', fixed(4, 15)],
    ['diapadre', sunday(5, 3)],
  ],
  ES: [
    ['reyes', fixed(0, 6)],
    ['sanvalentin', fixed(1, 14)],
    ['diapadre', fixed(2, 19)],
    ['diamadre', sunday(4, 1)],
    ['abuelos', fixed(6, 26)],
  ],
  BR: [
    ['diamadre', sunday(4, 2)],
    // En Brasil el Dia dos Namorados es el 12 de junio.
    ['sanvalentin', fixed(5, 12)],
    ['amigo', fixed(6, 20)],
    ['abuelos', fixed(6, 26)],
    ['diapadre', sunday(7, 2)],
    ['dianino', fixed(9, 12)],
    ['maestro', fixed(9, 15)],
  ],
  PT: [
    ['sanvalentin', fixed(1, 14)],
    ['diapadre', fixed(2, 19)],
    ['diamadre', sunday(4, 1)],
    ['dianino', fixed(5, 1)],
    ['abuelos', fixed(6, 26)],
  ],
  IT: [
    ['reyes', fixed(0, 6)],
    ['sanvalentin', fixed(1, 14)],
    ['diapadre', fixed(2, 19)],
    ['diamadre', sunday(4, 2)],
    ['abuelos', fixed(9, 2)],
  ],
  US: [
    ['sanvalentin', fixed(1, 14)],
    ['diamadre', sunday(4, 2)],
    ['diapadre', sunday(5, 3)],
  ],
  INT: [
    ['sanvalentin', fixed(1, 14)],
    ['diamadre', sunday(4, 2)],
    ['diapadre', sunday(5, 3)],
  ],
};

/** La fecha (en días UTC) de cada ocasión del país en el año dado. */
export function occasionDates(country: Country, year: number): ReadonlyArray<readonly [OccasionKey, number]> {
  return [...COMMON, ...BY_COUNTRY[country]].map(([k, rule]) => [k, rule(year)] as const);
}

/**
 * La próxima ocasión del país dentro de la ventana (el mismo día cuenta), o null si no hay
 * ninguna. Con dos en la ventana, gana la más cercana. Con `only`, solo esa ocasión.
 */
export function upcomingOccasion(
  date: Date,
  country: Country,
  windowDays: number = SEASON_WINDOW_DAYS,
  only?: OccasionKey,
): { key: OccasionKey; inDays: number } | null {
  const today = day(date.getFullYear(), date.getMonth(), date.getDate());
  let best: { key: OccasionKey; inDays: number } | null = null;
  for (const year of [date.getFullYear(), date.getFullYear() + 1]) {
    for (const [key, when] of occasionDates(country, year)) {
      if (only !== undefined && key !== only) continue;
      const inDays = when - today;
      if (inDays < 0 || inDays > windowDays) continue;
      if (best === null || inDays < best.inDays) best = { key, inDays };
    }
  }
  return best;
}
