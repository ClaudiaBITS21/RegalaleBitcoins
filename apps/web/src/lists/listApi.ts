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
  /** Tope por aporte en dólares; null en listas con billetera propia (sin tope). */
  readonly topeUsd: number | null;
  /** Quien armó la lista acepta transferencias a su cuenta (el dato va cifrado; la clave, en el link). */
  readonly aceptaTransferencias: boolean;
  /** Denuncias: fuera de «activa» no muestra datos para aportar. */
  readonly estado: 'activa' | 'pausada' | 'en_revision' | 'baja';
  readonly pais: string | null;
  /** Moneda de las transferencias (ISO 4217). */
  readonly moneda: string | null;
  /** Para quién es ({nombres} en los ejemplos) y si es de varias personas. */
  readonly para: string | null;
  readonly varios: boolean;
}

export interface Transfer {
  readonly codigo: string;
  readonly nombre: string | null;
  readonly mensaje: string;
  /** En la unidad menor de la moneda de la lista. */
  readonly monto: string;
  readonly estado: 'anunciada' | 'recibida' | 'convertida' | 'no_llego';
  readonly satsConvertidos: string | null;
  /** La compra de la que salió (total y cuántas transferencias entraron). */
  readonly tanda: { readonly sats: string; readonly aportes: number } | null;
  readonly creada: string;
  /** Panel del dueño (API desde el 24/10): «No me llegó», volver a avisar y compras corregidas. */
  readonly noLlego?: string | null;
  readonly avisosQuedan?: number;
  readonly nota?: string | null;
  readonly compra?: { readonly id: string; readonly corregida: string | null } | null;
}

/** Una compra en tanda, como registro propio con su historial. */
export interface Purchase {
  readonly id: string;
  readonly sats: string;
  readonly creada: string;
  readonly corregida: string | null;
  readonly transferencias: readonly string[];
  readonly historial: ReadonlyArray<{ readonly accion: 'creada' | 'corregida' | 'deshecha'; readonly satsAntes: string | null; readonly sats: string | null; readonly fecha: string }>;
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
  /** Dato de cobro cifrado y la clave de la lista envuelta con la clave maestra (si hay bóveda). */
  readonly cobro: string | null;
  readonly claveCifrada: string | null;
  /** Listas viejas: alias en claro hasta que se vuelva a cargar. */
  readonly alias: string | null;
  readonly aliasTitular: string | null;
  readonly totalRecibido: string;
  readonly puedeReactivar: boolean;
  readonly denuncias: ReadonlyArray<{ readonly motivo: string; readonly creada: string }>;
  readonly aportes: readonly ListContribution[];
  readonly transferencias: readonly Transfer[];
  /** Totales separados: nunca un número que mezcle la cadena con lo que declara el dueño. */
  readonly totales?: { readonly bitcoin: string; readonly satsComprados: string; readonly anunciado: string; readonly sinConvertir: string };
  readonly compras?: readonly Purchase[];
}

type ListRef = { id: string; titulo: string; ocasion: string; ocasionLibre: string | null; idioma: string };

export interface MyTransfer extends Transfer {
  readonly tipo: 'transferencia';
  readonly lista: ListRef;
  readonly moneda: string;
  readonly cobro: string | null;
  readonly alias: string | null;
  readonly titular: string | null;
  /** La lista está pausada por una denuncia: el dato de cobro no se muestra. */
  readonly listaPausada: boolean;
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
  /** Armada con "Semilla nueva" (lleva el tope de los regalos). */
  readonly semilla: boolean;
  /** Transferencias: país (y moneda en «Otro»); el dato cifrado se carga después con setCobro. */
  readonly pais?: string;
  readonly moneda?: string;
  readonly convertir?: boolean;
}

export interface Announced {
  readonly codigo: string;
  readonly monto: string;
  readonly moneda: string;
  readonly token: string;
  readonly cobro: string | null;
  readonly alias: string | null;
  readonly titular: string | null;
}

export const listApi = {
  create: (l: NewList) => call<{ id: string }>('/api/listas', l),
  get: (id: string) => call<PublicList>(`/api/listas/${encodeURIComponent(id)}`),
  contribute: (id: string, a: { nombre?: string; mensaje?: string; moneda: string; monto: number; sats: string }) =>
    call<{ direccion: string; sats: string; token: string }>(`/api/listas/${encodeURIComponent(id)}/aportes`, a),
  turn: (id: string) => call<{ turno: number }>(`/api/listas/${encodeURIComponent(id)}/ejemplo`, {}),
  mine: (token: string) => call<MyGift>('/api/aportes/consulta', { token }),
  announce: (id: string, t: { nombre?: string; mensaje?: string; monto: string }) => call<Announced>(`/api/listas/${encodeURIComponent(id)}/transferencias`, t),
  setCobro: (id: string, c: { pais: string; moneda: string; cobro: string; clave: string | null }) => call<{ ok: boolean }>(`/api/cuenta/listas/${encodeURIComponent(id)}/cobro`, c),
  mark: (id: string, codigo: string, estado: 'recibida' | 'no_llego') =>
    call<{ ok: boolean }>(`/api/cuenta/listas/${encodeURIComponent(id)}/transferencias/${encodeURIComponent(codigo)}`, { estado }),
  tanda: (id: string, codigos: readonly string[], sats: string) => call<{ ok: boolean }>(`/api/cuenta/listas/${encodeURIComponent(id)}/tanda`, { codigos, sats }),
  owned: () => call<{ listas: OwnedList[] }>('/api/cuenta/listas'),
  fixPurchase: (id: string, compra: string, sats: string) => call<{ ok: boolean }>(`/api/cuenta/listas/${encodeURIComponent(id)}/compras/${encodeURIComponent(compra)}/corregir`, { sats }),
  undoPurchase: (id: string, compra: string) => call<{ ok: boolean }>(`/api/cuenta/listas/${encodeURIComponent(id)}/compras/${encodeURIComponent(compra)}/deshacer`, {}),
  /** El invitado vuelve a avisar una transferencia que el dueño no encontró. */
  remind: (token: string, nota: string) => call<{ ok: boolean }>('/api/aportes/reaviso', { token, nota }),
  report: (id: string, r: { email: string; motivo: string }) => call<{ estado: string }>(`/api/listas/${encodeURIComponent(id)}/denuncias`, r),
  reactivate: (id: string) => call<{ estado: string }>(`/api/cuenta/listas/${encodeURIComponent(id)}/reactivar`, {}),
  close: (id: string) => call<{ ok: boolean }>(`/api/cuenta/listas/${encodeURIComponent(id)}/cerrar`, {}),
};

/**
 * Link público de una lista (con la clave del dato de cobro después del #, si acepta
 * transferencias) y link privado de un aporte (el token y, si hay, la clave, después del #).
 */
export const listUrl = (id: string, key?: string | null) => `${window.location.origin}/l/${id}${key ? `#${key}` : ''}`;
export const contributionUrl = (token: string, key?: string | null) => `${window.location.origin}/aporte#${token}${key ? `.${key}` : ''}`;
