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
  readonly motivos: readonly { ocasion: string; creados: number; usdPromedio: number | null; muestra: number; pagados: number; abiertos: number; satsRecibidos: string }[];
  readonly ocasionesLibres: Record<string, number>;
  readonly montosUsd: { rangos: Record<string, number>; promedio: number | null; mediana: number | null };
  readonly porEstilo: Record<string, number>;
  readonly porDiaSemana: Record<string, number>;
  readonly porHora: Record<string, number>;
  readonly tiempoHastaAbrir: { rangos: Record<string, number>; medianaHoras: number | null };
  readonly regalosPorCuenta: Record<string, number>;
  readonly tarjeta: { conMensaje: number; conRemitente: number; largoMensaje: number | null };
  readonly reclamos: { reclamados: number; recuperados: number; programadosEsperando: number };
}

/** Qué incluye un producto, en el admin: regalos null = libres; dias null = para siempre; cupo null = sin límite. */
export interface AdminProduct {
  readonly codigo: string;
  readonly precioSats: string;
  readonly activo: boolean;
  readonly plan: string | null;
  readonly regalos: number | null;
  readonly listas: number;
  readonly dias: number | null;
  readonly cupo: number | null;
}

/** Admin del cobro: la llave se ve solo por su huella y sus primeras direcciones. */
export interface AdminCobro {
  readonly cobroActivo: boolean;
  readonly llave: { readonly huella: string; readonly direcciones: readonly string[] } | null;
  readonly llaveNueva: { readonly huella: string; readonly vigenteDesde: string } | null;
  readonly fundadoresQuedan: number;
  readonly productos: ReadonlyArray<AdminProduct>;
  readonly pagos: ReadonlyArray<{ readonly id: string; readonly producto: string; readonly estado: string; readonly precioUsd: number; readonly sats: string; readonly satsRecibidos: string; readonly creado: string; readonly confirmado: string | null }>;
  readonly totales: { readonly confirmados: number; readonly usd: number; readonly sats: string };
  readonly registro: ReadonlyArray<{ readonly email: string; readonly accion: string; readonly detalle: string; readonly fecha: string }>;
}

/** Productos y precios públicos. */
export interface Products {
  readonly cobroActivo: boolean;
  readonly seVende: boolean;
  readonly fundadoresQuedan: number;
  readonly productos: ReadonlyArray<{
    readonly codigo: string;
    readonly precioSats: string;
    readonly regalos: number;
    readonly listasCumple: number;
    readonly listasOtras: number;
    readonly plan: 'anual' | 'fundador' | null;
    readonly regalosLibres: boolean;
    readonly dias: number | null;
    readonly cupo: number | null;
    readonly seVendeSuelto: boolean;
  }>;
}

/** Saldo de créditos de la cuenta («Mi plan»). */
export interface Credits {
  readonly cobroActivo: boolean;
  readonly puedeRegalar: boolean;
  /** Si tiene lo que traen los planes (lo gratis no). */
  readonly conPlan: boolean;
  readonly regalos: { readonly bienvenida: number; readonly pagos: number };
  readonly listas: { readonly cumple: number; readonly otras: number };
  readonly plan: { readonly tipo: 'anual' | 'fundador'; readonly hasta: string | null; readonly regalosQuedan: number | null; readonly listas: number } | null;
}

/** Un pago del costo por servicio. */
export interface Purchase {
  readonly id: string;
  readonly producto: string;
  /** Valor de referencia en dólares al crear el pago (0 si no había cotización). Se cobra en sats. */
  readonly precioUsd: number;
  readonly sats: string;
  readonly direccion: string;
  readonly estado: 'pendiente' | 'visto' | 'confirmado' | 'incompleto' | 'vencido' | 'devuelto';
  readonly satsRecibidos: string;
}

const post = <T>(path: string, body: unknown) => call<T>(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

export const api = {
  products: () => call<Products>('/api/productos'),
  credits: () => call<Credits>('/api/cuenta/creditos'),
  purchases: () =>
    call<{
      dias: number;
      compras: Array<{ id: string; producto: string; precioUsd: number; sats: string; fecha: string; arrepentimiento: { codigo: string; estado: 'pedido' | 'devuelto' } | null; noProcede: 'vencido' | 'usado' | null }>;
    }>('/api/cuenta/compras'),
  refund: (pago: string, direccion: string) => post<{ codigo: string }>('/api/cuenta/arrepentimiento', { pago, direccion }),
  adminRefunds: () => call<{ pedidos: Array<{ codigo: string; pago: string; producto: string; sats: string; direccion: string; estado: string; fecha: string }> }>('/api/admin/arrepentimientos'),
  adminRefunded: (codigo: string) => post<{ ok: true }>(`/api/admin/arrepentimiento/${encodeURIComponent(codigo)}/devuelto`, {}),
  /** Créditos de la cuenta si hay sesión; sin sesión, null (sin pedir algo que dé 401). */
  creditsIfSignedIn: async (): Promise<Credits | null> => ((await call<{ abierta: boolean }>('/api/cuenta/sesion')).abierta ? call<Credits>('/api/cuenta/creditos') : null),
  buy: (producto: string) => post<Purchase>('/api/cuenta/pagos', { producto }),
  purchase: (id: string) => call<Purchase>(`/api/cuenta/pagos/${encodeURIComponent(id)}`),
  adminCobro: () => call<AdminCobro>('/api/admin/cobro'),
  adminKeyPreview: (llave: string) => post<{ huella: string; direcciones: string[] }>('/api/admin/llave/vista', { llave }),
  adminSetKey: (llave: string) => post<{ huella: string; pendiente: boolean }>('/api/admin/llave', { llave }),
  adminSetCharging: (activo: boolean) => post<{ cobroActivo: boolean }>('/api/admin/cobro', { activo }),
  adminSetProduct: (p: Omit<AdminProduct, 'codigo' | 'precioSats' | 'activo' | 'plan'> & { producto: string }) => post<{ ok: true }>('/api/admin/producto', p),
  adminSetPrice: (producto: string, precioSats: number) => post<{ precioSats: string }>('/api/admin/precio', { producto, precioSats }),
  adminAdjust: (a: { email: string; unidad: string; cantidad: number; motivo: string }) => post<{ ok: true }>('/api/admin/ajuste', a),
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
