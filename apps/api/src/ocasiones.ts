import type { Lang } from '@regalale/core';

// Nombre de cada ocasión para los mails (el recordatorio dice de qué regalo se trata). Copia de
// OCCASION_LABELS en apps/web/src/content/occasions.ts: un test controla que sean iguales.

type Labels = Readonly<Record<Lang, string>>;
const L = (es: string, pt: string, en: string, it: string): Labels => ({ es, pt, en, it });

export const OCCASION_NAMES = {
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

/** El nombre de la ocasión; la libre, con lo que escribió quien regala; sin ocasión, null. */
export function occasionName(key: string, lang: Lang, free?: string | null): string | null {
  if (key === 'otra') return free?.trim() ? free.trim() : null;
  return Object.hasOwn(OCCASION_NAMES, key) ? OCCASION_NAMES[key as keyof typeof OCCASION_NAMES][lang] : null;
}
