import { isLang, type Lang, type NetworkName } from '@regalale/core';
import type { Sql } from './db.ts';

export type ClaimKind = 'reclamo' | 'recupero';

/** Estilo de la tarjeta: los dibujos de la web, una foto del banco o una imagen propia. */
export const CARD_STYLES = ['ilustracion', 'mano', 'elegante', 'realista', 'propia'] as const;
export type CardStyle = (typeof CARD_STYLES)[number];

/** Imagen propia de la tarjeta, ya achicada y sin metadatos en el navegador. */
export interface OwnImage {
  readonly type: 'image/webp' | 'image/jpeg' | 'image/png';
  readonly data: Uint8Array;
}

export interface Gift {
  readonly id: string;
  readonly network: NetworkName;
  readonly address: string;
  readonly lang: Lang;
  readonly occasion: string;
  /** Texto de la ocasión libre (ocasión "otra"). */
  readonly occasionFree: string | null;
  readonly to: string;
  readonly from: string | null;
  readonly message: string;
  readonly image: number;
  readonly style: CardStyle;
  readonly currency: string | null;
  readonly amount: number | null;
  readonly usdPerBtc: number | null;
  /** Lo que el que regala eligió regalar, en sats (null en regalos anteriores a la etapa 4). */
  readonly satsExpected: bigint | null;
  readonly createdAt: Date;
  readonly claimTxid: string | null;
  readonly claimKind: ClaimKind | null;
  readonly claimedAt: Date | null;
}

export interface NewGift {
  readonly network: NetworkName;
  readonly address: string;
  readonly lang: Lang;
  readonly occasion: string;
  readonly occasionFree?: string | null;
  readonly to: string;
  readonly from?: string | null;
  readonly message?: string;
  readonly image?: number;
  readonly style?: CardStyle;
  /** Solo con style 'propia'. */
  readonly ownImage?: OwnImage | null;
  readonly currency?: string | null;
  readonly amount?: number | null;
  readonly usdPerBtc?: number | null;
  readonly satsExpected?: bigint | null;
  /** Cuenta de quien regala e índice del regalo en su clave maestra. */
  readonly accountId?: string | null;
  readonly index?: number | null;
}

export const GIFT_ID = /^[A-Za-z0-9_-]{22}$/;

/** 128 bits aleatorios en base64url: el id público del regalo (/r/<id>). */
export function newGiftId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Buffer.from(bytes).toString('base64url');
}

interface Row {
  id: string;
  red: NetworkName;
  direccion: string;
  idioma: string;
  ocasion: string;
  ocasion_libre: string | null;
  para: string;
  de: string | null;
  mensaje: string;
  imagen: number;
  estilo: CardStyle;
  moneda: string | null;
  monto: string | null;
  usd_por_btc: string | null;
  sats_esperados: string | null;
  creado: Date;
  reclamo_txid: string | null;
  reclamo_tipo: ClaimKind | null;
  reclamado: Date | null;
}

function fromRow(r: Row): Gift {
  if (!isLang(r.idioma)) throw new Error(`Idioma inválido en la base: ${r.idioma}`);
  return {
    id: r.id,
    network: r.red,
    address: r.direccion,
    lang: r.idioma,
    occasion: r.ocasion,
    occasionFree: r.ocasion_libre,
    to: r.para,
    from: r.de,
    message: r.mensaje,
    image: r.imagen,
    style: r.estilo,
    currency: r.moneda,
    amount: r.monto === null ? null : Number(r.monto),
    usdPerBtc: r.usd_por_btc === null ? null : Number(r.usd_por_btc),
    satsExpected: r.sats_esperados === null ? null : BigInt(r.sats_esperados),
    createdAt: r.creado,
    claimTxid: r.reclamo_txid,
    claimKind: r.reclamo_tipo,
    claimedAt: r.reclamado,
  };
}

