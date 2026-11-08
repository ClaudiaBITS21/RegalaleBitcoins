import { base64urlnopad } from '@scure/base';
import { CoreError } from './errors.ts';

// La tarjeta de un regalo (para quién, de quién y el mensaje), cifrada en el navegador con una
// clave que sale de la semilla del regalo, la misma que va en el link (Claudia, 08/11/2026). El
// servidor guarda solo el resultado y no puede leerlo: lo abre quien tiene el link, y quien regala
// (que vuelve a derivar la semilla desde su clave maestra). Ver docs/derivacion.md, "Tarjeta".
//
//   clave     = HKDF-SHA256(semilla del regalo [16 bytes], salt vacío, info "regalalebitcoins/tarjeta/v1/aes-gcm")
//   cifrado   = AES-256-GCM, IV de 12 bytes al azar, AAD = "regalalebitcoins/tarjeta/v1" || dirección del regalo (ASCII)
//   contenido = JSON UTF-8 {"para":…, "de":…, "mensaje":…}
//   formato   = "t1." + base64url(iv) + "." + base64url(cifrado+tag)

const enc = new TextEncoder();
const dec = new TextDecoder('utf-8', { fatal: true });
export const CARD_VERSION = 't1';
const HKDF_INFO = enc.encode('regalalebitcoins/tarjeta/v1/aes-gcm');
const AAD_PREFIX = enc.encode('regalalebitcoins/tarjeta/v1');

export interface CardText {
  readonly para: string;
  readonly de: string | null;
  readonly mensaje: string;
}

function subtle(): SubtleCrypto {
  const s = globalThis.crypto?.subtle;
  if (s === undefined) throw new CoreError('NO_SECURE_RANDOM', 'Este entorno no tiene WebCrypto.');
  return s;
}

const aad = (address: string): Uint8Array => {
  const a = enc.encode(address);
  const out = new Uint8Array(AAD_PREFIX.length + a.length);
  out.set(AAD_PREFIX);
  out.set(a, AAD_PREFIX.length);
  return out;
};

async function cardKey(seed: Uint8Array): Promise<CryptoKey> {
  if (seed.length !== 16) throw new CoreError('INVALID_ENTROPY', 'La semilla del regalo tiene que tener 16 bytes.');
  const base = await subtle().importKey('raw', seed as BufferSource, 'HKDF', false, ['deriveKey']);
  return subtle().deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: HKDF_INFO as BufferSource },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Cifra la tarjeta. `iv` solo para los vectores de prueba: en uso real, al azar. */
export async function sealCard(seed: Uint8Array, address: string, card: CardText, iv: Uint8Array = globalThis.crypto.getRandomValues(new Uint8Array(12))): Promise<string> {
  if (iv.length !== 12) throw new CoreError('INVALID_CARD', 'IV inválido.');
  const plain = enc.encode(JSON.stringify({ para: card.para, de: card.de, mensaje: card.mensaje }));
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv: iv as BufferSource, additionalData: aad(address) as BufferSource }, await cardKey(seed), plain as BufferSource));
  return `${CARD_VERSION}.${base64urlnopad.encode(iv)}.${base64urlnopad.encode(ct)}`;
}

/** Abre la tarjeta. Falla si la semilla o la dirección no corresponden, o si está alterada. */
export async function openCard(seed: Uint8Array, address: string, sealed: string): Promise<CardText> {
  const parts = sealed.split('.');
  if (parts.length !== 3 || parts[0] !== CARD_VERSION) throw new CoreError('INVALID_CARD', 'Formato de tarjeta desconocido.');
  let iv: Uint8Array;
  let ct: Uint8Array;
  try {
    iv = base64urlnopad.decode(parts[1] as string);
    ct = base64urlnopad.decode(parts[2] as string);
  } catch {
    throw new CoreError('INVALID_CARD', 'Tarjeta dañada.');
  }
  if (iv.length !== 12) throw new CoreError('INVALID_CARD', 'Tarjeta dañada.');
  let plain: Uint8Array;
  try {
    plain = new Uint8Array(await subtle().decrypt({ name: 'AES-GCM', iv: iv as BufferSource, additionalData: aad(address) as BufferSource }, await cardKey(seed), ct as BufferSource));
  } catch {
    throw new CoreError('INVALID_CARD', 'La tarjeta no se puede abrir con este link.');
  }
  const o = JSON.parse(dec.decode(plain)) as { para?: unknown; de?: unknown; mensaje?: unknown };
  if (typeof o.para !== 'string' || typeof o.mensaje !== 'string' || (o.de !== null && typeof o.de !== 'string')) throw new CoreError('INVALID_CARD', 'Tarjeta dañada.');
  return { para: o.para, de: o.de, mensaje: o.mensaje };
}

/** Si un texto tiene la forma de una tarjeta cifrada. */
export const isSealedCard = (v: string): boolean => /^t1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22,}$/.test(v);
