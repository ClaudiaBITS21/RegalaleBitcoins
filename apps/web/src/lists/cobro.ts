// Dato de cobro de una lista, cifrado en el navegador de quien la arma (handoff 21/10/2026,
// «listas por país»; formato en docs/arquitectura.md, «Dato de cobro cifrado»). La plataforma
// guarda solo el cifrado y no lo puede leer: la clave viaja en el fragmento del link de la lista
// (/l/<id>#<clave>), que el navegador nunca manda al servidor.
//
// v1: AES-256-GCM (WebCrypto), clave de 32 bytes al azar, IV de 12 bytes al azar, y el id de la
// lista como dato asociado (AAD): un cifrado copiado a otra lista no se abre. Texto:
// "v1.<iv base64url>.<cifrado+tag base64url>"; el contenido es JSON { medio, dato, titular }.

export type Medio = 'alias' | 'cbu' | 'pix' | 'breb' | 'iban' | 'otro';
export interface Cobro {
  readonly medio: Medio;
  readonly dato: string;
  readonly titular: string;
}

const MEDIOS: readonly Medio[] = ['alias', 'cbu', 'pix', 'breb', 'iban', 'otro'];
const enc = new TextEncoder();
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

/** Clave nueva de una lista: 32 bytes al azar, en base64url (43 caracteres). */
export function newListKey(): string {
  return b64(crypto.getRandomValues(new Uint8Array(32)));
}

export const LIST_KEY = /^[A-Za-z0-9_-]{43}$/;

const aesKey = (key: string, use: KeyUsage) => {
  if (!LIST_KEY.test(key)) throw new Error('clave');
  return crypto.subtle.importKey('raw', unb64(key) as BufferSource, 'AES-GCM', false, [use]);
};

export async function sealCobro(key: string, listId: string, cobro: Cobro, iv: Uint8Array = crypto.getRandomValues(new Uint8Array(12))): Promise<string> {
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource, additionalData: enc.encode(listId) }, await aesKey(key, 'encrypt'), enc.encode(JSON.stringify(cobro)));
  return `v1.${b64(iv)}.${b64(new Uint8Array(ct))}`;
}

/** Abre el dato de cobro; null si la clave o la lista no corresponden (o el cifrado está dañado). */
export async function openCobro(key: string, listId: string, sealed: string): Promise<Cobro | null> {
  try {
    const [v, iv, ct] = sealed.split('.');
    if (v !== 'v1' || iv === undefined || ct === undefined) return null;
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) as BufferSource, additionalData: enc.encode(listId) }, await aesKey(key, 'decrypt'), unb64(ct) as BufferSource);
    const c = JSON.parse(new TextDecoder().decode(plain)) as Partial<Cobro>;
    if (!MEDIOS.includes(c.medio as Medio) || typeof c.dato !== 'string' || typeof c.titular !== 'string') return null;
    return { medio: c.medio as Medio, dato: c.dato, titular: c.titular };
  } catch {
    return null;
  }
}

/**
 * Para guardar la clave de una lista en el servidor sin que el servidor la pueda leer: se cifra
 * con una llave derivada de la clave maestra de la cuenta (HKDF-SHA-256 sobre la clave privada
 * raíz BIP32, que solo existe en el navegador). Mismo formato v1, con AAD "clave:<id>".
 */
export async function wrapKeyFor(rootPrivateKey: Uint8Array): Promise<{ wrap: (key: string, listId: string) => Promise<string>; unwrap: (sealed: string, listId: string) => Promise<string | null> }> {
  const hkdf = await crypto.subtle.importKey('raw', rootPrivateKey as BufferSource, 'HKDF', false, ['deriveKey']);
  const k = await crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: enc.encode('regalale') as BufferSource, info: enc.encode('regalale-listas-clave-v1') as BufferSource },
    hkdf,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  return {
    wrap: async (key, listId) => {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(`clave:${listId}`) }, k, enc.encode(key));
      return `v1.${b64(iv)}.${b64(new Uint8Array(ct))}`;
    },
    unwrap: async (sealed, listId) => {
      try {
        const [v, iv, ct] = sealed.split('.');
        if (v !== 'v1' || iv === undefined || ct === undefined) return null;
        const key = new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) as BufferSource, additionalData: enc.encode(`clave:${listId}`) }, k, unb64(ct) as BufferSource));
        return LIST_KEY.test(key) ? key : null;
      } catch {
        return null;
      }
    },
  };
}

/** En este navegador (sin bóveda): la clave de cada lista de quien la armó. */
export const localListKey = {
  get: (listId: string): string | null => {
    try {
      const k = localStorage.getItem(`regalale.lista.${listId}`);
      return k !== null && LIST_KEY.test(k) ? k : null;
    } catch {
      return null;
    }
  },
  set: (listId: string, key: string) => {
    try {
      localStorage.setItem(`regalale.lista.${listId}`, key);
    } catch {
      // Sin almacenamiento: queda el link completo que se le mostró.
    }
  },
};
