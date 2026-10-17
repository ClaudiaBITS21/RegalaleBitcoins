import { sha256 } from '@noble/hashes/sha2.js';
import { base64urlnopad } from '@scure/base';
import { CoreError } from './errors.ts';
import { GIFT_ENTROPY_BYTES } from './gift.ts';

// La semilla del regalo viaja en el fragmento del link (después del "#"), que el
// navegador nunca manda al servidor. Formato v1:
//   "1" + base64url_sin_relleno(entropía[16] || sha256(entropía)[0..2])
// Son 25 caracteres. Los 2 bytes de control detectan links cortados o mal copiados
// antes de pedirle las palabras a nadie.

export const LINK_VERSION = '1';
const CHECKSUM_BYTES = 2;
const PAYLOAD_BYTES = GIFT_ENTROPY_BYTES + CHECKSUM_BYTES;
const FRAGMENT_LENGTH = 1 + Math.ceil((PAYLOAD_BYTES * 8) / 6);

function checksum(entropy: Uint8Array): Uint8Array {
  return sha256(entropy).slice(0, CHECKSUM_BYTES);
}

export function encodeGiftFragment(entropy: Uint8Array): string {
  if (entropy.length !== GIFT_ENTROPY_BYTES) {
    throw new CoreError('INVALID_ENTROPY', `La semilla del regalo tiene que tener ${GIFT_ENTROPY_BYTES} bytes.`);
  }
  const payload = new Uint8Array(PAYLOAD_BYTES);
  payload.set(entropy);
  payload.set(checksum(entropy), GIFT_ENTROPY_BYTES);
  try {
    return LINK_VERSION + base64urlnopad.encode(payload);
  } finally {
    payload.fill(0);
  }
}

/** Acepta el fragmento con o sin "#". Devuelve los 16 bytes de la semilla. */
export function decodeGiftFragment(fragment: string): Uint8Array {
  const text = fragment.trim().replace(/^#/, '');
  if (text.length === 0) throw new CoreError('INVALID_LINK', 'El link no trae la semilla.', { reason: 'empty' });
  if (text[0] !== LINK_VERSION) throw new CoreError('INVALID_LINK', 'Versión de link desconocida.', { reason: 'version' });
  if (text.length !== FRAGMENT_LENGTH) throw new CoreError('INVALID_LINK', 'El link está incompleto.', { reason: 'length' });
  let payload: Uint8Array;
  try {
    payload = base64urlnopad.decode(text.slice(1));
  } catch {
    throw new CoreError('INVALID_LINK', 'El link está dañado.', { reason: 'encoding' });
  }
  if (payload.length !== PAYLOAD_BYTES) {
    payload.fill(0);
    throw new CoreError('INVALID_LINK', 'El link está incompleto.', { reason: 'length' });
  }
  const entropy = payload.slice(0, GIFT_ENTROPY_BYTES);
  const expected = checksum(entropy);
  const ok = expected.every((b, i) => b === payload[GIFT_ENTROPY_BYTES + i]);
  payload.fill(0);
  if (!ok) {
    entropy.fill(0);
    throw new CoreError('INVALID_LINK', 'El link está dañado.', { reason: 'checksum' });
  }
  return entropy;
}
