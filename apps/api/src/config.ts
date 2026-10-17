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
  /** Respaldo con la API de Blockstream si la principal falla o limita (ESPLORA_FALLBACK_URL, 'no' lo apaga). */
  readonly esploraFallbackUrl: string | null;
  /** Endpoint de precios de mempool.space (/api/v1/prices). */
  readonly priceUrl: string;
  /** BTC/ARS: CriptoYa (exchanges locales) y Bitso como control. */
  readonly arsPriceUrls: { readonly criptoya: string; readonly bitso: string };
  readonly port: number;
  /** URL pública de la web (para los links de los mails) y orígenes aceptados para passkeys. */
  readonly publicUrl: string;
  readonly allowedOrigins: readonly string[];
  readonly mailFrom: string;
  readonly resendApiKey: string | null;
  readonly cookieSecure: boolean;
  /** Techo por regalo en dólares (TOPE_USD); en mainnet lo acota MAINNET_CEILING_USD. */
  readonly ceilingUsd: number | undefined;
  /** Mails con acceso al panel de administración (ADMIN_EMAILS, separados por coma). */
  readonly adminEmails: readonly string[];
  /** Carpeta con la web compilada (apps/web/dist), si la sirve esta misma API. */
  readonly webDist: string | null;
}

const DEFAULT_ESPLORA: Readonly<Record<NetworkName, string>> = {
  mainnet: 'https://mempool.space/api',
  testnet: 'https://mempool.space/testnet4/api',
  signet: 'https://mempool.space/signet/api',
  regtest: 'http://127.0.0.1:3002',
};

// Blockstream solo para mainnet: su testnet es testnet3 (acá testnet4) y no tiene signet.
const DEFAULT_FALLBACK: Readonly<Record<NetworkName, string | null>> = {
  mainnet: 'https://blockstream.info/api',
  testnet: null,
  signet: null,
  regtest: null,
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const name = (env.NETWORK ?? 'signet') as NetworkName;
  // Mainnet solo con autorización explícita del responsable del proyecto.
  const network = getNetwork(name, { allowMainnet: env.ALLOW_MAINNET === 'autorizado' });
  if (env.TOPE_USD !== undefined && !(Number(env.TOPE_USD) > 0)) throw new Error(`TOPE_USD inválido: ${env.TOPE_USD}`);
  // En mainnet, sin mailer real los links de acceso al panel irían a los logs.
  if (name === 'mainnet' && !env.RESEND_API_KEY) throw new Error('En mainnet hace falta RESEND_API_KEY.');
  const port = Number(env.PORT ?? 8787);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) throw new Error(`PORT inválido: ${env.PORT}`);
  const publicUrl = (env.PUBLIC_URL ?? `http://localhost:${port}`).replace(/\/$/, '');
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
    esploraFallbackUrl: env.ESPLORA_FALLBACK_URL === 'no' ? null : (env.ESPLORA_FALLBACK_URL ?? DEFAULT_FALLBACK[name])?.replace(/\/$/, '') ?? null,
    priceUrl: env.PRICE_URL ?? 'https://mempool.space/api/v1/prices',
    arsPriceUrls: {
      criptoya: env.ARS_PRICE_URL ?? 'https://criptoya.com/api/btc/ars/0.1',
      bitso: env.ARS_CHECK_URL ?? 'https://api.bitso.com/v3/ticker/?book=btc_ars',
    },
    port,
    publicUrl,
    allowedOrigins: [publicUrl, ...(env.ALLOWED_ORIGINS ?? '').split(',').map((o) => o.trim()).filter((o) => o !== '')],
    mailFrom: env.MAIL_FROM ?? 'RegalaleBitcoin <onboarding@resend.dev>',
    resendApiKey: env.RESEND_API_KEY !== undefined && env.RESEND_API_KEY !== '' ? env.RESEND_API_KEY : null,
    cookieSecure: env.COOKIE_SECURE === undefined ? publicUrl.startsWith('https://') : env.COOKIE_SECURE !== 'no',
    adminEmails: (env.ADMIN_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter((e) => e !== ''),
    ceilingUsd: env.TOPE_USD === undefined ? undefined : Number(env.TOPE_USD),
    webDist: env.WEB_DIST ?? null,
  });
}
