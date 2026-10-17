import zlib from 'node:zlib';
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
  accountKeyText,
  deriveBip84Key,
  deriveListAddress,
  parseAccountKey,
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
// WebAuthn no acepta IPs como dominio: todo por localhost (contexto seguro).
const BASE = `http://localhost:${API_PORT}`;
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
    env: { ...process.env, PORT: String(API_PORT), ESPLORA_URL: chain.url, PRICE_URL: `${chain.url}/v1/prices`, ARS_PRICE_URL: `${chain.url}/ars/criptoya`, ARS_CHECK_URL: `${chain.url}/ars/bitso`, PUBLIC_URL: BASE, COOKIE_SECURE: 'no', DATABASE_URL, WEB_DIST },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  await waitFor(`${BASE}/api/salud`);

  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'es-AR' });
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`consola ${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`error de página: ${e.message}`));
  const shot = (name: string) => page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
  const shot2 = (p: typeof page, name: string) => p.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });

  const link = `${BASE}/r/${gift.id}#${encodeGiftFragment(secrets.entropy)}`;
  const response = await page.goto(link);
  const csp = response?.headers()['content-security-policy'] ?? '';
  if (!csp.includes("script-src 'self'")) fail('la página no trae la CSP estricta');

  await page.getByRole('heading', { name: 'Rodo te hizo un regalo' }).waitFor();
  if (page.url().includes('#')) fail('la semilla quedó en la barra de direcciones');
  await page.getByText('120.000 sats', { exact: true }).waitFor();
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
  const state = (await (await fetch(`${BASE}/api/gifts/${gift.id}`)).json()) as { estado: string; reclamo: { txid: string } };
  if (state.estado !== 'reclamado' || state.reclamo.txid !== tx.txid) fail(`estado del regalo: ${state.estado}`);

  await page.reload();
  await page.getByText('Este link no está completo').waitFor();

  // ── Regalar: los 5 pasos, el código de recuperación, el pago y el reclamo del regalo nuevo ──
  await page.goto(`${BASE}/`);
  await page.getByRole('link', { name: 'Regalar bitcoin' }).click();
  await page.waitForURL('**/regalar');
  await page.getByRole('heading', { name: '¿Qué ocasión es?' }).waitFor();
  await shot('r1-ocasion');
  await page.getByRole('button', { name: 'Navidad', exact: true }).click();
  await page.getByRole('button', { name: 'Seguir' }).click();

  await page.getByRole('heading', { name: '¿Para quién es?' }).waitFor();
  // El mensaje llega con un ejemplo real de la ocasión; el nombre se completa solo y "Otra idea" lo cambia.
  const msg = page.getByLabel('Tu mensaje');
  await page.waitForFunction(() => (document.querySelector('textarea') as HTMLTextAreaElement | null)?.value !== '');
  await page.getByLabel('Su nombre').fill('Ana');
  const firstExample = await msg.inputValue();
  if (firstExample.includes('{nombre}') || firstExample.includes('…')) fail(`el ejemplo no tomó el nombre: ${firstExample}`);
  await page.getByText('Es un ejemplo: ¿le agregás algo tuyo?').waitFor();
  await page.getByRole('button', { name: 'Otra idea' }).click();
  if ((await msg.inputValue()) === firstExample) fail('"Otra idea" no cambió el ejemplo');
  await msg.fill('Lo escribí yo');
  await page.getByRole('button', { name: 'Otra idea' }).click();
  await page.getByRole('button', { name: 'Deshacer' }).click();
  if ((await msg.inputValue()) !== 'Lo escribí yo') fail('"Deshacer" no recuperó lo escrito');
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
  await page.getByText('Por ahora, el máximo por regalo es US$ 100.').waitFor();
  // En pesos: cotización directa BTC/ARS, con la fuente y la cuenta en letra chica.
  await page.getByRole('button', { name: 'En pesos' }).click();
  await page.getByLabel('Monto', { exact: true }).fill('40.000');
  await page.getByText('Vas a regalar $ 40.000,00.').waitFor();
  await page.getByText('Hoy equivale a 25.000 sats · US$ 25,00.').waitFor();
  await page.getByText('Cotización: 1 BTC = $ 160.000.000,00 (mediana del precio de compra en exchanges argentinos, según CriptoYa). Cálculo: $ 40.000,00 ÷ $ 160.000.000,00 × 100.000.000 = 25.000 sats.').waitFor();
  await shot('r3-cuanto-pesos');
  await page.getByRole('button', { name: 'En dólares' }).click();
  await page.getByLabel('Monto', { exact: true }).fill('30,5');
  await page.getByText('Vas a regalar US$ 30,50.').waitFor();
  await page.getByText('Hoy equivale a 30.500 sats.').waitFor();
  await shot('r3-cuanto');
  await page.getByRole('button', { name: 'Seguir' }).click();

  // Paso 4: sin passkey en este navegador, se elige anotar el código.
  await page.getByRole('heading', { name: 'Guardá tu regalo' }).waitFor();
  await shot('r4-guardar');
  await page.getByRole('button', { name: 'Prefiero anotar un código' }).click();
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
  // El link y las palabras nunca por el mismo canal, en los dos sentidos.
  await page.evaluate(() =>
    document.addEventListener('click', (e) => {
      if ((e.target as Element).closest('a[href^="mailto:"], a[href*="wa.me"]')) e.preventDefault();
    }, true),
  );
  const [linkBox, wordsBox] = [page.locator('.envio').nth(0), page.locator('.envio').nth(1)];
  await wordsBox.getByRole('link', { name: 'Mail' }).click();
  if (!(await linkBox.getByRole('button', { name: 'Mail' }).isDisabled())) fail('mandar las palabras por mail no bloquea el mail para el link');
  await linkBox.getByRole('link', { name: 'WhatsApp' }).click();
  if (!(await wordsBox.getByRole('button', { name: 'WhatsApp' }).isDisabled())) fail('mandar el link por WhatsApp no bloquea WhatsApp para las palabras');
  chain.confirmAll();
  await page.getByText('El pago está confirmado: el regalo ya se puede abrir.').waitFor({ timeout: 15_000 });
  await shot('r6-mandar');
  // Tarjeta imprimible: A4 con cuatro paneles, el QR del link y sin las palabras.
  const remate = page.getByLabel('Frase de la contratapa');
  await page.waitForFunction(() => [...document.querySelectorAll('input')].some((i) => i.closest('.imprimir') && i.value !== ''));
  await remate.fill('visitá regalo.xyz');
  await page.getByText('Sin links ni direcciones web en la contratapa.').waitFor();
  if (!(await page.getByRole('button', { name: 'Imprimir tarjeta' }).isDisabled())) fail('se puede imprimir un remate con un dominio');
  await remate.fill('La llave ahora la tenés vos.');
  await page.emulateMedia({ media: 'print' });
  const sheet = page.locator('.hoja-a4');
  const sheetText = await sheet.innerText();
  if (giftWords.some((w) => sheetText.includes(w))) fail('la tarjeta impresa muestra las palabras');
  if ((await sheet.locator('.panel').count()) !== 4 || (await sheet.locator('.qr').count()) !== 1) fail('la hoja A4 no tiene los cuatro paneles con el QR');
  await page.pdf({ path: join(SHOTS, 'tarjeta-a4.pdf'), format: 'A4', printBackground: true });
  await sheet.screenshot({ path: join(SHOTS, 't1-tarjeta-a4.png') });
  await page.emulateMedia({ media: 'screen' });
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
  await receiver.getByText('30.500 sats', { exact: true }).waitFor();
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

  // ── Paso 4 con passkey (autenticador virtual con PRF), panel y regreso con la passkey ──
  const giver = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'es-AR' });
  giver.on('pageerror', (e) => problems.push(`error de página (passkey): ${e.message}`));
  const cdp = await giver.context().newCDPSession(giver);
  await cdp.send('WebAuthn.enable', { enableUI: false });
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: { protocol: 'ctap2', ctap2Version: 'ctap2_1', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, hasPrf: true, automaticPresenceSimulation: true },
  });
  await giver.goto(`${BASE}/regalar?ocasion=cumple`);
  await giver.getByRole('heading', { name: '¿Para quién es?' }).waitFor();
  await giver.getByLabel('Su nombre').fill('Lupe');
  // Estilo "Con tu IA": el pedido nombra la ocasión y la imagen se sube procesada en el navegador.
  await giver.getByRole('radio', { name: 'Con tu IA' }).click();
  if (!(await giver.locator('.ia-pedido').inputValue()).includes('Cumpleaños')) fail('el pedido para la IA no nombra la ocasión');
  if (!(await giver.getByRole('button', { name: 'Seguir' }).isDisabled())) fail('con "Con tu IA" y sin imagen no debería poder seguir');
  await giver.locator('.ia-subir input[type=file]').setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: testPng(1600, 900) });
  await giver.locator('.ia-vista img').waitFor({ timeout: 10_000 });
  await shot2(giver, 'r2-ia');
  await giver.getByRole('button', { name: 'Seguir' }).click();
  await giver.getByRole('button', { name: 'US$ 25' }).click();
  await giver.getByRole('button', { name: 'Seguir' }).click();
  await giver.getByRole('heading', { name: 'Guardá tu regalo' }).waitFor();
  await giver.getByLabel('Tu mail').fill('lupe.e2e@example.com');
  await giver.getByRole('button', { name: 'Crear mi acceso' }).click();
  await giver.getByRole('heading', { name: 'Pagá 25.000 sats' }).waitFor({ timeout: 20_000 });
  const lupeAddress = (await giver.locator('.direccion-completa').innerText()).replace(/\s/g, '');
  chain.pay(lupeAddress, 25_000n, true);
  await giver.getByRole('heading', { name: '¡Pago recibido! Mandá el regalo' }).waitFor({ timeout: 15_000 });
  const ownImg = await giver.locator('.vista-tarjeta .arte-propia img').evaluate(async (img: HTMLImageElement) => {
    await img.decode().catch(() => undefined);
    return { w: img.naturalWidth, h: img.naturalHeight, src: img.getAttribute('src') };
  });
  if (ownImg.w !== 1024 || ownImg.h !== 800 || !String(ownImg.src).endsWith('/imagen')) fail(`la imagen propia no se muestra bien: ${JSON.stringify(ownImg)}`);
  const stored = (await sql`select i.tipo, r.estilo from imagenes i join regalos r on r.id = i.regalo_id where r.direccion = ${lupeAddress}`)[0];
  if (stored?.tipo !== 'image/webp' || stored.estilo !== 'propia') fail(`imagen propia mal guardada: ${JSON.stringify(stored)}`);
  await shot2(giver, 'r6-mandar-propia');
  const lupeLink = await giver.locator('.enlace-regalo').innerText();
  const lupeWords = await giver.locator('.palabras-regalo li').allInnerTexts();
  const account = (await sql`select r.indice, u.email, c.boveda from regalos r join usuarios u on u.id = r.usuario_id join credenciales c on c.usuario_id = u.id where r.direccion = ${lupeAddress}`)[0];
  if (account === undefined || account.indice !== 0 || account.email !== 'lupe.e2e@example.com' || !String(account.boveda).startsWith('v1.')) {
    fail(`el regalo no quedó en la cuenta con su bóveda: ${JSON.stringify(account)}`);
  }
  if (lupeWords.some((w) => String(account.boveda).includes(w))) fail('la bóveda contiene las palabras en claro');

  await giver.goto(`${BASE}/panel`);
  await giver.getByRole('heading', { name: 'Regalos que hiciste' }).waitFor();
  await giver.getByText('Para Lupe').waitFor();
  await giver.getByText('Listo para abrir').waitFor();
  await giver.getByRole('button', { name: 'Ver link y palabras' }).click();
  await giver.locator('.regalo-secretos').waitFor({ timeout: 15_000 });
  if ((await giver.locator('.regalo-secretos .enlace-regalo').innerText()) !== lupeLink) fail('el panel no reconstruyó el mismo link');
  if ((await giver.locator('.regalo-secretos .palabras-regalo li').allInnerTexts()).join(' ') !== lupeWords.join(' ')) fail('el panel no reconstruyó las mismas palabras');
  await giver.getByRole('button', { name: 'Ver mi código' }).click();
  await giver.locator('.codigo li').first().waitFor();
  await shot2(giver, 'p1-panel');
  await giver.getByRole('button', { name: 'Salir' }).click();
  await giver.getByRole('heading', { name: 'Tus regalos' }).waitFor();
  await giver.getByRole('button', { name: 'Entrar con mi cara o huella' }).click();
  await giver.getByText('Para Lupe').waitFor({ timeout: 15_000 });

  // Passkey huérfana (bug del 17/10): "crear cuenta" con un mail que ya tiene cuenta no llega a
  // crear la passkey en el teléfono y lleva directo a entrar.
  const other = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'es-AR' });
  other.on('pageerror', (e) => problems.push(`error de página (otra passkey): ${e.message}`));
  const cdp2 = await other.context().newCDPSession(other);
  await cdp2.send('WebAuthn.enable', { enableUI: false });
  const { authenticatorId } = (await cdp2.send('WebAuthn.addVirtualAuthenticator', {
    options: { protocol: 'ctap2', ctap2Version: 'ctap2_1', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, hasPrf: true, automaticPresenceSimulation: true },
  })) as { authenticatorId: string };
  await other.goto(`${BASE}/regalar?ocasion=cumple`);
  await other.getByLabel('Su nombre').fill('Nico');
  await other.getByRole('button', { name: 'Seguir' }).click();
  await other.getByRole('button', { name: 'US$ 5' }).click();
  await other.getByRole('button', { name: 'Seguir' }).click();
  await other.getByLabel('Tu mail').fill('LUPE.e2e@example.com');
  await other.getByRole('button', { name: 'Crear mi acceso' }).click();
  await other.getByRole('heading', { name: 'Entrá a tu cuenta' }).waitFor();
  await other.getByText('Ya hay una cuenta con ese mail').waitFor();
  const orphans = (await cdp2.send('WebAuthn.getCredentials', { authenticatorId })) as { credentials: unknown[] };
  if (orphans.credentials.length !== 0) fail('con un mail existente se creó igual una passkey (quedaría huérfana)');
  await other.getByRole('button', { name: 'Entrar con mi cara o huella' }).click();
  await other.getByText(/no encontró tu passkey/).waitFor();
  await other.getByRole('button', { name: 'Crear una cuenta nueva' }).click();
  await other.getByText(/una cuenta nueva no puede recuperar los regalos/).waitFor();
  await shot2(other, 'r4-passkey-salida');
  await other.getByRole('button', { name: 'Entrar con mis 12 palabras' }).click();
  await other.getByRole('heading', { name: /código/i }).first().waitFor();
  await other.close();

  // Lista de regalos: Lupe la arma con la vpub de su billetera; un invitado regala desde otro navegador.
  const vpub = accountKeyText(masterRootFromMnemonic(generateMasterMnemonic()), signet);
  const listAddr = (i: number) => deriveListAddress(parseAccountKey(vpub, signet), i).address;
  await giver.goto(`${BASE}/listas/nueva`);
  await giver.getByRole('heading', { name: 'Armá tu lista de regalos' }).waitFor();
  await giver.getByLabel('Nombre de la lista').fill('Casamiento de Lupe');
  await giver.getByLabel('¿Para quién es la lista?').fill('Lupe y Tomi');
  await giver.getByRole('radio', { name: 'Dos o más' }).click();
  await giver.locator('.selector-ocasiones button, .ocasiones button').filter({ hasText: 'Casamiento' }).first().click();
  await giver.getByText('También acepto transferencias en pesos').click();
  await giver.getByLabel('Alias').fill('Lupe.E2E.mp');
  await giver.getByLabel('Titular de la cuenta').fill('Lupe Pérez');
  if (!(await giver.getByRole('button', { name: 'Seguir' }).isDisabled())) fail('con pesos se puede seguir sin el compromiso de convertir');
  await giver.getByText('Me comprometo a convertir a bitcoin').click();
  await giver.getByRole('button', { name: 'Seguir' }).click();
  await giver.getByRole('heading', { name: '¿Dónde te llegan los regalos?' }).waitFor();
  await giver.getByLabel('Llave pública de prueba (vpub)').fill(vpub);
  const shownFirst = (await giver.locator('.lista-primera .direccion-completa').innerText()).replace(/\s/g, '');
  if (shownFirst !== listAddr(0)) fail(`la primera dirección mostrada no es la de la llave: ${shownFirst}`);
  if (!(await giver.getByRole('button', { name: 'Publicar mi lista' }).isDisabled())) fail('se puede publicar sin confirmar la primera dirección');
  await giver.getByText('Sí, mi billetera muestra esta misma dirección.').click();
  await shot2(giver, 'l1-llave');
  await giver.getByRole('button', { name: 'Publicar mi lista' }).click();
  await giver.getByRole('heading', { name: '¡Tu lista está lista!' }).waitFor();
  const listLink = await giver.locator('.enlace-regalo').innerText();

  const guest = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'es-AR' });
  guest.on('pageerror', (e) => problems.push(`invitado: ${e.message}`));
  await guest.goto(listLink);
  await guest.getByRole('heading', { name: 'Casamiento de Lupe' }).waitFor();
  await shot2(guest, 'l2-invitado');
  await guest.getByRole('button', { name: 'Regalar bitcoin' }).click();
  await guest.getByRole('button', { name: 'US$ 25' }).click();
  await guest.getByRole('button', { name: 'Seguir' }).click();
  await guest.getByLabel('Tu nombre (opcional)').fill('Tía Marta');
  const guestExample = await guest.getByLabel('Tu mensaje (opcional)').inputValue();
  if (!guestExample.includes('Lupe y Tomi')) fail(`el invitado no recibió un ejemplo del mazo con los nombres: ${guestExample}`);
  await guest.getByLabel('Tu mensaje (opcional)').fill('¡Que sean muy felices!');
  await guest.getByRole('button', { name: /^Confirmar y pagar/ }).click();
  await guest.getByRole('heading', { name: 'Pagá 25.000 sats' }).waitFor({ timeout: 15_000 });
  const guestAddr = (await guest.locator('.direccion-completa').innerText()).replace(/\s/g, '');
  if (guestAddr !== listAddr(0)) fail(`la dirección del invitado no sale de la llave de la lista: ${guestAddr}`);
  await shot2(guest, 'l3-pagar');
  chain.pay(guestAddr, 25_000n, true);
  await guest.getByRole('heading', { name: '¡Gracias por tu regalo!' }).waitFor({ timeout: 15_000 });
  const mineLink = await guest.locator('.caja .enlace-regalo').innerText();
  await guest.goto(mineLink);
  await guest.getByRole('heading', { name: 'Tu regalo' }).waitFor();
  await guest.getByText(/Llegó y está confirmado/).waitFor();
  if (await guest.getByText('Casamiento de Lupe').count() === 0) fail('"mi aporte" no muestra la lista');

  await giver.goto(`${BASE}/panel`);
  await giver.getByRole('heading', { name: 'Mis listas' }).waitFor({ timeout: 15_000 });
  await giver.locator('.lista-aportes').getByText('Tía Marta').waitFor();
  await giver.locator('.lista-aportes').getByText('Recibido').waitFor();
  if ((await giver.getByText('alguna dirección no sale de tu llave').count()) > 0) fail('el panel marca como ajena una dirección propia');
  await giver.locator('.mis-listas').screenshot({ path: join(SHOTS, 'l4-panel.png') });

  // Transferencia en pesos: otro invitado anuncia, recibe alias y código; Lupe la marca.
  const cousin = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'es-AR' });
  cousin.on('pageerror', (e) => problems.push(`invitado pesos: ${e.message}`));
  await cousin.goto(listLink);
  await cousin.getByRole('button', { name: 'Transferir pesos' }).click();
  await cousin.getByLabel('Monto en pesos').fill('40.000,5');
  await cousin.getByLabel('Tu nombre (opcional)').fill('Primo Juan');
  await cousin.getByRole('button', { name: /^Voy a transferir .*40\.000,50/ }).click();
  await cousin.getByRole('heading', { name: 'Transferí con estos datos' }).waitFor({ timeout: 15_000 });
  const refCode = (await cousin.locator('.dato-transferencia dd').nth(3).innerText()).trim();
  if (!/^RB-[A-Z2-9]{4}$/.test(refCode)) fail(`código de referencia inválido: ${refCode}`);
  if ((await cousin.locator('.dato-transferencia dd').first().innerText()).trim() !== 'lupe.e2e.mp') fail('el alias no se muestra en minúsculas');
  await shot2(cousin, 'l5-pesos');
  const cousinMine = await cousin.locator('.caja .enlace-regalo').innerText();
  await giver.goto(`${BASE}/panel`);
  const row = giver.locator('.lista-transferencias li').filter({ hasText: refCode });
  await row.getByText('Anunciada').waitFor({ timeout: 15_000 });
  await row.getByRole('button', { name: 'Ya me llegó' }).click();
  await row.getByText('Recibida').waitFor();
  await row.getByRole('button', { name: 'Ya la convertí' }).click();
  await row.getByLabel('Sats que compraste').fill('35.000');
  await row.getByRole('button', { name: 'Confirmar 35.000 sats' }).click();
  await row.getByText('Convertida').waitFor();
  await giver.locator('.mis-listas').screenshot({ path: join(SHOTS, 'l6-panel-pesos.png') });
  await cousin.goto(cousinMine);
  await cousin.getByText(/Ya se convirtió en 35\.000 sats/).waitFor({ timeout: 15_000 });

  if (problems.length > 0) fail(`problemas en el navegador:\n${problems.join('\n')}`);
  console.log(`OK: reclamo simulado de punta a punta. txid ${tx.txid}, comisión ${fee} sats, ${tx.vsize} vB.`);
  console.log(`OK: regalar en 5 pasos, pago en dos partes, link y palabras en portugués, reclamo. txid ${tx2.txid}.`);
  console.log('OK: paso 4 con passkey (PRF), bóveda cifrada, panel reconstruye link y palabras, reingreso con passkey.');
  console.log('OK: lista de regalos con vpub, invitado paga a una dirección de la llave, ve solo su aporte, el panel lo muestra.');
  console.log('OK: transferencia en pesos con alias y código único, anunciada → recibida → convertida.');
  console.log('OK: "crear cuenta" con mail existente no crea passkey; salida con 12 palabras y aviso de cuenta nueva.');
  console.log(`Capturas en ${SHOTS}`);
} finally {
  await browser.close();
  api?.kill();
  await chain.close();
  await sql`delete from regalos where id = ${gift.id}`;
  if (newGiftId !== null) await sql`delete from regalos where id = ${newGiftId}`;
  await sql`delete from regalos where usuario_id in (select id from usuarios where email = 'lupe.e2e@example.com')`;
  await sql`delete from listas where usuario_id in (select id from usuarios where email = 'lupe.e2e@example.com')`;
  await sql`delete from usuarios where email = 'lupe.e2e@example.com'`;
  await sql.end();
}

/** PNG de prueba (degradé) armado a mano, con la firma y los CRC reales. */
function testPng(width: number, height: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(zlib.crc32(body) >>> 0, 8 + data.length);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 2, 0, 0, 0], 8); // 8 bits, RGB
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    for (let x = 0; x < width; x++) raw.set([255, Math.round((x / width) * 200), Math.round((y / height) * 200)], row + 1 + x * 3);
  }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
