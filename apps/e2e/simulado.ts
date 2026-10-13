// Prueba de punta a punta del reclamo, en Chromium real, contra una cadena SIMULADA.
// Levanta la API sirviendo la web compilada (mismo origen, CSP estricta), crea un
// regalo efímero, lo reclama desde el navegador y verifica la transacción difundida.
//
//   pnpm --filter @regalale/e2e simulado
//
// Requiere Postgres local (DATABASE_URL) y la web compilada (pnpm --filter @regalale/web build).

import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  deriveBip84Key,
  deriveGift,
  deriveGiftSecrets,
  encodeGiftFragment,
  generateMasterMnemonic,
  getNetwork,
  inspectTransaction,
  masterRootFromMnemonic,
  openGiftWallet,
} from '@regalale/core';
import { chromium } from 'playwright-core';
import { connect, migrate } from '../api/src/db.ts';
import { insertGift } from '../api/src/gifts.ts';
import { startFakeEsplora } from './fake-esplora.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const WEB_DIST = join(ROOT, 'apps', 'web', 'dist');
const SHOTS = join(ROOT, 'apps', 'e2e', 'capturas');
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://regalale:regalale@127.0.0.1:5432/regalale';
const CHROMIUM = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const API_PORT = 8788;
const CHAIN_PORT = 3992;

function fail(message: string): never {
  throw new Error(`FALLÓ: ${message}`);
}

async function waitFor(url: string, timeoutMs = 15_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // todavía arrancando
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  fail(`no respondió ${url}`);
}

if (!existsSync(join(WEB_DIST, 'index.html'))) fail('falta la web compilada: pnpm --filter @regalale/web build');
mkdirSync(SHOTS, { recursive: true });

const signet = getNetwork('signet');
// Regalo efímero, independiente del regalo de prueba fondeado en signet.
const root = masterRootFromMnemonic(generateMasterMnemonic());
const secrets = deriveGiftSecrets(root, 0, 'es');
const giftWallet = openGiftWallet(secrets.entropy, secrets.passphraseWords, 'es', signet);
const destination = deriveBip84Key(masterRootFromMnemonic(generateMasterMnemonic()), signet, 0, 0).address;
const AMOUNT = 120_000n;

const chain = await startFakeEsplora(CHAIN_PORT, [{ address: giftWallet.address, amount: AMOUNT }]);
const sql = connect(DATABASE_URL);
await migrate(sql);
const gift = await insertGift(sql, {
  network: 'signet',
  address: giftWallet.address,
  lang: 'es',
  occasion: 'cumple',
  to: 'Tomi',
  from: 'Rodo',
  message: 'Los verdaderos amigos son escasos. Bitcoin también.',
  currency: 'USD',
  amount: 25,
  usdPerBtc: 80_000,
});

