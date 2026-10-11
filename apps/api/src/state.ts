import type { AddressStats } from './chain.ts';
import type { Gift } from './gifts.ts';

// Estado del regalo visto por el que recibe, calculado siempre del lado del servidor
// a partir de la cadena (nunca por aviso del navegador).

export type GiftState =
  | 'esperando' // creado, sin fondos
  | 'en_la_red' // pago visto en la mempool, sin confirmar
  | 'activo' // fondos confirmados: se puede reclamar
  | 'reclamo_programado' // barrido firmado, esperando que baje la comisión
  | 'reclamado' // barrido desde la plataforma por el que recibe
  | 'recuperado' // barrido desde la plataforma por el que regala
  | 'retirado'; // la dirección se vació sin pasar por la plataforma

export interface GiftFunds {
  readonly state: GiftState;
  readonly confirmedSats: bigint;
  readonly unconfirmedSats: bigint;
}

export function giftState(gift: Gift, stats: AddressStats, hasPending: boolean): GiftFunds {
  const confirmed = stats.confirmedFunded - stats.confirmedSpent;
  const unconfirmed = stats.mempoolFunded - stats.mempoolSpent;
  const funds = { confirmedSats: confirmed, unconfirmedSats: unconfirmed };
  if (gift.claimTxid !== null) return { state: gift.claimKind === 'recupero' ? 'recuperado' : 'reclamado', ...funds };
  if (hasPending) return { state: 'reclamo_programado', ...funds };
  if (stats.confirmedFunded === 0n && stats.mempoolFunded === 0n) return { state: 'esperando', ...funds };
  if (confirmed + unconfirmed <= 0n) return { state: 'retirado', ...funds };
  if (confirmed > 0n) return { state: 'activo', ...funds };
  return { state: 'en_la_red', ...funds };
}
