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

/**
 * La ocasión dentro del mensaje que manda quien regala («te hice un regalo por tu cumpleaños»):
 * una frase por ocasión, porque el nombre solo no siempre entra («por tu Porque sí»). Sirve con
 * vos y con tú. La ocasión libre va como «por …» con lo que escribió la persona; sin ocasión, vacío.
 */
const OCCASION_REASONS: Readonly<Partial<Record<OccasionKey, Labels>>> = {
  cumple: L('por tu cumpleaños', 'pelo seu aniversário', 'for your birthday', 'per il tuo compleanno'),
  bautismo: L('por tu bautismo', 'pelo seu batizado', 'for your baptism', 'per il tuo battesimo'),
  navidad: L('por Navidad', 'de Natal', 'for Christmas', 'per Natale'),
  casamiento: L('por tu casamiento', 'pelo seu casamento', 'for your wedding', 'per il tuo matrimonio'),
  babyshower: L('por tu baby shower', 'pelo seu chá de bebê', 'for your baby shower', 'per il tuo baby shower'),
  porque: L('porque sí', 'só porque sim', 'just because', 'così, perché sì'),
  nacimiento: L('por el nacimiento', 'pelo nascimento', 'for the new baby', 'per la nascita'),
  comunion: L('por tu primera comunión', 'pela sua primeira comunhão', 'for your first communion', 'per la tua prima comunione'),
  mitzva: L('por tu Bar / Bat Mitzvá', 'pelo seu Bar / Bat Mitzvá', 'for your Bar / Bat Mitzvah', 'per il tuo Bar / Bat Mitzvah'),
  quince: L('por tus 15', 'pelos seus 15 anos', 'for your quinceañera', 'per i tuoi 15 anni'),
  egresados: L('por tu egreso', 'pela sua formatura', 'for your graduation', 'per il tuo diploma'),
  recibido: L('porque te recibiste', 'pela sua formatura', 'for your college graduation', 'per la tua laurea'),
  aniversario: L('por tu aniversario', 'pelo seu aniversário de casamento', 'for your anniversary', 'per il vostro anniversario'),
  jubilacion: L('por tu jubilación', 'pela sua aposentadoria', 'for your retirement', 'per la tua pensione'),
  casanueva: L('por tu casa nueva', 'pela sua casa nova', 'for your new home', 'per la tua casa nuova'),
  reyes: L('por Reyes', 'de Dia de Reis', 'for Three Kings Day', 'per l’Epifania'),
  anionuevo: L('por Año Nuevo', 'de Ano Novo', 'for New Year', 'per Capodanno'),
  sanvalentin: L('por San Valentín', 'pelo Dia dos Namorados', 'for Valentine’s Day', 'per San Valentino'),
  pascuas: L('por Pascuas', 'de Páscoa', 'for Easter', 'per Pasqua'),
  diamadre: L('por el Día de la Madre', 'pelo Dia das Mães', 'for Mother’s Day', 'per la Festa della mamma'),
  diapadre: L('por el Día del Padre', 'pelo Dia dos Pais', 'for Father’s Day', 'per la Festa del papà'),
  dianino: L('por el Día del Niño', 'pelo Dia das Crianças', 'for Children’s Day', 'per la Giornata dei bambini'),
  amigo: L('por el Día del Amigo', 'pelo Dia do Amigo', 'for Friendship Day', 'per la Giornata dell’amicizia'),
  abuelos: L('por el Día de los Abuelos', 'pelo Dia dos Avós', 'for Grandparents’ Day', 'per la Festa dei nonni'),
  maestro: L('por el Día del Maestro', 'pelo Dia do Professor', 'for Teachers’ Day', 'per la Giornata dell’insegnante'),
  pizzaday: L('por el Bitcoin Pizza Day', 'pelo Bitcoin Pizza Day', 'for Bitcoin Pizza Day', 'per il Bitcoin Pizza Day'),
  genesis: L('por el cumple del bloque génesis', 'pelo aniversário do bloco gênese', 'for the genesis block’s birthday', 'per il compleanno del blocco genesi'),
  whitepaper: L('por el aniversario del whitepaper', 'pelo aniversário do whitepaper', 'for the whitepaper’s anniversary', 'per l’anniversario del whitepaper'),
  halving: L('por el halving', 'pelo halving', 'for the halving', 'per l’halving'),
  trabajo: L('por tu nuevo trabajo', 'pelo seu emprego novo', 'for your new job', 'per il tuo nuovo lavoro'),
  gracias: L('para darte las gracias', 'para te agradecer', 'to say thank you', 'per dirti grazie'),
  mejorate: L('para que te mejores pronto', 'para desejar melhoras', 'to wish you a speedy recovery', 'per augurarti di guarire presto'),
  graduacion: L('por tu graduación', 'pela sua formatura', 'for your graduation', 'per la tua laurea'),
};

const FREE_REASON: Labels = L('por', 'por', 'for', 'per');

export function occasionReason(key: string, lang: UiLang, free?: string | null): string {
  if (key === 'otra') return free ? `${FREE_REASON[lang]} ${free}` : '';
  return isOccasion(key) ? (OCCASION_REASONS[key]?.[lang] ?? '') : '';
}

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
