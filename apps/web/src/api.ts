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
  /** Regalo multifirma (recupero avanzado): script de testigo en hex. null o ausente en los comunes. */
  readonly testigo?: string | null;
  readonly estado: GiftState;
  readonly sats: { readonly confirmados: string; readonly sinConfirmar: string; readonly esperados: string | null };
  readonly pagoTrabado: boolean;
  /** Si quien regala eligió mostrar cuánto vale en plata (sin el dato, API anterior: sí). Si no, original viene null. */
  readonly mostrarValor?: boolean;
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
  /** Imagen para compartir el link (JPEG en base64; give/vistaCompartir.ts). */
  readonly vista?: string;
  readonly moneda: 'USD' | 'ARS' | 'SAT';
  readonly monto: number;
  readonly sats: string;
  /** Si quien recibe ve cuánto vale en plata. */
  readonly mostrarValor?: boolean;
  /** Índice del regalo en la clave maestra: el servidor lo guarda solo si hay sesión. */
  readonly indice: number;
  /** Recupero avanzado: script de testigo (hex) y huella/ruta de la clave de la billetera. */
  readonly testigo?: string;
  readonly rutaRecupero?: string;
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
  /** Qué incluye lo gratis (API desde el 23/10). */
  readonly gratis?: FreeOffer;
  readonly productos: ReadonlyArray<AdminProduct>;
  readonly pagos: ReadonlyArray<{ readonly id: string; readonly producto: string; readonly estado: string; readonly precioUsd: number; readonly sats: string; readonly satsRecibidos: string; readonly creado: string; readonly confirmado: string | null }>;
  readonly totales: { readonly confirmados: number; readonly usd: number; readonly sats: string };
  readonly registro: ReadonlyArray<{ readonly email: string; readonly accion: string; readonly detalle: string; readonly fecha: string }>;
}

/** Lo gratis (la bienvenida): regalos, listas y qué servicios incluye. Lo cambia el admin. */
export interface FreeOffer {
  readonly regalos: number;
  readonly listas: number;
  readonly ia: boolean;
  readonly tarjeta: boolean;
  readonly saludo: boolean;
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
    /** Si trae la salutación automática (API desde el 21/10). */
    readonly saludo?: boolean;
    /** Imagen con IA y tarjeta imprimible (API desde el 23/10). */
    readonly ia?: boolean;
    readonly tarjeta?: boolean;
    readonly seVendeSuelto: boolean;
  }>;
}

/** Saldo de créditos de la cuenta («Mi plan»). */
export interface Credits {
  readonly cobroActivo: boolean;
  /** Los admins tienen todo activado y libre (API desde el 22/10). */
  readonly admin?: boolean;
  readonly puedeRegalar: boolean;
  /** Si tiene lo que traen los planes (lo gratis no). */
  readonly conPlan: boolean;
  /** Si tiene la salutación automática (Satoshi no la trae; API desde el 21/10). */
  readonly conSaludo?: boolean;
  /** Imagen con IA y tarjeta imprimible por separado (API desde el 23/10; antes, conPlan). */
  readonly conIa?: boolean;
  readonly conTarjeta?: boolean;
  readonly regalos: { readonly bienvenida: number; readonly pagos: number; readonly porOcasion?: Readonly<Record<string, number>> };
  readonly listas: { readonly cumple: number; readonly otras: number; readonly porOcasion?: Readonly<Record<string, number>> };
  readonly plan: { readonly tipo: 'anual' | 'fundador'; readonly hasta: string | null; readonly regalosQuedan: number | null; readonly listas: number } | null;
}

/** Una cuenta en la lista del admin. */
export interface AdminUser {
  readonly email: string;
  readonly alta: string;
  readonly passkey: boolean;
  readonly admin: boolean;
  /** Regalos y listas que armó. */
  readonly regalos: number;
  readonly listas: number;
  /** Compras confirmadas y si tiene un plan vigente. */
  readonly compras: number;
  readonly plan: boolean;
  /** Créditos que le quedan (sin contar el plan). */
  readonly saldoRegalos: number;
  readonly saldoListas: number;
}

/** Algo entregado a mano o con cupón (un movimiento de créditos). */
export interface AdminDelivery {
  readonly email: string;
  readonly tipo: string;
  readonly unidad: string;
  readonly cantidad: number;
  readonly origen: string;
  readonly motivo: string | null;
  readonly referencia: string | null;
  readonly ocasion: string | null;
  readonly fecha: string;
}