let api: ChildProcess | null = null;
let newGiftId: string | null = null;
const browser = await chromium.launch({ executablePath: CHROMIUM });
const problems: string[] = [];
try {
  api = spawn(process.execPath, [join(ROOT, 'apps', 'api', 'src', 'main.ts')], {
    env: { ...process.env, PORT: String(API_PORT), ESPLORA_URL: chain.url, PRICE_URL: `${chain.url}/v1/prices`, DATABASE_URL, WEB_DIST },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  await waitFor(`http://127.0.0.1:${API_PORT}/api/salud`);

  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'es-AR' });
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`consola ${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`error de página: ${e.message}`));
  const shot = (name: string) => page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });

  const link = `http://127.0.0.1:${API_PORT}/r/${gift.id}#${encodeGiftFragment(secrets.entropy)}`;
  const response = await page.goto(link);
  const csp = response?.headers()['content-security-policy'] ?? '';
  if (!csp.includes("script-src 'self'")) fail('la página no trae la CSP estricta');

  await page.getByRole('heading', { name: 'Rodo te hizo un regalo' }).waitFor();
  if (page.url().includes('#')) fail('la semilla quedó en la barra de direcciones');
  await page.getByText('120.000 sats').waitFor();
  await page.getByText('Valía US$ 25,00 cuando te lo regalaron. Hoy vale US$ 120.').waitFor();
  await page.getByText('Red de prueba (signet)').waitFor();
  await shot('1-regalo');
  await page.getByRole('button', { name: 'Recibir mi regalo' }).click();

  await page.getByRole('heading', { name: 'Escribí las 4 palabras' }).waitFor();
  // Primero palabras equivocadas: tiene que avisar sin romper nada.
  const wrong = [...secrets.passphraseWords].reverse();
  for (let i = 0; i < 4; i++) await page.getByLabel(`Palabra ${i + 1}`).fill(wrong[i] as string);
  if (wrong.join() !== secrets.passphraseWords.join()) {
    await page.getByRole('button', { name: 'Seguir' }).click();
    await page.getByText('No encontramos fondos con esas palabras, revisalas.').waitFor();
    await shot('2-palabras-equivocadas');
  }
  // Ahora las correctas, la primera en mayúsculas para probar la normalización.
  for (let i = 0; i < 4; i++) {
    const w = secrets.passphraseWords[i] as string;
    await page.getByLabel(`Palabra ${i + 1}`).fill(i === 0 ? w.toUpperCase() : w);
  }
  await shot('3-palabras');
  await page.getByRole('button', { name: 'Seguir' }).click();

  await page.getByRole('heading', { name: '¿Tenés una billetera de Bitcoin?' }).waitFor();
  await shot('4-billetera');
  await page.getByRole('button', { name: 'No, todavía no' }).click();
  await page.getByRole('heading', { name: 'Creá tu billetera' }).waitFor();
  await shot('5-guia');
  await page.getByLabel('Ya anoté mis 12 palabras en papel').check();
  await page.getByRole('button', { name: 'Ya tengo mi dirección' }).click();

  await page.getByRole('heading', { name: 'Pegá tu dirección' }).waitFor();
  await page.getByLabel('Dirección de tu billetera').fill('bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu');
  await page.getByText('Esa dirección es de otra red de Bitcoin').waitFor();
  await page.getByLabel('Dirección de tu billetera').fill(giftWallet.address);
  await page.getByText('Esa es la dirección del regalo').waitFor();
  await page.getByLabel('Dirección de tu billetera').fill(destination);
  await page.getByLabel('Coincide con mi billetera').check();
  await shot('6-direccion');
  await page.getByRole('button', { name: 'Seguir' }).click();

  await page.getByRole('heading', { name: 'Confirmá' }).waitFor();
  await page.getByText(/Vas a recibir 119\.\d{3} sats/).waitFor();
  await shot('7-confirmar');
  await page.getByRole('button', { name: 'Recibir', exact: true }).click();

  await page.getByRole('heading', { name: '¡Listo!' }).waitFor();
  await shot('8-listo');

  // Verificaciones del lado de la "red" y del servidor.
  if (chain.rejected.length > 0) fail('la cadena simulada rechazó una firma');
  if (chain.broadcasts.length !== 1) fail(`se esperaba 1 difusión y hubo ${chain.broadcasts.length}`);
  const tx = inspectTransaction(chain.broadcasts[0] as string);
  if (tx.outputs.length !== 1) fail('el barrido no tiene una sola salida');
  const fee = AMOUNT - (tx.outputs[0]?.amount ?? 0n);
  if (fee <= 0n || fee > 1_000n) fail(`comisión inesperada: ${fee}`);
  const state = (await (await fetch(`http://127.0.0.1:${API_PORT}/api/gifts/${gift.id}`)).json()) as { estado: string; reclamo: { txid: string } };
  if (state.estado !== 'reclamado' || state.reclamo.txid !== tx.txid) fail(`estado del regalo: ${state.estado}`);

  await page.reload();
  await page.getByText('Este link no está completo').waitFor();

  // ── Regalar: los 5 pasos, el código de recuperación, el pago y el reclamo del regalo nuevo ──
  await page.goto(`http://127.0.0.1:${API_PORT}/`);
  await page.getByRole('link', { name: 'Regalar bitcoin' }).click();
  await page.getByRole('heading', { name: '¿Qué ocasión es?' }).waitFor();
  await shot('r1-ocasion');
  await page.getByRole('button', { name: 'Navidad' }).click();

  await page.getByRole('heading', { name: '¿Para quién es?' }).waitFor();
  if ((await page.getByLabel('Tu mensaje').inputValue()) !== '¡Feliz Navidad! Un regalo chiquito para guardar mucho tiempo.') {
    fail('no sugirió el mensaje de la ocasión');
  }
  await page.getByLabel('Su nombre').fill('Ana');
  await page.getByLabel('Tu nombre (opcional)').fill('Rodo');
  await page.getByLabel('Tu mensaje').fill('x'.repeat(281));
  await page.getByText('Te pasaste por 1 caracteres.').waitFor();
  await page.getByLabel('Tu mensaje').fill('Feliz Navidad, Ana. 🎄');
  await page.getByRole('button', { name: 'Imagen 3' }).click();
  await page.getByLabel('Idioma de quien lo recibe').selectOption('pt');
  await shot('r2-para');
  await page.getByRole('button', { name: 'Seguir' }).click();

  await page.getByRole('heading', { name: '¿Cuánto querés regalar?' }).waitFor();
  // Otro monto en castellano: el punto es de miles y la coma, de decimales.
  await page.getByRole('button', { name: 'Otro monto' }).click();
  await page.getByLabel('Monto', { exact: true }).fill('1.5');
  await page.getByText('No entendimos el número. Escribilo así: US$ 1.234,50.').waitFor();
  await page.getByLabel('Monto', { exact: true }).fill('150');
  await page.getByText('Durante la prueba, el máximo por regalo es US$ 100.').waitFor();
  await page.getByLabel('Monto', { exact: true }).fill('30,5');
  await page.getByText('Vas a regalar US$ 30,50.').waitFor();
  await page.getByText('Hoy equivale a 30.500 sats.').waitFor();
  await shot('r3-cuanto');
  await page.getByRole('button', { name: 'Seguir' }).click();

  await page.getByRole('heading', { name: 'Tu código de recuperación de regalos' }).waitFor();
  const code = (await page.locator('.codigo li').allInnerTexts()).map((t) => t.replace(/^\d+\s*/, '').trim());
  if (code.length !== 12) fail(`el código tiene ${code.length} palabras`);
  await shot('r4-codigo');
  await page.getByLabel('Lo anoté en papel').check();
  await page.getByRole('button', { name: 'Seguir' }).click();

  await page.getByRole('heading', { name: 'Revisemos que lo anotaste bien' }).waitFor();
  const asked = page.getByLabel(/^Palabra \d+$/);
  for (let i = 0; i < (await asked.count()); i++) {
    const field = asked.nth(i);
    const n = Number((await field.evaluate((el) => el.closest('label')?.querySelector('span')?.textContent ?? '')).replace(/\D/g, ''));
    await field.fill(i === 0 ? 'mal' : (code[n - 1] as string));
  }
  await page.getByRole('button', { name: 'Seguir' }).click();
  await page.getByText('Alguna no coincide.').waitFor();
  const first = asked.nth(0);
  const n0 = Number((await first.evaluate((el) => el.closest('label')?.querySelector('span')?.textContent ?? '')).replace(/\D/g, ''));
  await first.fill((code[n0 - 1] as string).toUpperCase());
  await page.getByRole('button', { name: 'Seguir' }).click();

  await page.getByRole('heading', { name: 'Pagá 30.500 sats' }).waitFor();
  await page.getByRole('img', { name: 'Código QR para pagar el regalo' }).waitFor();
  await page.getByText('Esperando tu pago.').waitFor();
  const payAddress = (await page.locator('.direccion-completa').innerText()).replace(/\s/g, '');
  await shot('r5-pagar');
  // La dirección de pago sale del código de recuperación: índice 0, palabras en portugués.
  const expected = deriveGift(masterRootFromMnemonic(code.join(' ')), 0, 'pt', signet);
  if (payAddress !== expected.address) fail('la dirección de pago no corresponde al código de recuperación');

  // Llega menos de lo pedido, en la mempool: avisa y deja seguir.
  chain.pay(payAddress, 20_000n, false);
  await page.getByText('Llegaron 20.000 sats de 30.500 sats.').waitFor({ timeout: 15_000 });
  chain.pay(payAddress, 10_500n, false);
  await page.getByRole('heading', { name: '¡Pago recibido! Mandá el regalo' }).waitFor({ timeout: 15_000 });
  await page.getByText('La red está confirmando el pago').waitFor();
  const giftLink = await page.locator('.enlace-regalo').innerText();
  const giftWords = await page.locator('.palabras-regalo li').allInnerTexts();
  if (giftWords.join(' ') !== expected.passphraseWords.join(' ')) fail('las palabras mostradas no son las del regalo');
  if (!giftLink.includes('#1')) fail('el link no lleva la semilla en el fragmento');
  await page.getByRole('link', { name: 'WhatsApp' }).first().evaluate((a) => a.removeAttribute('target'));
  const waHref = await page.getByRole('link', { name: 'WhatsApp' }).first().getAttribute('href');
  if (waHref === null || !decodeURIComponent(waHref).includes('Ana, eu te dei um presente')) fail('el mensaje del link no está en el idioma de quien recibe');
  if (decodeURIComponent(waHref).includes(giftWords[0] as string)) fail('el mensaje del link incluye las palabras');
  chain.confirmAll();
  await page.getByText('El pago está confirmado: el regalo ya se puede abrir.').waitFor({ timeout: 15_000 });
  await shot('r6-mandar');
  const created = (await sql`select id, para, de, idioma, ocasion, imagen, moneda, monto, sats_esperados from regalos where direccion = ${payAddress}`)[0];
  if (created === undefined || created.para !== 'Ana' || created.idioma !== 'pt' || created.imagen !== 3 || created.sats_esperados !== '30500') {
    fail(`el regalo quedó mal registrado: ${JSON.stringify(created)}`);
  }
  newGiftId = created.id as string;

  // Quien recibe abre el link y reclama con las palabras en portugués.
  const receiver = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'pt-BR' });
  receiver.on('pageerror', (e) => problems.push(`error de página (recibe): ${e.message}`));
  await receiver.goto(giftLink);
  await receiver.getByRole('heading', { name: 'Rodo te deu um presente' }).waitFor();
  await receiver.getByText('30.500 sats').waitFor();
  await receiver.getByRole('button', { name: 'Receber meu presente' }).click();
  for (let i = 0; i < 4; i++) await receiver.getByLabel(`Palavra ${i + 1}`).fill(giftWords[i] as string);
  await receiver.getByRole('button', { name: 'Continuar' }).click();
  await receiver.getByRole('button', { name: /Sim/ }).click();
  await receiver.getByLabel('Endereço da sua carteira').fill(destination);
  await receiver.getByRole('checkbox').check();
  await receiver.getByRole('button', { name: 'Continuar' }).click();
  await receiver.getByRole('button', { name: 'Receber', exact: true }).click();
  await receiver.getByRole('heading', { name: 'Pronto!' }).waitFor();
  if ((chain.broadcasts.length as number) !== 2) fail(`se esperaban 2 difusiones y hubo ${chain.broadcasts.length}`);
  const tx2 = inspectTransaction(chain.broadcasts[1] as string);
  if (tx2.inputs.length !== 2) fail('el barrido del regalo nuevo no gasta los dos pagos');

  if (problems.length > 0) fail(`problemas en el navegador:\n${problems.join('\n')}`);
  console.log(`OK: reclamo simulado de punta a punta. txid ${tx.txid}, comisión ${fee} sats, ${tx.vsize} vB.`);
  console.log(`OK: regalar en 5 pasos, pago en dos partes, link y palabras en portugués, reclamo. txid ${tx2.txid}.`);
  console.log(`Capturas en ${SHOTS}`);
} finally {
  await browser.close();
  api?.kill();
  await chain.close();
  await sql`delete from regalos where id = ${gift.id}`;
  if (newGiftId !== null) await sql`delete from regalos where id = ${newGiftId}`;
  await sql.end();
}
