import type { UiLang } from '../i18n/index.ts';
import { type Country, DEFAULT_COUNTRY, upcomingOccasion } from './temporada.ts';

// Catálogo de ocasiones (docs/diseno/DISENO.md §4). La clave viaja a la API; la etiqueta
// se muestra en el idioma de quien mira. "otra" es la ocasión libre que escribe la persona.

type Labels = Readonly<Record<UiLang, string>>;
const L = (es: string, pt: string, en: string, it: string): Labels => ({ es, pt, en, it });

export const OCCASION_LABELS = {
  cumple: L('Cumpleaños', 'Aniversário', 'Birthday', 'Compleanno'),
  bautismo: L('Bautismo', 'Batizado', 'Baptism', 'Battesimo'),
  navidad: L('Navidad', 'Natal', 'Christmas', 'Natale'),
  casamiento: L('Casamiento', 'Casamento', 'Wedding', 'Matrimonio'),
  babyshower: L('Baby shower', 'Chá de bebê', 'Baby shower', 'Baby shower'),
  porque: L('Porque sí', 'Só porque sim', 'Just because', 'Così, perché sì'),
  nacimiento: L('Nacimiento', 'Nascimento', 'New baby', 'Nascita'),
  comunion: L('Primera comunión', 'Primeira comunhão', 'First communion', 'Prima comunione'),
  mitzva: L('Bar / Bat Mitzvá', 'Bar / Bat Mitzvá', 'Bar / Bat Mitzvah', 'Bar / Bat Mitzvah'),
  quince: L('Cumple de 15', 'Festa de 15 anos', 'Quinceañera', 'Festa dei 15 anni'),
  egresados: L('Egresados', 'Formatura do colégio', 'Graduation', 'Diploma'),
  recibido: L('Recibido/a', 'Formatura', 'College graduation', 'Laurea'),
  aniversario: L('Aniversario', 'Aniversário de casamento', 'Anniversary', 'Anniversario'),
  jubilacion: L('Jubilación', 'Aposentadoria', 'Retirement', 'Pensione'),
  casanueva: L('Casa nueva', 'Casa nova', 'New home', 'Casa nuova'),
  reyes: L('Reyes', 'Dia de Reis', 'Three Kings Day', 'Epifania'),
  anionuevo: L('Año nuevo', 'Ano novo', 'New Year', 'Capodanno'),
  sanvalentin: L('San Valentín', 'Dia dos Namorados', "Valentine's Day", 'San Valentino'),
  pascuas: L('Pascuas', 'Páscoa', 'Easter', 'Pasqua'),
  diamadre: L('Día de la Madre', 'Dia das Mães', "Mother's Day", 'Festa della mamma'),
  diapadre: L('Día del Padre', 'Dia dos Pais', "Father's Day", 'Festa del papà'),
  dianino: L('Día del Niño', 'Dia das Crianças', "Children's Day", 'Giornata dei bambini'),
  amigo: L('Día del Amigo', 'Dia do Amigo', 'Friendship Day', "Giornata dell'amicizia"),
  abuelos: L('Día de los Abuelos', 'Dia dos Avós', "Grandparents' Day", 'Festa dei nonni'),
  maestro: L('Día del Maestro', 'Dia do Professor', "Teachers' Day", "Giornata dell'insegnante"),
  pizzaday: L('Bitcoin Pizza Day', 'Bitcoin Pizza Day', 'Bitcoin Pizza Day', 'Bitcoin Pizza Day'),
  genesis: L('Cumple del bloque génesis', 'Aniversário do bloco gênese', 'Genesis block birthday', 'Compleanno del blocco genesi'),
  whitepaper: L('Aniversario del whitepaper', 'Aniversário do whitepaper', 'Whitepaper anniversary', 'Anniversario del whitepaper'),
  halving: L('Halving', 'Halving', 'Halving', 'Halving'),
  trabajo: L('Nuevo trabajo', 'Emprego novo', 'New job', 'Nuovo lavoro'),
  gracias: L('Gracias', 'Obrigado', 'Thank you', 'Grazie'),
  mejorate: L('Mejorate pronto', 'Melhoras', 'Get well soon', 'Guarisci presto'),
  // Claves de regalos anteriores al catálogo.
  graduacion: L('Graduación', 'Formatura', 'Graduation', 'Laurea'),
  otra: L('Un regalo', 'Um presente', 'A gift', 'Un regalo'),
} as const;

