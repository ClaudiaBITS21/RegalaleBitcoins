import { occasionReason } from '../content/occasions.ts';
import { translate, type Trato, type UiLang } from '../i18n/index.ts';

// Recordatorio para un regalo que sigue sin abrirse (pedido de Rodolfo, 21/10): un texto que
// quien regala copia y manda por su cuenta. Va en el idioma del regalo, con el día en que se
// hizo y la ocasión como frase («por tu cumpleaños»). El link solo entra si la bóveda está
// abierta: sale del navegador, el servidor no lo ve.

export interface ReminderGift {
  readonly creado: string;
  readonly idioma: string;
  readonly ocasion: string;
  readonly ocasionLibre?: string | null;
}

export function reminderText(gift: ReminderGift, trato: Trato, link: string | null, now: Date = new Date()): string {
  const lang = (['es', 'pt', 'en', 'it'].includes(gift.idioma) ? gift.idioma : 'es') as UiLang;
  const created = new Date(gift.creado);
  const dia = created.toLocaleDateString(lang, {
    day: 'numeric',
    month: 'long',
    ...(created.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  });
  const reason = occasionReason(gift.ocasion, lang, gift.ocasionLibre);
  const text = translate(lang, 'panel.recordatorio.mensaje', { dia, motivo: reason === '' ? '' : ` ${reason}` }, trato);
  return link === null ? text : `${text}\n\n${link}`;
}