export async function insertGift(sql: Sql, g: NewGift): Promise<Gift> {
  const style = g.style ?? 'ilustracion';
  if ((style === 'propia') !== (g.ownImage != null)) throw new Error('La imagen propia va solo con el estilo "propia".');
  return sql.begin(async (tx) => {
    const [row] = await tx<Row[]>`
      insert into regalos (id, red, direccion, idioma, ocasion, ocasion_libre, para, de, mensaje, imagen, estilo, moneda, monto, usd_por_btc, sats_esperados, usuario_id, indice)
      values (${newGiftId()}, ${g.network}, ${g.address}, ${g.lang}, ${g.occasion}, ${g.occasionFree ?? null}, ${g.to}, ${g.from ?? null},
              ${g.message ?? ''}, ${g.image ?? 1}, ${style}, ${g.currency ?? null}, ${g.amount ?? null}, ${g.usdPerBtc ?? null},
              ${g.satsExpected === undefined || g.satsExpected === null ? null : g.satsExpected.toString()},
              ${g.accountId ?? null}, ${g.accountId ? (g.index ?? null) : null})
      returning *`;
    const gift = fromRow(row as Row);
    if (g.ownImage != null) {
      await tx`insert into imagenes (regalo_id, tipo, datos) values (${gift.id}, ${g.ownImage.type}, ${Buffer.from(g.ownImage.data)})`;
    }
    return gift;
  }) as Promise<Gift>;
}

export async function findOwnImage(sql: Sql, id: string): Promise<OwnImage | null> {
  if (!GIFT_ID.test(id)) return null;
  const [r] = await sql<{ tipo: OwnImage['type']; datos: Buffer }[]>`select tipo, datos from imagenes where regalo_id = ${id}`;
  return r === undefined ? null : { type: r.tipo, data: new Uint8Array(r.datos) };
}

/** true si el error es por una dirección ya registrada (otro regalo con el mismo índice). */
export function isDuplicateAddress(error: unknown): boolean {
  const e = error as { code?: unknown; constraint_name?: unknown };
  return e.code === '23505' && e.constraint_name === 'regalos_direccion_key';
}

export async function findGift(sql: Sql, id: string): Promise<Gift | null> {
  if (!GIFT_ID.test(id)) return null;
  const [row] = await sql<Row[]>`select * from regalos where id = ${id}`;
  return row === undefined ? null : fromRow(row);
}

/** Marca el regalo como reclamado o recuperado. false si ya tenía otro reclamo. */
export async function recordClaim(sql: Sql, id: string, claim: { txid: string; kind: ClaimKind; destination: string }): Promise<boolean> {
  const rows = await sql`
    update regalos set reclamo_txid = ${claim.txid}, reclamo_tipo = ${claim.kind}, reclamo_destino = ${claim.destination}, reclamado = now()
    where id = ${id} and (reclamo_txid is null or reclamo_txid = ${claim.txid})
    returning id`;
  return rows.length === 1;
}

/** Libera un reclamo cuya transacción desapareció de la red (expulsada de la mempool). */
export async function clearClaim(sql: Sql, id: string, txid: string): Promise<void> {
  await sql`
    update regalos set reclamo_txid = null, reclamo_tipo = null, reclamo_destino = null, reclamado = null
    where id = ${id} and reclamo_txid = ${txid}`;
}

export interface PendingBroadcast {
  readonly id: number;
  readonly giftId: string;
  readonly txid: string;
  readonly hex: string;
  readonly satVb: number;
}

export async function schedulePending(sql: Sql, p: Omit<PendingBroadcast, 'id'>): Promise<void> {
  await sql`
    insert into difusiones (regalo_id, txid, hex, sat_vb) values (${p.giftId}, ${p.txid}, ${p.hex}, ${p.satVb})
    on conflict (txid) do nothing`;
}

export async function pendingFor(sql: Sql, giftId: string): Promise<PendingBroadcast | null> {
  const [r] = await sql<{ id: string; regalo_id: string; txid: string; hex: string; sat_vb: string }[]>`
    select id, regalo_id, txid, hex, sat_vb from difusiones where regalo_id = ${giftId} and estado = 'esperando' order by id desc limit 1`;
  return r === undefined ? null : { id: Number(r.id), giftId: r.regalo_id, txid: r.txid, hex: r.hex, satVb: Number(r.sat_vb) };
}

export async function allPending(sql: Sql): Promise<PendingBroadcast[]> {
  const rows = await sql<{ id: string; regalo_id: string; txid: string; hex: string; sat_vb: string }[]>`
    select id, regalo_id, txid, hex, sat_vb from difusiones where estado = 'esperando' order by id`;
  return rows.map((r) => ({ id: Number(r.id), giftId: r.regalo_id, txid: r.txid, hex: r.hex, satVb: Number(r.sat_vb) }));
}

export async function markPending(sql: Sql, id: number, estado: 'difundida' | 'cancelada'): Promise<void> {
  await sql`update difusiones set estado = ${estado}, difundida = case when ${estado} = 'difundida' then now() else null end where id = ${id}`;
}