export type OccasionKey = keyof typeof OCCASION_LABELS;

export const isOccasion = (key: string): key is OccasionKey => Object.hasOwn(OCCASION_LABELS, key);

/** Etiqueta de la ocasión; para la ocasión libre, el texto que escribió quien regala. */
export function occasionLabel(key: string, lang: UiLang, free?: string | null): string {
  if (key === 'otra' && free) return free;
  return isOccasion(key) ? OCCASION_LABELS[key][lang] : OCCASION_LABELS.otra[lang];
}

export interface OccasionGroup {
  readonly id: 'familia' | 'anio' | 'bitcoiners' | 'otras';
  readonly color: string;
  readonly items: readonly OccasionKey[];
}

export const OCCASION_GROUPS: readonly OccasionGroup[] = [
  {
    id: 'familia',
    color: '#ffd976',
    items: ['nacimiento', 'bautismo', 'comunion', 'mitzva', 'cumple', 'quince', 'egresados', 'recibido', 'casamiento', 'aniversario', 'babyshower', 'jubilacion', 'casanueva'],
  },
  { id: 'anio', color: '#ffc7d8', items: ['navidad', 'reyes', 'anionuevo', 'sanvalentin', 'pascuas', 'diamadre', 'diapadre', 'dianino', 'amigo', 'abuelos', 'maestro'] },
  { id: 'bitcoiners', color: '#ffd8b5', items: ['pizzaday', 'genesis', 'whitepaper', 'halving'] },
  { id: 'otras', color: '#bdebfa', items: ['trabajo', 'gracias', 'mejorate', 'porque'] },
];

/** Las de siempre, con su color de chip. */
export const FEATURED: ReadonlyArray<readonly [OccasionKey, string]> = [
  ['cumple', '#ffd23f'],
  ['bautismo', '#bdebfa'],
  ['navidad', '#ffc7d8'],
  ['casamiento', '#ffd8b5'],
  ['babyshower', '#d9f5c9'],
  ['porque', '#f1f1f4'],
];

/** Respaldo de la temporada según el mes (0 = enero), con fechas de Argentina. */
const SEASON: readonly OccasionKey[] = ['reyes', 'sanvalentin', 'pascuas', 'pascuas', 'pizzaday', 'diapadre', 'amigo', 'dianino', 'maestro', 'diamadre', 'navidad', 'navidad'];

/**
 * La ocasión de temporada (content/temporada.ts): la próxima fecha de regalo del país en
 * las próximas 6 semanas. Si no hay ninguna, la del mes, siempre que en ese país todavía
 * no haya pasado (el Día de la Madre de octubre no sirve en Brasil ni el 20 de octubre);
 * si no, la próxima fecha del país, aunque falte más.
 */
export function seasonalOccasion(date: Date = new Date(), country: Country = DEFAULT_COUNTRY): OccasionKey {
  const soon = upcomingOccasion(date, country);
  if (soon !== null) return soon.key;
  const byMonth = SEASON[date.getMonth()] as OccasionKey;
  const next = upcomingOccasion(date, country, MONTH_FALLBACK_DAYS, byMonth);
  if (next !== null) return byMonth;
  return upcomingOccasion(date, country, 366)?.key ?? byMonth;
}

/** Hasta cuánto puede faltar para la ocasión del mes cuando se usa de respaldo. */
const MONTH_FALLBACK_DAYS = 90;

/** Sin tildes ni mayúsculas, para el buscador. */
export const fold = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export const FREE_OCCASION_MAX = 40;
