import { CoreError } from './errors.ts';

export type RandomBytes = (length: number) => Uint8Array;

/**
 * Bytes aleatorios del generador criptográfico del sistema (crypto.getRandomValues).
 * Es la única fuente de aleatoriedad del núcleo. Nunca Math.random.
 */
export function secureRandomBytes(length: number): Uint8Array {
  if (!Number.isInteger(length) || length <= 0 || length > 65536) {
    throw new RangeError(`Largo inválido: ${length}`);
  }
  const crypto = (globalThis as { crypto?: Crypto }).crypto;
  if (crypto === undefined || typeof crypto.getRandomValues !== 'function') {
    throw new CoreError('NO_SECURE_RANDOM', 'Este entorno no tiene crypto.getRandomValues.');
  }
  const out = new Uint8Array(length);
  crypto.getRandomValues(out);
  // Defensa contra un generador roto o reemplazado: 16 bytes en cero no salen por azar.
  if (length >= 16 && out.every((b) => b === 0)) {
    throw new CoreError('NO_SECURE_RANDOM', 'El generador aleatorio devolvió solo ceros.');
  }
  return out;
}
