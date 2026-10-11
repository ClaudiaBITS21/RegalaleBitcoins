import { getNetwork, type Network, type NetworkName } from '@regalale/core';

export interface Config {
  readonly network: Network;
  readonly databaseUrl: string;
  /** API compatible con Esplora (mempool.space, Blockstream o propia). */
  readonly esploraUrl: string;
  /** Endpoint de precios de mempool.space (/api/v1/prices). */
  readonly priceUrl: string;
  readonly port: number;
  /** Carpeta con la web compilada (apps/web/dist), si la sirve esta misma API. */
  readonly webDist: string | null;
}

const DEFAULT_ESPLORA: Readonly<Record<NetworkName, string>> = {
  mainnet: 'https://mempool.space/api',
  testnet: 'https://mempool.space/testnet4/api',
  signet: 'https://mempool.space/signet/api',
  regtest: 'http://127.0.0.1:3002',
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const name = (env.NETWORK ?? 'signet') as NetworkName;
  // Mainnet solo con autorización explícita del responsable del proyecto.
  const network = getNetwork(name, { allowMainnet: env.ALLOW_MAINNET === 'autorizado' });
  const port = Number(env.PORT ?? 8787);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) throw new Error(`PORT inválido: ${env.PORT}`);
  return Object.freeze({
    network,
    databaseUrl: env.DATABASE_URL ?? 'postgres://regalale:regalale@127.0.0.1:5432/regalale',
    esploraUrl: (env.ESPLORA_URL ?? DEFAULT_ESPLORA[name]).replace(/\/$/, ''),
    priceUrl: env.PRICE_URL ?? 'https://mempool.space/api/v1/prices',
    port,
    webDist: env.WEB_DIST ?? null,
  });
}
