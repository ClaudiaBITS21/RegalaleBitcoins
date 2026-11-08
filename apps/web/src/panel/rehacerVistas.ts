// Imagen para compartir el link de los regalos ya armados (Claudia, 04/11/2026): cuando cambia el
// diseño, «Mis regalos» la vuelve a dibujar en el navegador y la sube, para todos los regalos de
// la cuenta (también los ya abiertos o los que no se pudieron consultar en la cadena: el link se
// sigue compartiendo). Así el link de un regalo viejo también muestra la imagen nueva en WhatsApp.

import type { Lang } from '@regalale/core';
import type { AccountGift } from '../account.ts';
import { accountApi } from '../account.ts';
import type { CardStyle } from '../content/GiftCardArt.tsx';
import { DISENO_VISTA, sharePreview } from '../give/vistaCompartir.ts';

/** Los que ya se intentaron en esta visita: si falla, no se reintenta en cada recarga del panel. */
const intentados = new Set<string>();

/** Si la imagen del regalo es de un diseño anterior (o no tiene) y conviene rehacerla. */
export function needsNewPreview(g: AccountGift): boolean {
  if (g.vistaCreada === undefined) return false;
  return g.vistaCreada === null || Date.parse(g.vistaCreada) < Date.parse(DISENO_VISTA);
}

/** Rehace, de a uno, las imágenes viejas. Devuelve cuántas subió. */
export async function refreshPreviews(gifts: readonly AccountGift[]): Promise<number> {
  let n = 0;
  for (const g of gifts) {
    if (!needsNewPreview(g) || intentados.has(g.id)) continue;
    intentados.add(g.id);
    try {
      const vista = await sharePreview({
        lang: g.idioma as Lang,
        occasion: g.ocasion,
        occasionFree: g.ocasionLibre ?? '',
        style: g.estilo as CardStyle,
        ownImage: g.estilo === 'propia' ? `/api/gifts/${g.id}/imagen` : null,
        to: g.para ?? '',
      });
      if (vista === null) continue;
      await accountApi.updatePreview(g.id, vista, g.llave);
      n++;
    } catch {
      // Sin la imagen nueva el link sigue con la anterior: no es para molestar a nadie.
    }
  }
  return n;
}
