import { NETWORK, TEST_NETWORK } from '@scure/btc-signer';
import type { BTC_NETWORK } from '@scure/btc-signer/utils.js';
import { CoreError } from './errors.ts';

export type NetworkName = 'mainnet' | 'testnet' | 'signet' | 'regtest';

export interface Network {
  readonly name: NetworkName;
  /** Coin type de BIP44/BIP84: 0 en mainnet, 1 en todas las redes de prueba. */
  readonly coinType: 0 | 1;
  readonly btc: BTC_NETWORK;
}

const REGTEST: BTC_NETWORK = Object.freeze({ bech32: 'bcrt', pubKeyHash: 0x6f, scriptHash: 0xc4, wif: 0xef });

const NETWORKS: Readonly<Record<NetworkName, Network>> = Object.freeze({
  mainnet: Object.freeze({ name: 'mainnet', coinType: 0, btc: NETWORK }),
  testnet: Object.freeze({ name: 'testnet', coinType: 1, btc: TEST_NETWORK }),
  signet: Object.freeze({ name: 'signet', coinType: 1, btc: TEST_NETWORK }),
  regtest: Object.freeze({ name: 'regtest', coinType: 1, btc: REGTEST }),
});

// Solo se aceptan objetos de red entregados por getNetwork(). Así nadie arma una red
// mainnet "a mano" y saltea el bloqueo por accidente.
const issued = new WeakSet<Network>();

export interface GetNetworkOptions {
  /** Mainnet está bloqueada salvo que se pida explícitamente. */
  readonly allowMainnet?: boolean;
}

export function getNetwork(name: NetworkName, options: GetNetworkOptions = {}): Network {
  if (!Object.hasOwn(NETWORKS, name)) {
    throw new CoreError('INVALID_NETWORK', `Red desconocida: ${String(name)}`);
  }
  if (name === 'mainnet' && options.allowMainnet !== true) {
    throw new CoreError('MAINNET_NOT_ALLOWED', 'Mainnet está bloqueada: pasá { allowMainnet: true } para habilitarla.');
  }
  const network = NETWORKS[name];
  issued.add(network);
  return network;
}

export function assertNetwork(network: Network): void {
  if (!issued.has(network)) {
    throw new CoreError('INVALID_NETWORK', 'La red tiene que venir de getNetwork().');
  }
}

/** Parámetros de las otras redes, para detectar direcciones de una red equivocada. */
export function allNetworkParams(): ReadonlyArray<{ name: NetworkName; btc: BTC_NETWORK }> {
  return Object.values(NETWORKS).map(({ name, btc }) => ({ name, btc }));
}
