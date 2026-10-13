import { getNetwork, type Network, type NetworkName } from '@regalale/core';

export interface Config {
  readonly network: Network;
  readonly databaseUrl: string;
  /** En Cloud Run: conexión a Cloud SQL por socket Unix (DB_SOCKET, DB_USER, DB_NAME, DB_PASSWORD). */
  readonly databaseSocket: { readonly path: string; readonly user: string; readonly database: string; readonly password: string } | null;
  /** Token que exige el endpoint de tareas programadas (Cloud Scheduler). */
  readonly tasksToken: string | null;
  /** Si corre el bucle interno de difusiones programadas (en Cloud Run lo dispara Scheduler). */
  readonly broadcasterLoop: boolean;
  /** API compatible con Esplora (mempool.space, Blockstream o propia). */
  readonly esploraUrl: string;
  /** Endpoint de precios de mempool.space (/api/v1/prices). */
  readonly priceUrl: string;
  /** BTC/ARS: CriptoYa (exchanges locales) y Bitso como control. */
  readonly arsPriceUrls: { readonly criptoya: string; readonly bitso: string };
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
    databaseSocket:
      env.DB_SOCKET === undefined
        ? null
        : { path: env.DB_SOCKET, user: env.DB_USER ?? 'regalale', database: env.DB_NAME ?? 'regalale', password: env.DB_PASSWORD ?? '' },
    tasksToken: env.TAREAS_TOKEN !== undefined && env.TAREAS_TOKEN.length >= 32 ? env.TAREAS_TOKEN : null,
    broadcasterLoop: env.RUN_BROADCASTER_LOOP !== 'no',
    esploraUrl: (env.ESPLORA_URL ?? DEFAULT_ESPLORA[name]).replace(/\/$/, ''),
    priceUrl: env.PRICE_URL ?? 'https://mempool.space/api/v1/prices',
    arsPriceUrls: {
      criptoya: env.ARS_PRICE_URL ?? 'https://criptoya.com/api/btc/ars/0.1',
      bitso: env.ARS_CHECK_URL ?? 'https://api.bitso.com/v3/ticker/?book=btc_ars',
    },
    port,
    webDist: env.WEB_DIST ?? null,
  });
}
