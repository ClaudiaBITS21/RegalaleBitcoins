// Herramienta sin conexión: abierta desde el disco y sin red, tiene que dar la misma dirección
// que el regalo, tanto con link + 4 palabras como con el código de recuperación.
//   node apps/e2e/sin-conexion.ts   (después de: vite build -c vite.offline.config.ts)
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { deriveGift, encodeGiftFragment, generateMasterMnemonic, getNetwork, masterRootFromMnemonic } from '@regalale/core';
import { chromium } from 'playwright-core';

const FILE = join(dirname(fileURLToPath(import.meta.url)), '..', 'web', 'dist-offline', 'offline.html');
const signet = getNetwork('signet');
const master = generateMasterMnemonic();
const gift = deriveGift(masterRootFromMnemonic(master), 3, 'es', signet);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium' });
const context = await browser.newContext({ offline: true, locale: 'es-AR' });
const requests: string[] = [];
context.on('request', (r) => {
  if (!r.url().startsWith('file:')) requests.push(r.url());
});
const page = await context.newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(pathToFileURL(FILE).href);
await page.getByRole('heading', { name: 'Abrir un regalo' }).waitFor();
await page.getByLabel('Red').selectOption('signet');
await page.getByLabel('Link del regalo').fill(`https://regalalebitcoin.com/r/abc#${encodeGiftFragment(gift.entropy)}`);
for (const [i, w] of gift.passphraseWords.entries()) await page.getByLabel(`Palabra ${i + 1}`, { exact: true }).fill(w);
await page.getByRole('button', { name: 'Calcular' }).click();
const opened = await page.locator('section').first().locator('code').allInnerTexts();
if (!opened.includes(gift.address) || !opened.includes(gift.mnemonic)) throw new Error(`abrir: no coincide (${opened.join(' | ')})`);

await page.getByLabel('Tu código de recuperación').fill(master);
await page.getByLabel('Idioma de quien recibió').selectOption('es');
await page.getByRole('button', { name: 'Listar mis regalos' }).click();
if (!(await page.locator('.regalos li').nth(3).innerText()).includes(gift.address)) throw new Error('recuperar: el regalo #3 no tiene la dirección esperada');
await page.screenshot({ path: join(dirname(fileURLToPath(import.meta.url)), 'capturas', 'sin-conexion.png'), fullPage: true });
await browser.close();
if (errors.length > 0 || requests.length > 0) throw new Error(`errores: ${errors.join('; ')} pedidos: ${requests.join(', ')}`);
console.log('OK: herramienta sin conexión: abre el regalo con link y palabras, y lo encuentra con el código de recuperación, sin red.');