/** Qué tiene una cuenta, visto desde el admin. */
export interface AdminAccount extends Omit<Credits, 'puedeRegalar'> {
  readonly email: string;
  readonly admin: boolean;
  readonly movimientos: readonly { readonly tipo: string; readonly unidad: string; readonly cantidad: number; readonly origen: string; readonly motivo: string | null; readonly fecha: string }[];
}

/** Lo que da un cupón (y, con un producto, su precio con el descuento). */
export interface CouponView {
  readonly codigo: string;
  readonly descuento: number | null;
  readonly productos: readonly string[];
  readonly da: { readonly unidad: 'regalo' | 'lista_otras'; readonly cantidad: number; readonly ocasion: string | null } | null;
  readonly precioOriginal?: string;
  readonly precio?: string;
}

/** Un cupón en el admin, con sus usos. */
export interface AdminCoupon extends CouponView {
  /** El link corto: regalalebitcoin.com/c/<corto>. */
  readonly corto: string;
  /** Si ya se subió la imagen del cupón para la vista previa de su link. */
  readonly conVista: boolean;
  /** Cuándo se subió esa imagen (para rehacer las de un diseño viejo). */
  readonly vistaCreada?: string | null;
  /** Si tiene el logo de quien lo promueve. */
  readonly conLogo: boolean;
  readonly desde: string;
  /** Exclusivo: vence en ese instante. null = sin fecha de fin. */
  readonly hasta: string | null;
  readonly maxUsos: number;
  readonly activo: boolean;
  readonly nota: string;
  readonly creadoPor: string;
  readonly creado: string;
  readonly usados: number;
  readonly reservados: number;
  readonly satsResignados: string;
  readonly porProducto: Readonly<Record<string, number>>;
  /** Solo lo usa la cuenta con este mail; null = cualquiera. */
  readonly email: string | null;
}

/** Un lote de cupones de un solo uso, con las mismas condiciones. */
export interface AdminCouponBatch extends CouponView {
  readonly id: string;
  readonly nombre: string;
  readonly creadoPor: string;
  readonly creado: string;
  readonly total: number;
  readonly activos: number;
  readonly conMail: number;
  readonly usados: number;
  readonly desde: string | null;
  readonly hasta: string | null;
  readonly nota: string;
}

