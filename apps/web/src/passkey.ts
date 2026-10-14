import { PRF_SALT } from '@regalale/core';

// Passkeys (WebAuthn) del lado del navegador. La extensión PRF entrega 32 bytes que solo
// salen con la cara o la huella de la persona: con eso se cifra la bóveda (ver core/vault).
// El desafío lo da el servidor y vuelve firmado; la salida PRF nunca sale del navegador.

const b64url = (bytes: ArrayBuffer | Uint8Array): string => {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (const b of u) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export const fromB64url = (s: string): Uint8Array => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

export class PasskeyError extends Error {
  readonly kind: 'cancelada' | 'no_soportada' | 'error';
  constructor(kind: 'cancelada' | 'no_soportada' | 'error', message: string = kind) {
    super(message);
    this.kind = kind;
  }
}

export function passkeysAvailable(): boolean {
  return typeof window !== 'undefined' && 'PublicKeyCredential' in window && navigator.credentials !== undefined;
}

type PrfResults = { results?: { first?: ArrayBuffer }; enabled?: boolean };

function prfOf(cred: PublicKeyCredential): PrfResults | undefined {
  return (cred.getClientExtensionResults() as { prf?: PrfResults }).prf;
}

function wrap(error: unknown): PasskeyError {
  const name = (error as { name?: string }).name;
  if (name === 'NotAllowedError' || name === 'AbortError') return new PasskeyError('cancelada');
  if (name === 'NotSupportedError' || name === 'SecurityError') return new PasskeyError('no_soportada', String(error));
  return new PasskeyError('error', String(error));
}

const prfExtension = () => ({ prf: { eval: { first: PRF_SALT as BufferSource } } }) as AuthenticationExtensionsClientInputs;

export interface CreatedPasskey {
  /** Lo que se manda al servidor para registrar la passkey (sin secretos). */
  readonly registration: { id: string; clientDataJSON: string; authenticatorData: string; publicKey: string; alg: number };
  readonly credentialId: Uint8Array;
  /** 32 bytes para cifrar la bóveda, o null si el dispositivo no tiene PRF. */
  readonly prf: Uint8Array | null;
}

export async function createPasskey(opts: { challenge: string; email: string; rpName: string }): Promise<CreatedPasskey> {
  if (!passkeysAvailable()) throw new PasskeyError('no_soportada');
  let cred: PublicKeyCredential;
  try {
    cred = (await navigator.credentials.create({
      publicKey: {
        rp: { id: window.location.hostname, name: opts.rpName },
        user: { id: crypto.getRandomValues(new Uint8Array(16)), name: opts.email, displayName: opts.email },
        challenge: fromB64url(opts.challenge) as BufferSource,
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -8 },
          { type: 'public-key', alg: -257 },
        ],
        authenticatorSelection: { residentKey: 'required', requireResidentKey: true, userVerification: 'required' },
        attestation: 'none',
        timeout: 120_000,
        extensions: prfExtension(),
      },
    })) as PublicKeyCredential;
  } catch (error) {
    throw wrap(error);
  }
  const response = cred.response as AuthenticatorAttestationResponse;
  const spki = response.getPublicKey();
  if (spki === null) throw new PasskeyError('no_soportada', 'Sin clave pública');
  const credentialId = new Uint8Array(cred.rawId);
  let prf: Uint8Array | null = null;
  const ext = prfOf(cred);
  if (ext?.results?.first !== undefined) prf = new Uint8Array(ext.results.first);
  else if (ext?.enabled === true) prf = (await unlockWithPasskey({ allow: [b64url(credentialId)] })).prf;
  return {
    registration: {
      id: b64url(credentialId),
      clientDataJSON: b64url(response.clientDataJSON),
      authenticatorData: b64url(response.getAuthenticatorData()),
      publicKey: b64url(spki),
      alg: response.getPublicKeyAlgorithm(),
    },
    credentialId,
    prf,
  };
}

export interface UsedPasskey {
  readonly assertion: { id: string; clientDataJSON: string; authenticatorData: string; signature: string };
  readonly credentialId: Uint8Array;
  readonly prf: Uint8Array | null;
}

/**
 * Pide la passkey (Face ID, huella o PIN). Con `challenge` del servidor sirve para entrar;
 * sin él, solo para obtener la salida PRF (desbloquear la bóveda) con un desafío local.
 */
export async function unlockWithPasskey(opts: { challenge?: string; allow?: readonly string[] }): Promise<UsedPasskey> {
  if (!passkeysAvailable()) throw new PasskeyError('no_soportada');
  let cred: PublicKeyCredential;
  try {
    cred = (await navigator.credentials.get({
      publicKey: {
        rpId: window.location.hostname,
        challenge: (opts.challenge !== undefined ? fromB64url(opts.challenge) : crypto.getRandomValues(new Uint8Array(32))) as BufferSource,
        allowCredentials: (opts.allow ?? []).map((id) => ({ type: 'public-key' as const, id: fromB64url(id) as BufferSource })),
        userVerification: 'required',
        timeout: 120_000,
        extensions: prfExtension(),
      },
    })) as PublicKeyCredential;
  } catch (error) {
    throw wrap(error);
  }
  const response = cred.response as AuthenticatorAssertionResponse;
  const first = prfOf(cred)?.results?.first;
  return {
    assertion: {
      id: b64url(cred.rawId),
      clientDataJSON: b64url(response.clientDataJSON),
      authenticatorData: b64url(response.authenticatorData),
      signature: b64url(response.signature),
    },
    credentialId: new Uint8Array(cred.rawId),
    prf: first === undefined ? null : new Uint8Array(first),
  };
}
