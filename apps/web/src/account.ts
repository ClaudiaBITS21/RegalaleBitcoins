import { CoreError, deriveGift, generateMasterMnemonic, isValidMasterMnemonic, masterRootFromMnemonic, type Network, normalizeMnemonic, openVault, sealVault } from '@regalale/core';
import { ApiFailure } from './api.ts';
import type { Key } from './i18n/index.ts';
import { setSignedIn } from './sesion.ts';
import { createPasskey, PasskeyError, signalUnknownPasskey, unlockWithPasskey } from './passkey.ts';

// Cuenta de quien regala: crear el acceso (passkey + bóveda) y entrar. La clave maestra
// se arma y se abre acá, en el navegador; al servidor llega solo la bóveda cifrada.

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
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new ApiFailure(res.status, json.error ?? 'error');
  return json as T;
}

export interface AccountGift {
  readonly id: string;
  readonly indice: number | null;
  readonly idioma: 'es' | 'pt' | 'en' | 'it';
  readonly ocasion: string;
  readonly ocasionLibre: string | null;
  readonly para: string;
  readonly satsEsperados: string | null;
  /** Dirección del regalo: sirve para comprobar en el navegador unas 12 palabras. */
  readonly direccion?: string;
  readonly creado: string;
  readonly estilo: string;
  /** Cuándo se abrió (reclamó o recuperó); null si todavía no. */
  readonly abierto: string | null;
  /** Lo que se puso al armarlo (moneda, monto y cotización del dólar ese día). */
  readonly original?: { readonly moneda: string; readonly monto: number; readonly usdPorBtc: number | null } | null;
  readonly estado: string | null;
  readonly sats: string | null;
  /** Recupero avanzado: huella y ruta de la clave de la billetera con que se armó. */
  readonly rutaRecupero?: string | null;
}

export interface AccountView {
  readonly email: string;
  readonly credenciales: ReadonlyArray<{ id: string; prf: boolean }>;
  readonly proximoIndice: number;
  readonly regalos: readonly AccountGift[];
  /** Cotización de hoy (null si no respondió). */
  readonly cotizacion?: { readonly usdPorBtc: number | null; readonly arsPorBtc: number | null };
}

export const accountApi = {
  me: () => call<AccountView>('/api/cuenta'),
  logout: async () => {
    const res = await call<{ ok: boolean }>('/api/cuenta/salir', {});
    setSignedIn(false);
    return res;
  },
  sendLink: (email: string) => call<{ ok: boolean }>('/api/cuenta/link', { email }),
  /** Cuenta con solo el mail (quien regala con el código, sin passkey): manda el link para confirmarlo. */
  registerMail: (email: string, idioma: string) => call<{ ok: boolean }>('/api/cuenta/registro-mail', { email, idioma }),
  /** ¿Hay una sesión iniciada? (por ejemplo, abrió el link del mail en otra pestaña). */
  signedIn: async () => (await call<{ abierta: boolean }>('/api/cuenta/sesion')).abierta,
  redeemLink: async (token: string) => {
    const res = await call<{ email: string }>('/api/cuenta/link/canje', { token });
    setSignedIn(true);
    return res;
  },
  /** Recupero avanzado: la clave de la billetera, cifrada en el navegador (recupero/recupero.ts). */
  recoveryKey: async () => (await call<{ recupero: string | null }>('/api/cuenta/recupero')).recupero,
  setRecoveryKey: (recupero: string | null) => call<{ ok: true }>('/api/cuenta/recupero', { recupero }),
};

const challenge = async (tipo: 'registro' | 'ingreso', email?: string) =>
  (await call<{ desafio: string }>('/api/cuenta/desafio', { tipo, ...(email === undefined ? {} : { email }) })).desafio;

/** Cuenta al servidor el nombre del error de WebAuthn (sin datos de la persona) y lo vuelve a lanzar. */
function report(paso: 'registro' | 'ingreso') {
  return (error: unknown): never => {
    if (error instanceof PasskeyError && error.domName !== null) void call('/api/cuenta/diagnostico', { paso, error: error.domName }).catch(() => undefined);
    throw error;
  };
}