/** Condiciones de un cupón o de un lote. */
export interface CouponTerms {
  readonly descuento: number | null;
  readonly productos: string[];
  readonly da: { unidad: 'regalo' | 'lista_otras'; cantidad: number; ocasion: string | null } | null;
  readonly desde: string;
  readonly hasta: string;
  readonly nota: string;
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
  /** Con un cupón del 100 % no hay pago: vuelve { gratis: true }. */
  buy: (producto: string, cupon?: string) => post<Purchase | { gratis: true; producto: string }>('/api/cuenta/pagos', { producto, ...(cupon === undefined ? {} : { cupon }) }),
  couponPreview: (codigo: string, producto?: string) => post<CouponView>('/api/cuenta/cupon/ver', { codigo, ...(producto === undefined ? {} : { producto }) }),
  redeemCoupon: (codigo: string) => post<CouponView>('/api/cuenta/cupon', { codigo }),
  purchase: (id: string) => call<Purchase>(`/api/cuenta/pagos/${encodeURIComponent(id)}`),
  adminCobro: () => call<AdminCobro>('/api/admin/cobro'),
  adminCoupons: () => call<{ cupones: AdminCoupon[]; lotes: AdminCouponBatch[] }>('/api/admin/cupones'),
  adminCreateBatch: (b: CouponTerms & { nombre: string; prefijo: string } & ({ emails: string[] } | { cantidad: number })) =>
    post<{ lote: string; cupones: Array<{ codigo: string; email: string | null }> }>('/api/admin/cupones/lotes', b),
  adminBatch: (id: string) => call<{ nombre: string; cupones: Array<{ codigo: string; email: string | null; usado: boolean }> }>(`/api/admin/cupones/lotes/${encodeURIComponent(id)}`),
  adminBatchActive: (id: string, activo: boolean) => post<{ activo: boolean }>(`/api/admin/cupones/lotes/${encodeURIComponent(id)}/activo`, { activo }),
  invitation: (codigo: string) => call<CouponView & { desde: string; paraUnMail: boolean }>(`/api/invitacion/${encodeURIComponent(codigo)}`),
  shortCoupon: (corto: string) => call<CouponView & { corto: string; desde: string; hasta: string | null; paraUnMail: boolean; conLogo: boolean }>(`/api/c/${encodeURIComponent(corto)}`),
  /** Pone o cambia (PNG en base64) o saca (null) el logo de quien promueve el cupón. Pide passkey. */
  adminCouponLogo: (codigo: string, imagen: string | null) => post<null>(`/api/admin/cupones/${encodeURIComponent(codigo)}/logo`, { imagen }),
  adminCouponPreview: (codigo: string, imagen: string) => post<null>(`/api/admin/cupones/${encodeURIComponent(codigo)}/vista`, { imagen }),
  adminCreateCoupon: (c: {
    codigo: string;
    descuento: number | null;
    productos: string[];
    da: { unidad: 'regalo' | 'lista_otras'; cantidad: number; ocasion: string | null } | null;
    desde: string;
    hasta: string;
    maxUsos: number;
    nota: string;
    email?: string;
  }) => post<{ codigo: string }>('/api/admin/cupones', c),
  adminCouponUses: (codigo: string, maxUsos: number) => post<{ maxUsos: number }>(`/api/admin/cupones/${encodeURIComponent(codigo)}/usos`, { maxUsos }),
  adminCouponActive: (codigo: string, activo: boolean) => post<{ activo: boolean }>(`/api/admin/cupones/${encodeURIComponent(codigo)}/activo`, { activo }),
  adminReports: () =>
    call<{
      listas: Array<{
        id: string;
        titulo: string;
        ocasion: string;
        creada: string;
        estado: 'activa' | 'pausada' | 'en_revision' | 'baja';
        reactivada: string | null;
        dueno: string;
        denuncias: Array<{ email: string; motivo: string; creada: string }>;
      }>;
    }>('/api/admin/denuncias'),
  adminReportAction: (id: string, accion: 'reactivar' | 'baja') => post<{ estado: string }>(`/api/admin/denuncias/${encodeURIComponent(id)}`, { accion }),
  adminAdmins: () => call<{ fijos: string[]; agregados: Array<{ email: string; agregadoPor: string; creado: string }> }>('/api/admin/admins'),
  adminAddAdmin: (email: string) => post<{ email: string }>('/api/admin/admins', { email }),
  adminRemoveAdmin: (email: string) => post<{ ok: true }>('/api/admin/admins/quitar', { email }),
  adminKeyPreview: (llave: string) => post<{ huella: string; direcciones: string[] }>('/api/admin/llave/vista', { llave }),
  adminSetKey: (llave: string) => post<{ huella: string; pendiente: boolean }>('/api/admin/llave', { llave }),
  adminSetCharging: (activo: boolean) => post<{ cobroActivo: boolean }>('/api/admin/cobro', { activo }),
  adminSetProduct: (p: Omit<AdminProduct, 'codigo' | 'precioSats' | 'activo' | 'plan'> & { producto: string }) => post<{ ok: true }>('/api/admin/producto', p),
  adminSetPrice: (producto: string, precioSats: number) => post<{ precioSats: string }>('/api/admin/precio', { producto, precioSats }),
  adminAdjust: (a: { email: string; unidad: string; cantidad: number; motivo: string }) => post<{ ok: true; cuenta: AdminAccount }>('/api/admin/ajuste', a),
  adminFree: (g: FreeOffer) => post<{ gratis: FreeOffer; cuentas: number }>('/api/admin/gratis', g),
  adminUsers: (q = '') => call<{ total: number; usuarios: AdminUser[] }>(`/api/admin/usuarios?q=${encodeURIComponent(q)}`),
  adminDeliveries: () => call<{ entregas: AdminDelivery[] }>('/api/admin/entregas'),
  adminAccount: (email: string) => call<AdminAccount>(`/api/admin/cuenta?email=${encodeURIComponent(email)}`),
  adminSummary: (fresh = false) => call<AdminSummary>(`/api/admin/resumen${fresh ? '?fresco=1' : ''}`),
  gift: (id: string) => call<GiftView>(`/api/gifts/${encodeURIComponent(id)}`),
  utxos: async (id: string) => (await call<{ utxos: FundingUtxo[] }>(`/api/gifts/${encodeURIComponent(id)}/utxos`)).utxos,
  fees: () => call<FeeRates>('/api/fees'),
  health: () => call<{ ok: boolean; red: NetworkName; topeUsd: number; recuperoAvanzado?: boolean }>('/api/salud'),
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
