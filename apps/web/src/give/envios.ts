// Por qué canal salió el link y por cuál las palabras: solo el nombre del canal, nunca el link
// ni las palabras. Queda en este navegador (localStorage) para que «Mis regalos» lo recuerde
// después; no viaja al servidor.

export const CHANNELS = ['whatsapp', 'mail', 'copiar', 'mano'] as const;
export type Channel = (typeof CHANNELS)[number];
export type Part = 'link' | 'palabras';

const key = (giftId: string, part: Part) => `envio:${giftId}:${part}`;
const isChannel = (v: string | null): v is Channel => (CHANNELS as readonly string[]).includes(v ?? '');

export function readSent(giftId: string, part: Part): Channel | null {
  for (const store of [() => localStorage, () => sessionStorage]) {
    try {
      const v = store().getItem(key(giftId, part));
      if (isChannel(v)) return v;
    } catch {
      // Sin almacenamiento (modo privado): no hay nada que recordar.
    }
  }
  return null;
}

export function saveSent(giftId: string, part: Part, channel: Channel): void {
  try {
    localStorage.setItem(key(giftId, part), channel);
  } catch {
    // Sin almacenamiento: se recuerda solo mientras no se recargue la página.
  }
}
