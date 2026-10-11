import { bech32m } from '@scure/base';
import { Address, OutScript } from '@scure/btc-signer';
import { CoreError } from './errors.ts';
import { allNetworkParams, assertNetwork, type Network } from './network.ts';

// Validación de la dirección que pega el que recibe para cobrar su regalo.

export type DestinationType = 'p2wpkh' | 'p2wsh' | 'p2tr' | 'p2pkh' | 'p2sh';

export interface Destination {
  /** Red para la que se validó. */
  readonly network: Network;
  /** Dirección en forma canónica (bech32 en minúsculas). */
  readonly address: string;
  readonly type: DestinationType;
  readonly script: Uint8Array;
  /** true si es segwit: cambia el umbral de dust. */
  readonly witness: boolean;
}

const TYPES: Readonly<Record<string, { type: DestinationType; witness: boolean }>> = {
  wpkh: { type: 'p2wpkh', witness: true },
  wsh: { type: 'p2wsh', witness: true },
  tr: { type: 'p2tr', witness: true },
  pkh: { type: 'p2pkh', witness: false },
  sh: { type: 'p2sh', witness: false },
};

/** Saca "bitcoin:" y parámetros de un URI BIP21, y pasa a minúsculas un bech32 en mayúsculas (QR). */
export function cleanAddressInput(input: string): string {
  let s = input.trim();
  if (/^bitcoin:/i.test(s)) s = s.slice('bitcoin:'.length).split('?')[0] ?? '';
  if (/^(BC|TB|BCRT)1[02-9AC-HJ-NP-Z]+$/.test(s)) s = s.toLowerCase();
  return s;
}

/**
 * Dirección segwit válida de una versión que todavía no tiene uso (v1 que no es
 * taproot, v2 a v16). Mandar fondos ahí es casi seguro un error: no se acepta, pero
 * se distingue de una dirección mal escrita.
 */
function futureSegwitVersion(s: string, network: Network): number | null {
  try {
    const { prefix, words } = bech32m.decode(s as `${string}1${string}`);
    const version = words[0];
    if (prefix !== network.btc.bech32 || version === undefined || version < 1 || version > 16) return null;
    const program = bech32m.fromWords(words.slice(1));
    if (program.length < 2 || program.length > 40 || (version === 1 && program.length === 32)) return null;
    return version;
  } catch {
    return null;
  }
}

export function parseDestination(input: string, network: Network): Destination {
  assertNetwork(network);
  const s = cleanAddressInput(input);
  if (s === '') throw new CoreError('INVALID_ADDRESS', 'No hay dirección.', { reason: 'empty' });
  let decoded: ReturnType<ReturnType<typeof Address>['decode']>;
  try {
    decoded = Address(network.btc).decode(s);
  } catch {
    const version = futureSegwitVersion(s, network);
    if (version !== null) {
      throw new CoreError('UNSUPPORTED_ADDRESS', 'Ese tipo de dirección no está soportado.', { type: `segwit_v${version}` });
    }
    for (const other of allNetworkParams()) {
      if (other.btc === network.btc) continue;
      try {
        Address(other.btc).decode(s);
        throw new CoreError('WRONG_NETWORK', 'La dirección es de otra red.', { network: other.name });
      } catch (error) {
        if (error instanceof CoreError) throw error;
      }
    }
    throw new CoreError('INVALID_ADDRESS', 'La dirección no es válida.', { reason: 'decode' });
  }
  const kind = TYPES[decoded.type];
  if (kind === undefined) {
    throw new CoreError('UNSUPPORTED_ADDRESS', 'Ese tipo de dirección no está soportado.', { type: decoded.type });
  }
  return Object.freeze({
    network,
    address: Address(network.btc).encode(decoded),
    type: kind.type,
    script: OutScript.encode(decoded),
    witness: kind.witness,
  });
}
