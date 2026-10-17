import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { createApp } from './app.ts';
import { startBroadcaster } from './broadcaster.ts';
import { arsPriceClient, cachedFees, esploraClient, fallbackChain, priceClient } from './chain.ts';
import { loadConfig } from './config.ts';
import { connect, migrate } from './db.ts';
import { consoleMailer, resendMailer } from './mail.ts';
import { securityHeaders } from './security.ts';

const config = loadConfig();
const sql = connect(config.databaseUrl, config.databaseSocket);
const applied = await migrate(sql);
if (applied.length > 0) console.log(`Migraciones aplicadas: ${applied.join(', ')}`);

const primary = esploraClient(config.esploraUrl);
const chain = cachedFees(
  config.esploraFallbackUrl === null
    ? primary
    : fallbackChain(primary, esploraClient(config.esploraFallbackUrl, fetch, 10_000, 'blockstream'), (method, error) =>
        console.warn(`Cadena: ${method} con respaldo (${(error as Error).message.slice(0, 120)})`),
      ),
);
const app = createApp({ sql, chain, price: priceClient(config.priceUrl), arsPrice: arsPriceClient(config.arsPriceUrls), accounts: { origins: config.allowedOrigins, publicUrl: config.publicUrl, mailer: config.resendApiKey === null ? consoleMailer : resendMailer(config.resendApiKey, config.mailFrom), cookieSecure: config.cookieSecure }, network: config.network, tasksToken: config.tasksToken, adminEmails: config.adminEmails, ...(config.ceilingUsd === undefined ? {} : { ceilingUsd: config.ceilingUsd }) });

if (config.webDist !== null) {
  // La web compilada se sirve desde el mismo origen que la API, con cabeceras estrictas.
  app.use('*', securityHeaders());
  app.use('/assets/*', serveStatic({ root: config.webDist }));
  app.get('*', serveStatic({ root: config.webDist, path: 'index.html' }));
}

if (config.broadcasterLoop) startBroadcaster({ sql, chain, network: config.network });

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`API de RegalaleBitcoins en http://localhost:${info.port} (red: ${config.network.name}, cadena: ${config.esploraUrl}${config.esploraFallbackUrl === null ? '' : `, respaldo: ${config.esploraFallbackUrl}`})`);
});
