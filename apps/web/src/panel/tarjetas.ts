import { deriveGiftSecrets, masterRootFromMnemonic, openCard, sealCard } from '@regalale/core';
import type { CardText } from '@regalale/core';
import { type AccountGift, accountApi } from '../account.ts';

// La tarjeta de cada regalo cifrada con su link (Claudia, 08/11/2026; docs/derivacion.md, «Tarjeta»).
// En «Mis regalos», con la clave maestra abierta (passkey), el navegador vuelve a derivar la
// semilla de cada regalo y abre su tarjeta. Los regalos de antes, con el texto en claro, se cifran
// y se suben una vez: desde ahí el servidor ya no tiene el texto.

export type OpenedCards = Readonly<Record<string, CardText>>;

const seedOf = (master: string, g: AccountGift): Uint8Array | null =>
  g.indice === null ? null : deriveGiftSecrets(masterRootFromMnemonic(master), g.indice, g.idioma).entropy;

/** Abre las tarjetas cifradas que se puedan (las de los regalos de esta clave maestra). */
export async function openCards(gifts: readonly AccountGift[], master: string): Promise<OpenedCards> {
  const out: Record<string, CardText> = {};
  for (const g of gifts) {
    if (g.tarjeta == null || g.direccion === undefined) continue;
    const seed = seedOf(master, g);
    if (seed === null) continue;
    try {
      out[g.id] = await openCard(seed, g.direccion, g.tarjeta);
    } catch {
      // Una tarjeta que no abre con esta clave (otra clave maestra): queda sin nombre.
    }
  }
  return out;
}

/** Cifra y sube las tarjetas que todavía están en claro. Devuelve cuántas subió. */
export async function sealOldCards(gifts: readonly AccountGift[], master: string): Promise<number> {
  let n = 0;
  for (const g of gifts) {
    if (g.tarjeta != null || g.para === null || g.direccion === undefined) continue;
    const seed = seedOf(master, g);
    if (seed === null) continue;
    try {
      await accountApi.sealCard(g.id, await sealCard(seed, g.direccion, { para: g.para, de: g.de ?? null, mensaje: g.mensaje ?? '' }));
      n++;
    } catch {
      // Se reintenta la próxima vez que se abra el panel.
    }
  }
  return n;
}

/** La tarjeta de un regalo cifrada de nuevo (al editar el mensaje). */
export async function resealCard(g: AccountGift, master: string, card: CardText): Promise<string | null> {
  const seed = seedOf(master, g);
  return seed === null || g.direccion === undefined ? null : sealCard(seed, g.direccion, card);
}

/** El regalo con la tarjeta abierta, si se abrió. */
export const withCard = (g: AccountGift, cards: OpenedCards): AccountGift => {
  const c = cards[g.id];
  return c === undefined ? g : { ...g, para: c.para, de: c.de, mensaje: c.mensaje };
};
