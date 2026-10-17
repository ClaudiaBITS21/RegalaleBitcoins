import { sha256 } from '@noble/hashes/sha2.js';
import { base64urlnopad } from '@scure/base';
import { entropyToMnemonic, mnemonicToEntropy } from '@scure/bip39';
import { CoreError } from './errors.ts';
import { isValidMasterMnemonic, normalizeMnemonic } from './master.ts';
import { ENGLISH } from './wordlists.ts';

// La bóveda: la clave maestra del que regala, cifrada en su navegador con una clave que
// solo sale de su passkey (extensión PRF de WebAuthn). El servidor guarda el resultado y
// no lo puede abrir. Ver docs/derivacion.md, "Bóveda".
//
//   salt PRF   = SHA-256("regalalebitcoins/boveda/v1/prf")       (fijo, va en cada pedido WebAuthn)
//   clave AES  = HKDF-SHA256(salida PRF, salt vacío, info "regalalebitcoins/boveda/v1/aes-gcm")
//   cifrado    = AES-256-GCM, IV de 12 bytes al azar, AAD = "regalalebitcoins/boveda/v1" || id de la credencial
//   contenido  = los 16 bytes de entropía de la clave maestra
//   formato    = "v1." + base64url(iv) + "." + base64url(cifrado+tag)

const enc = new TextEncoder();
export const VAULT_VERSION = 'v1';
export const PRF_SALT: Uint8Array = sha256(enc.encode('regalalebitcoins/boveda/v1/prf'));
const HKDF_INFO = enc.encode('regalalebitcoins/boveda/v1/aes-gcm');
const AAD_PREFIX = enc.encode('regalalebitcoins/boveda/v1');
const PRF_BYTES = 32;

function subtle(): SubtleCrypto {
  const s = globalThis.crypto?.subtle;
  if (s === undefined) throw new CoreError('NO_SECURE_RANDOM', 'Este entorno no tiene WebCrypto.');
  return s;
}

function aad(credentialId: Uint8Array): Uint8Array {
  const out = new Uint8Array(AAD_PREFIX.length + credentialId.length);
  out.set(AAD_PREFIX);
  out.set(credentialId, AAD_PREFIX.length);
  return out;
}

async function vaultKey(prfOutput: Uint8Array): Promise<CryptoKey> {
  if (prfOutput.length !== PRF_BYTES) throw new CoreError('INVALID_ENTROPY', `La salida PRF tiene que tener ${PRF_BYTES} bytes.`);
  const base = await subtle().importKey('raw', prfOutput as BufferSource, 'HKDF', false, ['deriveKey']);
  return subtle().deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: HKDF_INFO as BufferSource },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Cifra la clave maestra con la salida PRF de la passkey `credentialId`. */
export async function sealVault(prfOutput: Uint8Array, masterMnemonic: string, credentialId: Uint8Array): Promise<string> {
  const mnemonic = normalizeMnemonic(masterMnemonic);
  if (!isValidMasterMnemonic(mnemonic)) throw new CoreError('INVALID_MNEMONIC', 'La clave maestra no es válida.');
  const entropy = mnemonicToEntropy(mnemonic, ENGLISH as string[]);
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  try {
    const ct = new Uint8Array(
      await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: aad(credentialId) as BufferSource }, await vaultKey(prfOutput), entropy as BufferSource),
    );
    return `${VAULT_VERSION}.${base64urlnopad.encode(iv)}.${base64urlnopad.encode(ct)}`;
  } finally {
    entropy.fill(0);
  }
}

/** Abre la bóveda y devuelve la clave maestra (12 palabras). Falla si la passkey o la bóveda no corresponden. */
export async function openVault(prfOutput: Uint8Array, sealed: string, credentialId: Uint8Array): Promise<string> {
  const parts = sealed.split('.');
  if (parts.length !== 3 || parts[0] !== VAULT_VERSION) throw new CoreError('INVALID_VAULT', 'Formato de bóveda desconocido.');
  let iv: Uint8Array;
  let ct: Uint8Array;
  try {
    iv = base64urlnopad.decode(parts[1] as string);
    ct = base64urlnopad.decode(parts[2] as string);
  } catch {
    throw new CoreError('INVALID_VAULT', 'Bóveda dañada.');
  }
  if (iv.length !== 12) throw new CoreError('INVALID_VAULT', 'Bóveda dañada.');
  let entropy: Uint8Array;
  try {
    entropy = new Uint8Array(
      await subtle().decrypt({ name: 'AES-GCM', iv: iv as BufferSource, additionalData: aad(credentialId) as BufferSource }, await vaultKey(prfOutput), ct as BufferSource),
    );
  } catch {
    throw new CoreError('INVALID_VAULT', 'Esta passkey no abre esta bóveda.');
  }
  try {
    if (entropy.length !== 16) throw new CoreError('INVALID_VAULT', 'Contenido inesperado en la bóveda.');
    return entropyToMnemonic(entropy, ENGLISH as string[]);
  } finally {
    entropy.fill(0);
  }
}