/**
 * Mensaje para cada falla al crear el acceso o entrar: cancelaste, el teléfono, la passkey o el
 * servidor. «No pudimos conectarnos» queda solo para cuando de verdad no hubo conexión: antes salía
 * para cualquier falla y no dejaba ver la causa (Rodolfo, 21/10).
 */
/** La causa técnica de la última falla genérica, para mostrarla en chico junto al mensaje. */
let lastDetail: string | null = null;
const GENERIC: ReadonlySet<Key> = new Set<Key>(['guardar.errorServidor', 'guardar.errorInterno', 'guardar.errorAcceso']);

function detailOf(e: unknown): string {
  if (e instanceof ApiFailure) return `${e.status} ${e.code}`;
  if (e instanceof Error) return `${e.name}: ${e.message}`.slice(0, 80);
  return String(e).slice(0, 80);
}

/**
 * « · código: …» para los mensajes genéricos (Rodolfo, 21/10): sin los registros del servidor, es
 * lo que permite saber qué falló cuando alguien manda una captura. Nunca lleva datos de la persona.
 */
export function accessErrorCode(key: Key): string {
  return GENERIC.has(key) && lastDetail !== null ? ` · código: ${lastDetail}` : '';
}

export function accessErrorKey(e: unknown): Key {
  lastDetail = detailOf(e);
  // Entró bien, pero la passkey dio otra clave que al crearla: pasa al usarla desde otro dispositivo
  // con el QR (el celu le contesta a la compu). Desde donde se creó, o con el código, abre.
  if (e instanceof CoreError && e.code === 'INVALID_VAULT') return 'guardar.bovedaOtroDispositivo';
  if (e instanceof PasskeyError) return e.kind === 'cancelada' ? 'guardar.cancelada' : e.kind === 'no_soportada' ? 'guardar.noSoportada' : 'guardar.errorDispositivo';
  if (e instanceof ApiFailure) {
    if (e.status === 0) return 'guardar.errorServidor';
    if (e.code === 'cuenta_existente') return 'guardar.yaExiste';
    if (e.status === 429) return 'guardar.demasiados';
    if (e.code === 'passkey_desconocida') return 'guardar.passkeyDesconocida';
    if (e.code === 'passkey_invalida') return 'guardar.passkeyInvalida';
    // La página se abrió desde una dirección que el servidor no acepta (por ejemplo, una app instalada vieja).
    if (e.code === 'no_autorizado') return 'guardar.otroSitio';
    if (e.status >= 500) return 'guardar.errorInterno';
  }
  // Cualquier otra cosa (incluida una caja que no se pudo abrir): falló el acceso, no la conexión.
  return 'guardar.errorAcceso';
}

/** Resultado de crear el acceso o entrar: la clave maestra (si la passkey tiene PRF). */
export interface Unlocked {
  readonly email: string;
  /** 12 palabras; null si la passkey no puede abrir una bóveda (sin PRF). */
  readonly master: string | null;
}

/**
 * Crea la cuenta con una passkey nueva. Si el dispositivo tiene PRF, genera la clave
 * maestra y la guarda cifrada; si no, la cuenta queda sin bóveda (se usa el código).
 */
export async function createAccess(email: string, lang: string): Promise<Unlocked> {
  // El desafío revisa el mail primero: con cuenta existente no se llega a crear la passkey.
  const ch = await challenge('registro', email);
  const created = await createPasskey({ challenge: ch, email, rpName: 'Regalale Bitcoin' }).catch(report('registro'));
  let master: string | null = null;
  let vault: string | null = null;
  if (created.prf !== null) {
    master = generateMasterMnemonic();
    vault = await sealVault(created.prf, master, created.credentialId);
    created.prf.fill(0);
  }
  const res = await call<{ email: string }>('/api/cuenta/registro', { email, idioma: lang, boveda: vault, credencial: created.registration });
  setSignedIn(true);
  return { email: res.email, master };
}

