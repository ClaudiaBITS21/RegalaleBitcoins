import { generateMasterMnemonic, openVault, sealVault } from '@regalale/core';
import { ApiFailure } from './api.ts';
import { createPasskey, unlockWithPasskey } from './passkey.ts';

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
  redeemLink: (token: string) => call<{ email: string }>('/api/cuenta/link/canje', { token }),
};

const challenge = async (tipo: 'registro' | 'ingreso') => (await call<{ desafio: string }>('/api/cuenta/desafio', { tipo })).desafio;

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
  const created = await createPasskey({ challenge: await challenge('registro'), email, rpName: 'RegalaleBitcoins' });
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
  const used = await unlockWithPasskey({ challenge: await challenge('ingreso'), ...(allow === undefined ? {} : { allow }) });
  const res = await call<{ email: string; credencial: string; boveda: string | null }>('/api/cuenta/ingreso', { credencial: used.assertion });
  let master: string | null = null;
  if (res.boveda !== null && used.prf !== null) {
    master = await openVault(used.prf, res.boveda, used.credentialId);
    used.prf.fill(0);
  }
  return { email: res.email, master };
}
