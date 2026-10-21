import { generateMasterMnemonic, openVault, sealVault } from '@regalale/core';
import { ApiFailure } from './api.ts';
import type { Key } from './i18n/index.ts';
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
  readonly creado: string;
  readonly estado: string | null;
  readonly sats: string | null;
}

export interface AccountView {
  readonly email: string;
  readonly credenciales: ReadonlyArray<{ id: string; prf: boolean }>;
  readonly proximoIndice: number;
  readonly regalos: readonly AccountGift[];
}

export const accountApi = {
  me: () => call<AccountView>('/api/cuenta'),
  logout: () => call<{ ok: boolean }>('/api/cuenta/salir', {}),
  sendLink: (email: string) => call<{ ok: boolean }>('/api/cuenta/link', { email }),
  /** Cuenta con solo el mail (quien regala con el código, sin passkey): manda el link para confirmarlo. */
  registerMail: (email: string, idioma: string) => call<{ ok: boolean }>('/api/cuenta/registro-mail', { email, idioma }),
  /** ¿Hay una sesión iniciada? (por ejemplo, abrió el link del mail en otra pestaña). */
  signedIn: async () => (await call<{ abierta: boolean }>('/api/cuenta/sesion')).abierta,
  redeemLink: (token: string) => call<{ email: string }>('/api/cuenta/link/canje', { token }),
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

/** Mensaje para cada falla al crear el acceso o entrar: cancelaste, el teléfono, la passkey o el servidor. */
export function accessErrorKey(e: unknown): Key {
  if (e instanceof PasskeyError) return e.kind === 'cancelada' ? 'guardar.cancelada' : e.kind === 'no_soportada' ? 'guardar.noSoportada' : 'guardar.errorDispositivo';
  if (e instanceof ApiFailure) {
    if (e.code === 'cuenta_existente') return 'guardar.yaExiste';
    if (e.status === 429) return 'guardar.demasiados';
    if (e.code === 'passkey_desconocida') return 'guardar.passkeyDesconocida';
    if (e.code === 'passkey_invalida') return 'guardar.passkeyInvalida';
  }
  return 'guardar.errorServidor';
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
  return { email: res.email, master };
}

/** Entra con una passkey ya creada y abre la bóveda de esa passkey. */
export async function signIn(allow?: readonly string[]): Promise<Unlocked> {
  const used = await unlockWithPasskey({ challenge: await challenge('ingreso'), ...(allow === undefined ? {} : { allow }) }).catch(report('ingreso'));
  let res: { email: string; credencial: string; boveda: string | null };
  try {
    res = await call('/api/cuenta/ingreso', { credencial: used.assertion });
  } catch (e) {
    // Passkey huérfana (de un registro que no llegó a guardarse): que el llavero la borre.
    if (e instanceof ApiFailure && e.code === 'passkey_desconocida') await signalUnknownPasskey(used.assertion.id);
    throw e;
  }
  let master: string | null = null;
  if (res.boveda !== null && used.prf !== null) {
    master = await openVault(used.prf, res.boveda, used.credentialId);
    used.prf.fill(0);
  }
  return { email: res.email, master };
}
