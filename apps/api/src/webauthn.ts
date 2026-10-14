import { createHash, createPublicKey, type KeyObject, verify } from 'node:crypto';

// Verificación de passkeys (WebAuthn nivel 3) con node:crypto, sin dependencias.
// Registro sin atestación ("none"): el navegador entrega la clave pública en SPKI.
// Ingreso: firma sobre authenticatorData || SHA-256(clientDataJSON).

export class WebAuthnError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebAuthnError';
  }
}

const B64URL = /^[A-Za-z0-9_-]+$/;

export function fromB64url(value: unknown, what: string): Buffer {
  if (typeof value !== 'string' || !B64URL.test(value) || value.length > 4096) throw new WebAuthnError(`${what} inválido.`);
  return Buffer.from(value, 'base64url');
}

const sha256 = (data: Buffer): Buffer => createHash('sha256').update(data).digest();

interface ClientData {
  readonly type: string;
  readonly challenge: string;
  readonly origin: string;
}

function clientData(raw: Buffer, type: 'webauthn.create' | 'webauthn.get', origins: readonly string[]): { data: ClientData; rpId: string } {
  let data: ClientData;
  try {
    data = JSON.parse(raw.toString('utf8')) as ClientData;
  } catch {
    throw new WebAuthnError('clientDataJSON inválido.');
  }
  if (data.type !== type) throw new WebAuthnError('Tipo de operación inesperado.');
  if (typeof data.challenge !== 'string' || !B64URL.test(data.challenge)) throw new WebAuthnError('Desafío inválido.');
  if (typeof data.origin !== 'string' || !origins.includes(data.origin)) throw new WebAuthnError('Origen no permitido.');
  return { data, rpId: new URL(data.origin).hostname };
}

const FLAG_UP = 0x01;
const FLAG_UV = 0x04;
const FLAG_AT = 0x40;

interface AuthData {
  readonly flags: number;
  readonly signCount: number;
  readonly credentialId: Buffer | null;
}

function authData(raw: Buffer, rpId: string): AuthData {
  if (raw.length < 37) throw new WebAuthnError('authenticatorData corto.');
  if (!raw.subarray(0, 32).equals(sha256(Buffer.from(rpId)))) throw new WebAuthnError('La passkey es de otro sitio.');
  const flags = raw[32] as number;
  if ((flags & FLAG_UP) === 0 || (flags & FLAG_UV) === 0) throw new WebAuthnError('Falta la verificación de la persona (Face ID, huella o PIN).');
  const signCount = raw.readUInt32BE(33);
  let credentialId: Buffer | null = null;
  if ((flags & FLAG_AT) !== 0) {
    if (raw.length < 55) throw new WebAuthnError('authenticatorData corto.');
    const len = raw.readUInt16BE(53);
    if (raw.length < 55 + len) throw new WebAuthnError('authenticatorData corto.');
    credentialId = raw.subarray(55, 55 + len);
  }
  return { flags, signCount, credentialId };
}

export const ALGS = { ES256: -7, EdDSA: -8, RS256: -257 } as const;

function publicKey(spki: Buffer, alg: number): KeyObject {
  let key: KeyObject;
  try {
    key = createPublicKey({ key: spki, format: 'der', type: 'spki' });
  } catch {
    throw new WebAuthnError('Clave pública inválida.');
  }
  const t = key.asymmetricKeyType;
  const ok =
    (alg === ALGS.ES256 && t === 'ec' && key.asymmetricKeyDetails?.namedCurve === 'prime256v1') ||
    (alg === ALGS.EdDSA && t === 'ed25519') ||
    (alg === ALGS.RS256 && t === 'rsa' && (key.asymmetricKeyDetails?.modulusLength ?? 0) >= 2048);
  if (!ok) throw new WebAuthnError('Algoritmo de passkey no soportado.');
  return key;
}

export interface RegistrationInput {
  readonly id: unknown;
  readonly clientDataJSON: unknown;
  readonly authenticatorData: unknown;
  readonly publicKey: unknown;
  readonly alg: unknown;
}

export interface VerifiedRegistration {
  readonly credentialId: string;
  readonly publicKey: Buffer;
  readonly alg: number;
  readonly signCount: number;
  readonly challenge: string;
}

export function verifyRegistration(input: RegistrationInput, origins: readonly string[]): VerifiedRegistration {
  const id = fromB64url(input.id, 'id');
  const { data, rpId } = clientData(fromB64url(input.clientDataJSON, 'clientDataJSON'), 'webauthn.create', origins);
  const auth = authData(fromB64url(input.authenticatorData, 'authenticatorData'), rpId);
  if (auth.credentialId === null || !auth.credentialId.equals(id)) throw new WebAuthnError('La credencial no coincide.');
  if (typeof input.alg !== 'number') throw new WebAuthnError('Algoritmo inválido.');
  const spki = fromB64url(input.publicKey, 'publicKey');
  publicKey(spki, input.alg);
  return { credentialId: id.toString('base64url'), publicKey: spki, alg: input.alg, signCount: auth.signCount, challenge: data.challenge };
}

export interface AssertionInput {
  readonly id: unknown;
  readonly clientDataJSON: unknown;
  readonly authenticatorData: unknown;
  readonly signature: unknown;
}

export interface StoredCredential {
  readonly publicKey: Buffer;
  readonly alg: number;
  readonly signCount: number;
}

export function verifyAssertion(input: AssertionInput, stored: StoredCredential, origins: readonly string[]): { challenge: string; signCount: number } {
  const rawClient = fromB64url(input.clientDataJSON, 'clientDataJSON');
  const { data, rpId } = clientData(rawClient, 'webauthn.get', origins);
  const rawAuth = fromB64url(input.authenticatorData, 'authenticatorData');
  const auth = authData(rawAuth, rpId);
  const signature = fromB64url(input.signature, 'signature');
  const signed = Buffer.concat([rawAuth, sha256(rawClient)]);
  const key = publicKey(stored.publicKey, stored.alg);
  let valid = false;
  try {
    valid = verify(stored.alg === ALGS.EdDSA ? null : 'sha256', signed, key, signature);
  } catch {
    valid = false;
  }
  if (!valid) throw new WebAuthnError('Firma inválida.');
  // Contador: si la passkey lo usa y no avanza, puede ser una copia.
  if (auth.signCount !== 0 || stored.signCount !== 0) {
    if (auth.signCount <= stored.signCount) throw new WebAuthnError('Contador de la passkey inválido.');
  }
  return { challenge: data.challenge, signCount: auth.signCount };
}
