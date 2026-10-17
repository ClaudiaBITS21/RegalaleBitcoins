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
  readonly totalRecibido: string;
  readonly aportes: readonly ListContribution[];
}

export interface MyContribution {
  readonly lista: { id: string; titulo: string; ocasion: string; ocasionLibre: string | null; idioma: string };
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
}

export const listApi = {
  create: (l: NewList) => call<{ id: string }>('/api/listas', l),
  get: (id: string) => call<PublicList>(`/api/listas/${encodeURIComponent(id)}`),
  contribute: (id: string, a: { nombre?: string; mensaje?: string; moneda: string; monto: number; sats: string }) =>
    call<{ direccion: string; sats: string; token: string }>(`/api/listas/${encodeURIComponent(id)}/aportes`, a),
  mine: (token: string) => call<MyContribution>('/api/aportes/consulta', { token }),
  owned: () => call<{ listas: OwnedList[] }>('/api/cuenta/listas'),
  close: (id: string) => call<{ ok: boolean }>(`/api/cuenta/listas/${encodeURIComponent(id)}/cerrar`, {}),
};

/** Link público de una lista y link privado de un aporte (el token va después del #). */
export const listUrl = (id: string) => `${window.location.origin}/l/${id}`;
export const contributionUrl = (token: string) => `${window.location.origin}/aporte#${token}`;
