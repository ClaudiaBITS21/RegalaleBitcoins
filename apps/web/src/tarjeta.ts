import { decodeGiftFragment, openCard } from '@regalale/core';
import { useEffect, useState } from 'preact/hooks';
import type { GiftView } from './api.ts';

// La tarjeta cifrada con el link (Claudia, 08/11/2026; docs/derivacion.md, «Tarjeta»): el
// servidor manda para/de/mensaje vacíos y la tarjeta cifrada; el navegador la abre con la semilla
// del regalo (la del link, o la que quien regala vuelve a derivar desde su clave maestra).

/** La vista con para/de/mensaje abiertos. Sin tarjeta cifrada (regalos de antes), igual. */
export async function openGiftCard(view: GiftView, seed: Uint8Array): Promise<GiftView> {
  if (view.tarjeta == null) return view;
  const card = await openCard(seed, view.direccion, view.tarjeta);
  return { ...view, para: card.para, de: card.de, mensaje: card.mensaje };
}

/** La semilla del regalo desde su link completo (lo que va después del #). */
export function seedFromLink(link: string): Uint8Array | null {
  const hash = link.split('#')[1];
  if (hash === undefined) return null;
  try {
    return decodeGiftFragment(hash);
  } catch {
    return null;
  }
}

/**
 * La vista con la tarjeta abierta. Mientras se abre (o si no se puede), para/de/mensaje quedan
 * como vienen; los textos ya abiertos se conservan aunque la vista se actualice (estado, saldo).
 */
export function useOpenedView(view: GiftView | null, seed: Uint8Array | null): GiftView | null {
  const [card, setCard] = useState<{ key: string; para: string | null; de: string | null; mensaje: string } | null>(null);
  const key = view?.tarjeta ?? '';
  useEffect(() => {
    if (view === null || view.tarjeta == null || seed === null || card?.key === key) return;
    let alive = true;
    openGiftCard(view, seed)
      .then((v) => alive && setCard({ key, para: v.para, de: v.de, mensaje: v.mensaje }))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [key, seed]);
  if (view === null) return null;
  return card !== null && card.key === key ? { ...view, para: card.para, de: card.de, mensaje: card.mensaje } : view;
}
