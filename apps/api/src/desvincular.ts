// Regalos desvinculados de la cuenta (etapa D de privacidad, Claudia, 08/11/2026; docs/derivacion.md,
// «Lista de regalos»). La cuenta guarda su lista de regalos cifrada con la clave maestra. Cuando
// el crédito de un regalo ya se resolvió, el navegador lo desvincula: la base deja de saber de qué
// cuenta es y queda solo el SHA-256 de su llave de edición. El consumo del crédito y la fila del
// tope diario pasan a una referencia que sale de la llave (sin ella no se pueden unir con el regalo).

import { createHash } from 'node:crypto';
import type { AccountGift } from './accounts.ts';
import type { ChainClient } from './chain.ts';
import type { Sql } from './db.ts';
import { giftState } from './state.ts';

export const EDIT_KEY = /^[0-9a-f]{64}$/;

const sha256hex = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');

/** Lo que guarda el regalo: SHA-256 de la llave (igual que `editKeyHash` del núcleo). */
export const editKeyHash = (key: string): string => sha256hex(key);

/** Referencia del consumo o del tope de un regalo desvinculado: no se une con el regalo sin la llave. */
export const unlinkedRef = (key: string, purpose: 'movimiento' | 'tope'): string => `d:${sha256hex(`regalalebitcoins/${purpose}/v1:${key}`)}`;

export function editKeyFrom(body: unknown): string | null {
  const k = (body as { llave?: unknown } | null)?.llave;
  return typeof k === 'string' && EDIT_KEY.test(k) ? k : null;
}

/**
 * Si el regalo es de quien pide: con sesión, si sigue vinculado a su cuenta; o, con la llave de
 * edición, si coincide con la del regalo (sin sesión: el navegador la manda sin cookies).
 */
export async function ownsGift(sql: Sql, accountId: string | null, id: string, key: string | null): Promise<boolean> {
  const [g] = await sql<{ usuario_id: string | null; llave_edicion: string | null }[]>`select usuario_id, llave_edicion from regalos where id = ${id}`;
  if (g === undefined) return false;
  if (accountId !== null && g.usuario_id === accountId) return true;
  return key !== null && g.llave_edicion !== null && g.llave_edicion === editKeyHash(key);
}

/** Lo que muestra «Mis regalos» de cada regalo, con su estado en la cadena. */
export async function panelGifts(chain: ChainClient, gifts: readonly AccountGift[]): Promise<Record<string, unknown>[]> {
  const states = await Promise.all(
    gifts.map(async (g) => {
      try {
        const stats = await chain.addressStats(g.address);
        return giftState({ claimTxid: g.claimTxid, claimKind: g.claimKind } as Parameters<typeof giftState>[0], stats, false);
      } catch {
        return null;
      }
    }),
  );
  // Los descartados no se muestran, salvo que igual les haya llegado un pago (o no se sepa).
  const received = (i: number): bigint | null => (states[i] == null ? null : states[i].confirmedSats + states[i].unconfirmedSats);
  return gifts
    .map((g, i) => ({ g, i }))
    .filter(({ g, i }) => g.discardedAt === null || received(i) !== 0n)
    .map(({ g, i }) => ({
      id: g.id,
      indice: g.index,
      idioma: g.lang,
      ocasion: g.occasion,
      ocasionLibre: g.occasionFree,
      para: g.to,
      de: g.from,
      tarjeta: g.card,
      // Para comprobar en el navegador que unas 12 palabras son las de esta cuenta.
      direccion: g.address,
      satsEsperados: g.satsExpected,
      // Regalo con recupero avanzado: con qué billetera se armó (huella y ruta).
      rutaRecupero: g.recoveryPath,
      creado: g.createdAt.toISOString(),
      estilo: g.style,
      abierto: g.claimedAt?.toISOString() ?? null,
      original: g.currency === null || g.amount === null ? null : { moneda: g.currency, monto: g.amount, usdPorBtc: g.usdPerBtc },
      estado: states[i]?.state ?? null,
      sats: received(i)?.toString() ?? null,
      mensaje: g.message,
      mostrarValor: g.showValue,
      vistaCreada: g.previewAt?.toISOString() ?? null,
      // Etapa D: si ya se puede desvincular (crédito resuelto) y si tiene llave de edición.
      resuelto: g.creditResolved,
      conLlave: g.hasEditKey,
    }));
}

/**
 * Desvincula los regalos de la cuenta. Solo los suyos, con el crédito resuelto (o descartados, o
 * de hace más de 90 días: la tarea de créditos ya no los mira) y la tarjeta cifrada. Las horas del
 * crédito y del consumo se redondean al día para que no se puedan aparear por la hora.
 */
export async function unlinkGifts(sql: Sql, accountId: string, items: readonly { id: string; key: string }[]): Promise<string[]> {
  const done: string[] = [];
  for (const { id, key } of items) {
    const ok = await sql.begin(async (tx) => {
      const [g] = await tx<{ id: string }[]>`
        update regalos set usuario_id = null, indice = null, llave_edicion = ${editKeyHash(key)},
          credito = date_trunc('day', credito)
        where id = ${id} and usuario_id = ${accountId} and para is null and de is null and mensaje = ''
          and (llave_edicion is null or llave_edicion = ${editKeyHash(key)})
          and (credito is not null or descartado is not null or creado < now() - interval '90 days')
        returning id`;
      if (g === undefined) return false;
      await tx`
        update movimientos set referencia = ${unlinkedRef(key, 'movimiento')}, creado = date_trunc('day', creado)
        where usuario_id = ${accountId} and referencia = ${id} and tipo in ('consumo', 'devolucion')`;
      await tx`update topes_diarios set ref = ${unlinkedRef(key, 'tope')} where usuario_id = ${accountId} and ref = ${id}`;
      return true;
    });
    if (ok) done.push(id);
  }
  return done;
}

/** Devuelve el crédito de un regalo desvinculado que se recuperó sin abrir. true si devolvió algo. */
export async function refundUnlinked(sql: Sql, accountId: string, id: string, key: string): Promise<boolean> {
  const [g] = await sql<{ id: string }[]>`
    select id from regalos where id = ${id} and llave_edicion = ${editKeyHash(key)} and reclamo_tipo = 'recupero'`;
  if (g === undefined) return false;
  const rows = await sql`
    insert into movimientos (usuario_id, tipo, unidad, cantidad, origen, referencia, ocasion, creado)
    select m.usuario_id, 'devolucion', m.unidad, -m.cantidad, m.origen, m.referencia, m.ocasion, date_trunc('day', now())
    from movimientos m
    where m.usuario_id = ${accountId} and m.referencia = ${unlinkedRef(key, 'movimiento')} and m.tipo = 'consumo' and m.cantidad < 0
    on conflict do nothing
    returning id`;
  return rows.length > 0;
}
