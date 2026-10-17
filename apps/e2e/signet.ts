// Prueba de punta a punta del reclamo EN SIGNET REAL: el regalo de prueba fondeado
// (.dev/dev-gifts.json) se reclama desde Chromium y el barrido se difunde por
// mempool.space. Los fondos vuelven a la billetera de la clave maestra de prueba
// (m/84'/1'/0'/0/0), para reusarlos en el próximo regalo.
//
//   pnpm --filter @regalale/e2e signet
//
// Requiere acceso de red a mempool.space, Postgres local y la web compilada.

import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deriveBip84Key, getNetwork, masterRootFromMnemonic } from '@regalale/core';
import { chromium } from 'playwright-core';
import { loadDevState } from '../api/scripts/dev-gift.ts';
import { connect, migrate } from '../api/src/db.ts';
import { insertGift } from '../api/src/gifts.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const WEB_DIST = join(ROOT, 'apps', 'web', 'dist');
const SHOTS = join(ROOT, 'apps', 'e2e', 'capturas', 'signet');
const ESPLORA = 'https://mempool.space/signet/api';
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://regalale:regalale@127.0.0.1:5432/regalale';
const CHROMIUM = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const API_PORT = 8789;

function stop(code: number, message: string): never {
  console.error(message);
  process.exit(code);
}

const state = loadDevState();
const giftSecrets = state?.gifts.at(-1);
if (state === null || giftSecrets === undefined) stop(1, 'No hay regalo de prueba: node apps/api/scripts/dev-gift.ts');
if (!existsSync(join(WEB_DIST, 'index.html'))) stop(1, 'Falta la web compilada: pnpm --filter @regalale/web build');

try {
  await fetch(`${ESPLORA}/blocks/tip/height`, { signal: AbortSignal.timeout(10_000) }).then((r) => {
    if (!r.ok) throw new Error(String(r.status));
  });
} catch (error) {
  stop(2, `Sin acceso a mempool.space (${(error as Error).message}). Hace falta habilitar ese dominio en la red del entorno.`);
}
const utxos = (await (await fetch(`${ESPLORA}/address/${giftSecrets.address}/utxo`)).json()) as Array<{ value: number; status: { confirmed: boolean } }>;
const confirmed = utxos.filter((u) => u.status.confirmed).reduce((a, u) => a + u.value, 0);
if (confirmed === 0) {
  const pending = utxos.reduce((a, u) => a + u.value, 0);
  stop(3, pending > 0 ? `El regalo tiene ${pending} sats sin confirmar: esperá el próximo bloque.` : `El regalo ${giftSecrets.address} no tiene fondos todavía.`);
}

const signet = getNetwork('signet');
const destination = deriveBip84Key(masterRootFromMnemonic(state.masterMnemonic), signet, 0, 0).address;
mkdirSync(SHOTS, { recursive: true });

const sql = connect(DATABASE_URL);
await migrate(sql);
const existing = await sql<{ id: string }[]>`select id from regalos where direccion = ${giftSecrets.address}`;
const giftId =
  existing[0]?.id ??
  (
    await insertGift(sql, {
      network: 'signet',
      address: giftSecrets.address,
      lang: giftSecrets.lang,
      occasion: 'cumple',
      to: 'Tomi',
      from: 'Rodo',
      message: 'Los verdaderos amigos son escasos. Bitcoin también.',
      currency: 'USD',
      amount: 25,
    })
  ).id;
await sql.end();

let api: ChildProcess | null = null;
const browser = await chromium.launch({ executablePath: CHROMIUM });
try {
  api = spawn(process.execPath, [join(ROOT, 'apps', 'api', 'src', 'main.ts')], {
    env: { ...process.env, PORT: String(API_PORT), DATABASE_URL, WEB_DIST, ESPLORA_URL: ESPLORA },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  for (let i = 0; i < 75; i++) {
    if (await fetch(`http://127.0.0.1:${API_PORT}/api/salud`).then((r) => r.ok).catch(() => false)) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'es-AR' });
  const shot = (name: string) => page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
  await page.goto(`http://127.0.0.1:${API_PORT}/r/${giftId}#${giftSecrets.fragment}`);
  await page.getByRole('button', { name: 'Recibir mi regalo' }).waitFor({ timeout: 20_000 });
  await shot('1-regalo');
  await page.getByRole('button', { name: 'Recibir mi regalo' }).click();
  for (let i = 0; i < 4; i++) await page.getByLabel(`Palabra ${i + 1}`).fill(giftSecrets.words[i] as string);
  await page.getByRole('button', { name: 'Seguir' }).click();
  await page.getByRole('button', { name: 'Sí, tengo una' }).click();
  await page.getByLabel('Dirección de tu billetera').fill(destination);
  await page.getByLabel('Coincide con mi billetera').check();
  await page.getByRole('button', { name: 'Seguir' }).click();
  await page.getByText(/Vas a recibir/).waitFor({ timeout: 20_000 });
  await shot('2-confirmar');
  await page.getByRole('button', { name: 'Recibir', exact: true }).click();
  await page.getByRole('heading', { name: '¡Listo!' }).waitFor({ timeout: 30_000 });
  await shot('3-listo');
  const gift = (await (await fetch(`http://127.0.0.1:${API_PORT}/api/gifts/${giftId}`)).json()) as { estado: string; reclamo: { txid: string } | null };
  if (gift.estado !== 'reclamado' || gift.reclamo === null) stop(4, `Estado inesperado: ${gift.estado}`);
  const seen = await fetch(`${ESPLORA}/tx/${gift.reclamo.txid}`);
  console.log(`OK: regalo reclamado en signet. txid ${gift.reclamo.txid} (${seen.ok ? 'visto en la red' : 'todavía no indexado'})`);
  console.log(`https://mempool.space/signet/tx/${gift.reclamo.txid}`);
} finally {
  await browser.close();
  api?.kill();
}