/** Entra con una passkey ya creada y abre la bóveda de esa passkey. */
export async function signIn(allow?: readonly string[]): Promise<Unlocked> {
  const used = await unlockWithPasskey({ challenge: await challenge('ingreso'), ...(allow === undefined ? {} : { allow }) }).catch(report('ingreso'));
  let res: { email: string; credencial: string; boveda: string | null; bovedasExtra?: string[] };
  try {
    res = await call('/api/cuenta/ingreso', { credencial: used.assertion });
  } catch (e) {
    // Passkey huérfana (de un registro que no llegó a guardarse): que el llavero la borre.
    if (e instanceof ApiFailure && e.code === 'passkey_desconocida') await signalUnknownPasskey(used.assertion.id);
    throw e;
  }
  setSignedIn(true);
  let master: string | null = null;
  if (res.boveda !== null && used.prf !== null) {
    // La bóveda de la passkey y, si las hay, sus copias para cuando se usa por QR (otra salida PRF).
    for (const sealed of [res.boveda, ...(res.bovedasExtra ?? [])]) {
      try {
        master = await openVault(used.prf, sealed, used.credentialId);
        break;
      } catch {
        // Probamos la siguiente.
      }
    }
    if (master === null) {
      // Entró, pero ninguna abre: se guarda la salida PRF (solo en memoria) para armar una copia con las 12 palabras.
      repair = { prf: used.prf, credentialId: used.credentialId };
      throw new CoreError('INVALID_VAULT', 'Esta passkey no abre esta bóveda.');
    }
    used.prf.fill(0);
  }
  return { email: res.email, master };
}

/** La salida PRF de la última entrada que no abrió la bóveda (en memoria, hasta repararla). */
let repair: { prf: Uint8Array; credentialId: Uint8Array } | null = null;

/** ¿Se puede guardar una copia de la bóveda para la passkey con la que se acaba de entrar? */
export function canRepairVault(): boolean {
  return repair !== null;
}

export type RepairProblem = 'invalidas' | 'noCoinciden' | 'sinRegalos';
export class RepairError extends Error {
  readonly problem: RepairProblem;
  constructor(problem: RepairProblem) {
    super(problem);
    this.problem = problem;
  }
}

/**
 * Con la clave maestra (de las 12 palabras o del celu): comprueba que es la de esta cuenta
 * (derivando la dirección de un regalo, si hay) y guarda otra copia de la bóveda cifrada con la
 * salida PRF que dio la passkey acá. La clave no sale del navegador.
 */
async function saveVaultCopy(master: string, gifts: readonly AccountGift[], network: Network, requireProbe: boolean): Promise<string> {
  if (repair === null) throw new RepairError('sinRegalos');
  // Los regalos multifirma no sirven para comprobar: su dirección depende además de la billetera.
  const probe = gifts.find((g) => g.indice !== null && g.direccion !== undefined && (g.rutaRecupero ?? null) === null);
  if (probe === undefined && requireProbe) throw new RepairError('sinRegalos');
  if (probe !== undefined && deriveGift(masterRootFromMnemonic(master), probe.indice as number, probe.idioma, network).address !== probe.direccion) throw new RepairError('noCoinciden');
  const sealed = await sealVault(repair.prf, master, repair.credentialId);
  await call('/api/cuenta/boveda-extra', { boveda: sealed });
  repair.prf.fill(0);
  repair = null;
  return master;
}

/** Con las 12 palabras escritas: sin regalos con qué comprobarlas, no se guardan (podrían ser otras). */
export async function repairVault(words: string, gifts: readonly AccountGift[], network: Network): Promise<string> {
  if (!isValidMasterMnemonic(words)) throw new RepairError('invalidas');
  return saveVaultCopy(normalizeMnemonic(words), gifts, network, true);
}

/** Con la clave que mandó el celu (que abrió la bóveda de verdad). */
export async function repairVaultFromPhone(master: string, gifts: readonly AccountGift[], network: Network): Promise<string> {
  if (!isValidMasterMnemonic(master)) throw new RepairError('invalidas');
  return saveVaultCopy(normalizeMnemonic(master), gifts, network, false);
}

/** Vínculo compu-celu (vinculo.ts): pedirlo, esperarlo y, desde el celu, completarlo. */
export const linkApi = {
  create: () => call<{ id: string; minutos: number }>('/api/cuenta/vinculos', {}),
  poll: (id: string) => call<{ paquete: string | null }>(`/api/cuenta/vinculos/${encodeURIComponent(id)}`),
  complete: (id: string, paquete: string) => call<{ ok: true }>(`/api/cuenta/vinculos/${encodeURIComponent(id)}`, { paquete }),
};
