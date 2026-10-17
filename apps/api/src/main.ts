import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { createApp } from './app.ts';
import { startBroadcaster } from './broadcaster.ts';
import { arsPriceClient, esploraClient, priceClient } from './chain.ts';
import { loadConfig } from './config.ts';
import { connect, migrate } from './db.ts';
import { consoleMailer, resendMailer } from './mail.ts';
import { securityHeaders } from './security.ts';

const config = loadConfig();
const sql = connect(config.databaseUrl, config.databaseSocket);
const applied = await migrate(sql);
if (applied.length > 0) console.log(`Migraciones aplicadas: ${applied.join(', ')}`);

const chain = esploraClient(config.esploraUrl);
const app = createApp({ sql, chain, price: priceClient(config.priceUrl), arsPrice: arsPriceClient(config.arsPriceUrls), accounts: { origins: config.allowedOrigins, publicUrl: config.publicUrl, mailer: config.resendApiKey === null ? consoleMailer : resendMailer(config.resendApiKey, config.mailFrom), cookieSecure: config.cookieSecure }, network: config.network, tasksToken: config.tasksToken, ...(config.ceilingUsd === undefined ? {} : { ceilingUsd: config.ceilingUsd }) });

if (config.webDist !== null) {
  // La web compilada se sirve desde el mismo origen que la API, con cabeceras estrictas.
  app.use('*', securityHeaders());
  app.use('/assets/*', serveStatic({ root: config.webDist }));
  app.get('*', serveStatic({ root: config.webDist, path: 'index.html' }));
}

if (config.broadcasterLoop) startBroadcaster({ sql, chain, network: config.network });

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`API de RegalaleBitcoins en http://localhost:${info.port} (red: ${config.network.name}, cadena: ${config.esploraUrl})`);
});
