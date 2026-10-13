// Capturas de las pantallas principales (celular y compu) contra la cadena simulada, con
// la misma CSP que en producción. Para revisar el diseño: no es una prueba.
//   node apps/e2e/vistas.ts

import { type ChildProcess, spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { startFakeEsplora } from './fake-esplora.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'apps', 'e2e', 'capturas', 'vistas');
const CHROMIUM = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://regalale:regalale@127.0.0.1:5432/regalale';
const PORT = 8789;
mkdirSync(OUT, { recursive: true });

const chain = await startFakeEsplora(3993, []);
const api: ChildProcess = spawn(process.execPath, [join(ROOT, 'apps', 'api', 'src', 'main.ts')], {
  env: { ...process.env, PORT: String(PORT), ESPLORA_URL: chain.url, PRICE_URL: `${chain.url}/v1/prices`, ARS_PRICE_URL: `${chain.url}/ars/criptoya`, ARS_CHECK_URL: `${chain.url}/ars/bitso`, DATABASE_URL, WEB_DIST: join(ROOT, 'apps', 'web', 'dist') },
  stdio: 'ignore',
});
const browser = await chromium.launch({ executablePath: CHROMIUM });
const problems: string[] = [];
try {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${PORT}/api/salud`)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  const base = `http://127.0.0.1:${PORT}`;
  for (const [name, viewport] of [['celu', { width: 390, height: 844 }], ['compu', { width: 1366, height: 860 }]] as const) {
    const page = await browser.newPage({ viewport, locale: 'es-AR', reducedMotion: 'reduce' });
    page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && problems.push(`${name}: ${m.text()}`));
    page.on('pageerror', (e) => problems.push(`${name}: ${e.message}`));
    await page.goto(base + '/');
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(OUT, `${name}-home.png`), fullPage: true });
    await page.getByRole('button', { name: 'Más ocasiones +' }).click();
    await page.getByLabel('Buscá una ocasión').fill('mudanza');
    await page.getByRole('button', { name: 'Usar “mudanza” como ocasión' }).click();
    await page.locator('#razones').scrollIntoViewIfNeeded();
    await page.getByRole('button', { name: 'Razón siguiente' }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(OUT, `${name}-home-interaccion.png`), fullPage: true });
    if (name === 'celu') {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.getByRole('button', { name: 'Menú' }).first().click();
      await page.screenshot({ path: join(OUT, `${name}-menu.png`) });
    } else {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.getByRole('button', { name: 'Recibir' }).click();
      await page.screenshot({ path: join(OUT, `${name}-menu.png`) });
    }
    await page.goto(base + '/regalar?ocasion=otra&libre=Mudanza');
    await page.getByRole('heading', { name: '¿Para quién es?' }).waitFor();
    await page.screenshot({ path: join(OUT, `${name}-regalar.png`), fullPage: true });
    await page.goto(base + '/abrir');
    await page.screenshot({ path: join(OUT, `${name}-abrir.png`), fullPage: true });
    await page.close();
  }
  console.log(problems.length ? `Problemas:\n${problems.join('\n')}` : 'Sin errores en consola.');
  console.log(`Capturas en ${OUT}`);
} finally {
  await browser.close();
  api.kill();
  await chain.close();
}
