import type { FundingUtxo, Lang, NetworkName } from '@regalale/core';

// Cliente de la API propia (mismo origen). Nunca se manda la semilla ni las palabras:
// solo el id público del regalo y, al final, la transacción ya firmada.

export type GiftState = 'esperando' | 'en_la_red' | 'activo' | 'reclamo_programado' | 'reclamado' | 'recuperado' | 'retirado';

export interface GiftView {
  readonly id: string;
  readonly red: NetworkName;
  readonly idioma: Lang;
  readonly ocasion: string;
  readonly ocasionLibre: string | null;
  readonly para: string;
  readonly de: string | null;
  readonly mensaje: string;
  readonly imagen: number;
  /** Estilo de la tarjeta (ilustracion, mano, elegante, propia). Falta en regalos viejos. */
  readonly estilo?: string;
  readonly direccion: string;
  readonly estado: GiftState;
  readonly sats: { readonly confirmados: string; readonly sinConfirmar: string; readonly esperados: string | null };
  readonly pagoTrabado: boolean;
  readonly original: { readonly moneda: string | null; readonly monto: number; readonly usdPorBtc: number | null } | null;
  readonly usdPorBtcHoy: number | null;
  readonly reclamo: { readonly txid: string; readonly tipo: string } | null;
}

export interface FeeRates {
  readonly fastest: number;
  readonly halfHour: number;
  readonly hour: number;
  readonly economy: number;
  readonly minimum: number;
}

export interface NewGift {
  readonly direccion: string;
  readonly idioma: Lang;
  readonly ocasion: string;
  readonly ocasionLibre?: string;
  readonly para: string;
  readonly de: string;
  readonly mensaje: string;
  readonly imagen: number;
  readonly estilo?: string;
  /** Base64 de la imagen propia (solo con estilo 'propia'). */
  readonly imagenPropia?: string;
  readonly moneda: 'USD' | 'ARS' | 'SAT';
  readonly monto: number;
  readonly sats: string;
  /** Índice del regalo en la clave maestra: el servidor lo guarda solo si hay sesión. */
  readonly indice: number;
}

export class ApiFailure extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { ...init, credentials: 'same-origin', cache: 'no-store' });
  } catch {
    throw new ApiFailure(0, 'sin_conexion');
  }
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new ApiFailure(res.status, body.error ?? 'error');
  return body as T;
}

/** Resumen del panel de administración: solo números agregados. */
export interface AdminSummary {
  readonly red: string;
  readonly generado: string;
  readonly usuarios: { total: number; ultimos7: number; ultimos30: number; conBoveda: number; conRegalos: number };
  readonly regalos: { total: number; ultimos7: number; ultimos30: number; conCuenta: number; porEstado: Record<string, number>; muestra: number; parcial: boolean };
  readonly sats: { esperados: string; recibidos: string; enRegalos: string };
  readonly usdPorBtc: number | null;
  readonly porOcasion: Record<string, number>;
  readonly porIdioma: Record<string, number>;
  readonly porMoneda: Record<string, number>;
  readonly porDia: { creados: Record<string, number>; reclamados: Record<string, number> };
}

export const api = {
  adminSummary: (fresh = false) => call<AdminSummary>(`/api/admin/resumen${fresh ? '?fresco=1' : ''}`),
  gift: (id: string) => call<GiftView>(`/api/gifts/${encodeURIComponent(id)}`),
  utxos: async (id: string) => (await call<{ utxos: FundingUtxo[] }>(`/api/gifts/${encodeURIComponent(id)}/utxos`)).utxos,
  fees: () => call<FeeRates>('/api/fees'),
  health: () => call<{ ok: boolean; red: NetworkName; topeUsd: number }>('/api/salud'),
  price: () => call<{ usdPorBtc: number; fuenteUsd: string; arsPorBtc: number | null; fuenteArs: 'criptoya' | 'bitso' | null }>('/api/precio'),
  /** Registra un regalo antes de pagarlo. Solo datos públicos: nunca la semilla ni las palabras. */
  createGift: async (gift: NewGift) =>
    (
      await call<{ id: string }>('/api/gifts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(gift),
      })
    ).id,
  claim: (id: string, hex: string, modo: 'ahora' | 'esperar') =>
    call<{ txid: string; estado: GiftState }>(`/api/gifts/${encodeURIComponent(id)}/claim`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ hex, modo }),
    }),
};
