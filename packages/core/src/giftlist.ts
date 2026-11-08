import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { base64urlnopad, hex } from '@scure/base';
import { mnemonicToEntropy } from '@scure/bip39';
import { CoreError } from './errors.ts';
import { isValidMasterMnemonic, normalizeMnemonic } from './master.ts';
import { ENGLISH } from './wordlists.ts';

// «Mis regalos» sin que el servidor sepa qué regalos son de quién (Claudia, 08/11/2026; docs/
// derivacion.md, «Lista de regalos»). La lista (índice e id de cada regalo) se guarda cifrada con
// una clave que sale de la clave maestra —no de una passkey: así la leen todas las passkeys de la
// cuenta y, más adelante, los miembros de una empresa—. Para editar un regalo ya desvinculado,
// quien regala prueba que es suyo con una llave que también sale de la clave maestra.
//
//   clave lista  = HKDF-SHA256(entropía de la clave maestra, salt vacío, info "regalalebitcoins/lista-regalos/v1/aes-gcm")
//   cifrado      = AES-256-GCM, IV de 12 bytes al azar, AAD = "regalalebitcoins/lista-regalos/v1"
//   contenido    = JSON UTF-8 [{"i": índice, "id": id del regalo, "l": idioma}, …]
//   formato      = "l1." + base64url(iv) + "." + base64url(cifrado+tag)
//   llave edición = HMAC-SHA256(HKDF(entropía, info "regalalebitcoins/edicion/v1"), id del regalo) → hex;
//                   el servidor guarda solo su SHA-256.

const enc = new TextEncoder();
const dec = new TextDecoder('utf-8', { fatal: true });
export const GIFT_LIST_VERSION = 'l1';
const LIST_INFO = enc.encode('regalalebitcoins/lista-regalos/v1/aes-gcm');
const LIST_AAD = enc.encode('regalalebitcoins/lista-regalos/v1');
const EDIT_INFO = enc.encode('regalalebitcoins/edicion/v1');

export interface GiftListEntry {
  readonly i: number;
  readonly id: string;
  readonly l: 'es' | 'pt' | 'en' | 'it';
}

function subtle(): SubtleCrypto {
  const s = globalThis.crypto?.subtle;
  if (s === undefined) throw new CoreError('NO_SECURE_RANDOM', 'Este entorno no tiene WebCrypto.');
  return s;
}

function masterEntropy(masterMnemonic: string): Uint8Array {
  const m = normalizeMnemonic(masterMnemonic);
  if (!isValidMasterMnemonic(m)) throw new CoreError('INVALID_MNEMONIC', 'La clave maestra no es válida.');
  return mnemonicToEntropy(m, ENGLISH as string[]);
}

async function hkdfBytes(ikm: Uint8Array, info: Uint8Array): Promise<Uint8Array> {
  const base = await subtle().importKey('raw', ikm as BufferSource, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await subtle().deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: info as BufferSource }, base, 256));
}

async function listKey(masterMnemonic: string): Promise<CryptoKey> {
  const entropy = masterEntropy(masterMnemonic);
  try {
    const raw = await hkdfBytes(entropy, LIST_INFO);
    return subtle().importKey('raw', raw as BufferSource, 'AES-GCM', false, ['encrypt', 'decrypt']);
  } finally {
    entropy.fill(0);
  }
}

/** Cifra la lista de regalos. `iv` solo para los vectores de prueba. */
export async function sealGiftList(masterMnemonic: string, list: readonly GiftListEntry[], iv: Uint8Array = globalThis.crypto.getRandomValues(new Uint8Array(12))): Promise<string> {
  const plain = enc.encode(JSON.stringify(list.map((e) => ({ i: e.i, id: e.id, l: e.l }))));
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv: iv as BufferSource, additionalData: LIST_AAD as BufferSource }, await listKey(masterMnemonic), plain as BufferSource));
  return `${GIFT_LIST_VERSION}.${base64urlnopad.encode(iv)}.${base64urlnopad.encode(ct)}`;
}

/** Abre la lista. Falla si es de otra clave maestra o está alterada. */
export async function openGiftList(masterMnemonic: string, sealed: string): Promise<GiftListEntry[]> {
  const parts = sealed.split('.');
  if (parts.length !== 3 || parts[0] !== GIFT_LIST_VERSION) throw new CoreError('INVALID_CARD', 'Formato de lista desconocido.');
  let plain: Uint8Array;
  try {
    const iv = base64urlnopad.decode(parts[1] as string);
    const ct = base64urlnopad.decode(parts[2] as string);
    plain = new Uint8Array(await subtle().decrypt({ name: 'AES-GCM', iv: iv as BufferSource, additionalData: LIST_AAD as BufferSource }, await listKey(masterMnemonic), ct as BufferSource));
  } catch {
    throw new CoreError('INVALID_CARD', 'La lista no se puede abrir con esta clave.');
  }
  const raw = JSON.parse(dec.decode(plain)) as unknown;
  if (!Array.isArray(raw)) throw new CoreError('INVALID_CARD', 'Lista dañada.');
  return raw.map((e: { i?: unknown; id?: unknown; l?: unknown }) => {
    if (typeof e.i !== 'number' || typeof e.id !== 'string' || (e.l !== 'es' && e.l !== 'pt' && e.l !== 'en' && e.l !== 'it')) throw new CoreError('INVALID_CARD', 'Lista dañada.');
    return { i: e.i, id: e.id, l: e.l };
  });
}

/** La llave con que quien regala prueba que un regalo es suyo (para editarlo ya desvinculado). */
export async function giftEditKey(masterMnemonic: string, giftId: string): Promise<string> {
  const entropy = masterEntropy(masterMnemonic);
  try {
    return hex.encode(hmac(sha256, await hkdfBytes(entropy, EDIT_INFO), enc.encode(giftId)));
  } finally {
    entropy.fill(0);
  }
}

/** Lo que guarda el servidor de esa llave: su SHA-256 en hex. */
export const editKeyHash = (key: string): string => hex.encode(sha256(enc.encode(key)));

export const isSealedGiftList = (v: string): boolean => /^l1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22,}$/.test(v);
