// Vincular la compu con el celu sin escribir las 12 palabras (Claudia, 21/10). La compu genera un
// par ECDH P-256 y muestra un QR con /vincular#<id>.<clave pública>: el fragmento no viaja al
// servidor. El celu abre la bóveda con su passkey, deriva una clave compartida con un par propio
// de un solo uso (HKDF-SHA-256) y sube la clave maestra cifrada (AES-GCM). Solo la compu, que
// tiene la clave privada (no exportable), la puede abrir. Todo con WebCrypto, sin dependencias.

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const INFO = new TextEncoder().encode('regalale-vinculo-v1');
const ECDH = { name: 'ECDH', namedCurve: 'P-256' } as const;

async function sharedKey(privateKey: CryptoKey, peerRaw: Uint8Array, id: string): Promise<CryptoKey> {
  const peer = await crypto.subtle.importKey('raw', peerRaw as BufferSource, ECDH, false, []);
  const bits = await crypto.subtle.deriveBits({ name: 'ECDH', public: peer }, privateKey, 256);
  const hkdf = await crypto.subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: new TextEncoder().encode(id) as BufferSource, info: INFO as BufferSource }, hkdf, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/** Lado de la compu: el par de claves y el fragmento para el QR. */
export async function startLink(id: string): Promise<{ fragment: string; open: (paquete: string) => Promise<string> }> {
  const pair = (await crypto.subtle.generateKey(ECDH, false, ['deriveBits'])) as CryptoKeyPair;
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  return {
    fragment: `${id}.${b64(pub)}`,
    /** Abre el paquete del celu y devuelve la clave maestra. */
    open: async (paquete: string) => {
      const [v, peer, iv, ct] = paquete.split('.');
      if (v !== 'v1' || peer === undefined || iv === undefined || ct === undefined) throw new Error('paquete');
      const key = await sharedKey(pair.privateKey, unb64(peer), id);
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) as BufferSource, additionalData: new TextEncoder().encode(id) as BufferSource }, key, unb64(ct) as BufferSource);
      return new TextDecoder().decode(plain);
    },
  };
}

/** Lee el fragmento del QR: id del vínculo y clave pública de la compu. */
export function parseLinkFragment(hash: string): { id: string; pub: Uint8Array } | null {
  const m = /^#([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{80,100})$/.exec(hash);
  if (m === null) return null;
  try {
    const pub = unb64(m[2] as string);
    return pub.length === 65 ? { id: m[1] as string, pub } : null;
  } catch {
    return null;
  }
}

/** Lado del celu: cifra la clave maestra para la compu. */
export async function sealForLink(id: string, computerPub: Uint8Array, master: string): Promise<string> {
  const pair = (await crypto.subtle.generateKey(ECDH, false, ['deriveBits'])) as CryptoKeyPair;
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  const key = await sharedKey(pair.privateKey, computerPub, id);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(id) as BufferSource }, key, new TextEncoder().encode(master)));
  return `v1.${b64(pub)}.${b64(iv)}.${b64(ct)}`;
}
