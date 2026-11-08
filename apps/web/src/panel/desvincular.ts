import { giftEditKey, type GiftListEntry, openGiftList, sealGiftList } from '@regalale/core';
import { type AccountGift, accountApi } from '../account.ts';

// Regalos desvinculados de la cuenta (etapa D de privacidad, Claudia, 08/11/2026; docs/derivacion.md,
// «Lista de regalos»). Con la clave maestra abierta, el panel:
//   1. abre la lista cifrada de la cuenta y pide el estado de esos regalos por id, sin cookies;
//   2. agrega a la lista los regalos que siguen en la cuenta y ya resolvieron su crédito, la guarda
//      y recién después le pide al servidor que los desvincule (así nunca se pierde uno);
//   3. avisa cuántos quedan sin abrir (para el aviso genérico por mail, sin decir cuáles);
//   4. pide la devolución del crédito de los recuperados sin abrir.
// Sin la clave maestra se ven solo los regalos que todavía están en la cuenta.

const LANGS = new Set(['es', 'pt', 'en', 'it']);
const OPEN_STATES = new Set(['reclamado', 'recuperado']);

/** Un regalo cuenta como pendiente mientras no se abrió ni se recuperó (y no se descartó sin pago). */
export const isPending = (g: AccountGift): boolean => g.estado !== null && !OPEN_STATES.has(g.estado) && g.sats !== null && g.sats !== '0';

async function keyOf(master: string, g: AccountGift): Promise<string | null> {
  return g.direccion === undefined ? null : giftEditKey(master, g.direccion);
}

const REFUNDED = 'regalale.devueltos';
function refundedIds(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(REFUNDED) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}
function markRefunded(ids: Set<string>): void {
  try {
    localStorage.setItem(REFUNDED, JSON.stringify([...ids]));
  } catch {
    // Sin almacenamiento se vuelve a pedir: el servidor no devuelve dos veces.
  }
}

/**
 * Todos los regalos de la cuenta (los vinculados y los de la lista cifrada), con la llave de cada
 * desvinculado para poder editarlo. Desvincula los que ya se pueden.
 */
export async function syncGiftList(view: { readonly lista?: string | null; readonly regalos: readonly AccountGift[] }, master: string): Promise<AccountGift[]> {
  let entries: GiftListEntry[] = [];
  if (view.lista != null) {
    try {
      entries = await openGiftList(master, view.lista);
    } catch {
      // Lista de otra clave maestra (no debería pasar): se trabaja solo con lo vinculado.
      return [...view.regalos];
    }
  }
  const linkedIds = new Set(view.regalos.map((g) => g.id));
  const unlinkedEntries = entries.filter((e) => !linkedIds.has(e.id));
  const unlinked: AccountGift[] = [];
  for (let i = 0; i < unlinkedEntries.length; i += 300) {
    const chunk = unlinkedEntries.slice(i, i + 300);
    const { regalos } = await accountApi.giftStatus(chunk.map((e) => e.id));
    for (const g of regalos) {
      const entry = chunk.find((e) => e.id === g.id);
      if (entry === undefined) continue;
      const llave = await keyOf(master, g);
      unlinked.push({ ...g, indice: entry.i, ...(llave === null ? {} : { llave }) });
    }
  }

  // Los que ya se pueden desvincular: crédito resuelto y tarjeta cifrada.
  const ready = view.regalos.filter((g) => g.resuelto === true && g.para === null && g.tarjeta != null && g.indice !== null && LANGS.has(g.idioma));
  let still = [...view.regalos];
  if (ready.length > 0) {
    const known = new Set(entries.map((e) => e.id));
    const next = [...entries, ...ready.filter((g) => !known.has(g.id)).map((g) => ({ i: g.indice as number, id: g.id, l: g.idioma }))];
    try {
      // Primero la lista (si esto falla, no se desvincula nada).
      await accountApi.saveList(await sealGiftList(master, next));
      const items: { id: string; llave: string }[] = [];
      for (const g of ready) {
        const llave = await keyOf(master, g);
        if (llave !== null) items.push({ id: g.id, llave });
      }
      const { desvinculados } = await accountApi.unlink(items);
      const done = new Set(desvinculados);
      const keys = new Map(items.map((it) => [it.id, it.llave]));
      still = view.regalos.map((g) => (done.has(g.id) ? { ...g, llave: keys.get(g.id) as string } : g));
    } catch {
      // Se reintenta la próxima vez que se abra el panel.
    }
  }

  const all = [...still, ...unlinked];
  // Devolución del crédito de los recuperados sin abrir (desvinculados), una vez.
  const refunded = refundedIds();
  for (const g of unlinked) {
    if (g.estado !== 'recuperado' || g.llave === undefined || refunded.has(g.id)) continue;
    try {
      await accountApi.refundGift(g.id, g.llave);
      refunded.add(g.id);
    } catch {
      // Se reintenta otra vez.
    }
  }
  markRefunded(refunded);
  void accountApi.reportPending(all.filter(isPending).length).catch(() => undefined);
  return all;
}

