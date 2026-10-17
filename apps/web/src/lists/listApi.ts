import { ApiFailure } from '../api.ts';

// Listas de regalos: llamadas a la API. La llave pública (zpub/vpub) solo viaja al crear la
// lista y vuelve únicamente al panel de quien la armó.

async function call<T>(path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new ApiFailure(0, 'sin_conexion');
  }
  const json = (await res.json().catch(() => ({}))) as { error?: string; detalle?: string };
  if (!res.ok) throw new ApiFailure(res.status, json.detalle ?? json.error ?? 'error');
  return json as T;
}

export interface PublicList {
  readonly id: string;
  readonly red: string;
  readonly titulo: string;
  readonly ocasion: string;
  readonly ocasionLibre: string | null;
  readonly mensaje: string;
  readonly fecha: string | null;
  readonly idioma: string;
  readonly abierta: boolean;
  readonly topeUsd: number;
  /** Quien armó la lista acepta transferencias en pesos a su alias. */
  readonly aceptaPesos: boolean;
  /** Para quién es ({nombres} en los ejemplos) y si es de varias personas. */
  readonly para: string | null;
  readonly varios: boolean;
}

export interface Transfer {
  readonly codigo: string;
  readonly nombre: string | null;
  readonly mensaje: string;
  readonly montoArs: number;
  readonly estado: 'anunciada' | 'recibida' | 'convertida';
  readonly satsConvertidos: string | null;
  readonly creada: string;
}

export interface ListContribution {
  readonly indice: number;
  readonly direccion: string;
  readonly nombre: string | null;
  readonly mensaje: string;
  readonly satsDeclarados: string;
  readonly estado: 'esperando' | 'en_la_red' | 'recibido' | null;
  readonly recibidos: string | null;
  readonly creado: string;
}

export interface OwnedList extends PublicList {
  readonly xpub: string;
  readonly alias: string | null;
  readonly aliasTitular: string | null;
  readonly totalRecibido: string;
  readonly aportes: readonly ListContribution[];
  readonly transferencias: readonly Transfer[];
}

type ListRef = { id: string; titulo: string; ocasion: string; ocasionLibre: string | null; idioma: string };

export interface MyTransfer extends Transfer {
  readonly tipo: 'pesos';
  readonly lista: ListRef;
  readonly alias: string;
  readonly titular: string;
}

export type MyGift = MyContribution | MyTransfer;

export interface MyContribution {
  readonly tipo: 'bitcoin';
  readonly lista: ListRef;
  readonly direccion: string;
  readonly nombre: string | null;
  readonly mensaje: string;
  readonly satsDeclarados: string;
  readonly estado: 'esperando' | 'en_la_red' | 'recibido';
  readonly recibidos: string;
  readonly creado: string;
}

export interface NewList {
  readonly titulo: string;
  readonly ocasion: string;
  readonly ocasionLibre?: string;
  readonly mensaje: string;
  readonly fecha?: string;
  readonly idioma: string;
  readonly xpub: string;
  readonly primeraDireccion: string;
  readonly para: string;
  readonly varios: boolean;
  readonly alias?: string;
  readonly aliasTitular?: string;
  readonly convertir?: boolean;
}

export const listApi = {
  create: (l: NewList) => call<{ id: string }>('/api/listas', l),
  get: (id: string) => call<PublicList>(`/api/listas/${encodeURIComponent(id)}`),
  contribute: (id: string, a: { nombre?: string; mensaje?: string; moneda: string; monto: number; sats: string }) =>
    call<{ direccion: string; sats: string; token: string }>(`/api/listas/${encodeURIComponent(id)}/aportes`, a),
  turn: (id: string) => call<{ turno: number }>(`/api/listas/${encodeURIComponent(id)}/ejemplo`, {}),
  mine: (token: string) => call<MyGift>('/api/aportes/consulta', { token }),
  announce: (id: string, t: { nombre?: string; mensaje?: string; monto: number }) =>
    call<{ codigo: string; alias: string; titular: string; monto: number; token: string }>(`/api/listas/${encodeURIComponent(id)}/transferencias`, t),
  mark: (id: string, codigo: string, estado: 'recibida' | 'convertida', sats?: string) =>
    call<{ ok: boolean }>(`/api/cuenta/listas/${encodeURIComponent(id)}/transferencias/${encodeURIComponent(codigo)}`, { estado, ...(sats === undefined ? {} : { sats }) }),
  owned: () => call<{ listas: OwnedList[] }>('/api/cuenta/listas'),
  close: (id: string) => call<{ ok: boolean }>(`/api/cuenta/listas/${encodeURIComponent(id)}/cerrar`, {}),
};

/** Alias de Mercado Pago o banco (mismo formato que valida la API). */
export const ALIAS = /^[a-z0-9.-]{6,20}$/;

/** Link público de una lista y link privado de un aporte (el token va después del #). */
export const listUrl = (id: string) => `${window.location.origin}/l/${id}`;
export const contributionUrl = (token: string) => `${window.location.origin}/aporte#${token}`;
