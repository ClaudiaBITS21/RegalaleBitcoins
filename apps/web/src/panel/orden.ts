// Orden y búsqueda de «Mis regalos» (Rodolfo, 21/10): por fecha (de lo último a lo primero, el
// orden por defecto), por apertura (los abiertos primero, del más reciente), por nombre o por
// motivo; la búsqueda es por nombre, sin importar mayúsculas ni tildes.

export type GiftOrder = 'fecha' | 'apertura' | 'nombre' | 'motivo';
export const GIFT_ORDERS: readonly GiftOrder[] = ['fecha', 'apertura', 'nombre', 'motivo'];

interface Sortable {
  readonly para: string;
  readonly creado: string;
  readonly abierto: string | null;
}

const plain = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();

export function filterGifts<T extends Sortable>(gifts: readonly T[], query: string): T[] {
  const q = plain(query);
  return q === '' ? [...gifts] : gifts.filter((g) => plain(g.para).includes(q));
}

export function sortGifts<T extends Sortable>(gifts: readonly T[], order: GiftOrder, motivo: (g: T) => string, lang: string): T[] {
  const byDate = (a: T, b: T) => b.creado.localeCompare(a.creado);
  const text = (x: string, y: string) => x.localeCompare(y, lang, { sensitivity: 'base' });
  const cmp: Record<GiftOrder, (a: T, b: T) => number> = {
    fecha: byDate,
    apertura: (a, b) => (a.abierto === null ? (b.abierto === null ? byDate(a, b) : 1) : b.abierto === null ? -1 : b.abierto.localeCompare(a.abierto)),
    nombre: (a, b) => text(a.para, b.para) || byDate(a, b),
    motivo: (a, b) => text(motivo(a), motivo(b)) || byDate(a, b),
  };
  return [...gifts].sort(cmp[order]);
}
