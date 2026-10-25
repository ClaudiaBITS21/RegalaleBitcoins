#!/usr/bin/env node
// Prueba de punta a punta del recupero avanzado (multifirma 1-de-2 con la billetera propia), en
// Chromium real, contra una cadena SIMULADA:
//   1. En el paso 4 de Regalar, el enlace discreto, la explicación («Mejor sigo con la web») y
//      conectar la billetera (clave sin origen: error; con origen: huella y confirmación).
//   2. El regalo queda en una P2WSH; la clave se guarda cifrada; se baja el archivo de recupero.
//   3. Quien recibe lo abre con el link y las palabras, como siempre.
//   4. Un segundo regalo se recupera desde «Mis regalos» con una PSBT firmada por la «billetera».
//
//   pnpm --filter @regalale/e2e avanzado
//
// Requiere Postgres local (DATABASE_URL) y la web compilada (pnpm --filter @regalale/web build).

import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
// La misma librería que usa el núcleo (no es una dependencia nueva): acá hace de billetera que firma.
import { Transaction } from '../../packages/core/node_modules/@scure/btc-signer/index.js';
import { deriveBip84Key, generateMasterMnemonic, getNetwork, inspectTransaction, masterRootFromMnemonic, parseDestination, parseGiftWitnessScript, psbtToBase64, readPsbt, recoveryKeyText } from '@regalale/core';
import { chromium } from 'playwright-core';
import { connect } from '../api/src/db.ts';
import { startFakeEsplora } from './fake-esplora.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const WEB_DIST = join(ROOT, 'apps', 'web', 'dist');
const SHOTS = join(ROOT, 'apps', 'e2e', 'capturas');
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://regalale:regalale@127.0.0.1:5432/regalale';
const CHROMIUM = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const API_PORT = 8789;
const BASE = `http://localhost:${API_PORT}`;
const CHAIN_PORT = 3993;
const MAIL = `tomi.${Date.now()}@example.com`;

function fail(message: string): never {
  throw new Error(`FALLÓ: ${message}`);
}

async function waitFor(url: string, timeoutMs = 15_000): Promise<void> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // todavía no levantó
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  fail(`no respondió ${url}`);
}

if (!existsSync(join(WEB_DIST, 'index.html'))) fail('falta la web compilada: pnpm --filter @regalale/web build');
mkdirSync(SHOTS, { recursive: true });

const signet = getNetwork('signet');
// La «billetera de hardware» del que regala: acá, una semilla conocida en Node.
const walletRoot = masterRootFromMnemonic(generateMasterMnemonic());
const keyText = recoveryKeyText(walletRoot, signet);
const fingerprint = keyText.slice(1, 9);
const receiverAddress = deriveBip84Key(masterRootFromMnemonic(generateMasterMnemonic()), signet, 0, 0).address;
const giverAddress = deriveBip84Key(masterRootFromMnemonic(generateMasterMnemonic()), signet, 0, 0).address;

const chain = await startFakeEsplora(CHAIN_PORT, []);
const sql = connect(DATABASE_URL);
let api: ChildProcess | null = null;
const browser = await chromium.launch({ executablePath: CHROMIUM });
const problems: string[] = [];
try {
  api = spawn(process.execPath, [join(ROOT, 'apps', 'api', 'src', 'main.ts')], {
    env: { ...process.env, PORT: String(API_PORT), ESPLORA_URL: chain.url, PRICE_URL: `${chain.url}/v1/prices`, ARS_PRICE_URL: `${chain.url}/ars/criptoya`, ARS_CHECK_URL: `${chain.url}/ars/bitso`, PUBLIC_URL: BASE, COOKIE_SECURE: 'no', DATABASE_URL, WEB_DIST },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  await waitFor(`${BASE}/api/salud`);
  const health = (await (await fetch(`${BASE}/api/salud`)).json()) as { recuperoAvanzado?: boolean };
  if (health.recuperoAvanzado !== true) fail('en signet el recupero avanzado tiene que estar habilitado');

  const giver = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'es-AR', acceptDownloads: true });
  giver.on('pageerror', (e) => problems.push(`error de página: ${e.message}`));
  const shot = (name: string) => giver.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
  const cdp = await giver.context().newCDPSession(giver);
  await cdp.send('WebAuthn.enable', { enableUI: false });
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: { protocol: 'ctap2', ctap2Version: 'ctap2_1', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, hasPrf: true, automaticPresenceSimulation: true },
  });

  // ── 1. Paso 4: enlace discreto, explicación con «Volver», y conectar la billetera ──
  const toStep4 = async (name: string) => {
    await giver.goto(`${BASE}/regalar?ocasion=cumple`);
    await giver.getByRole('heading', { name: '¿Para quién es?' }).waitFor();
    await giver.getByLabel('Su nombre').fill(name);
    await giver.getByRole('button', { name: 'Seguir' }).click();
    await giver.getByRole('button', { name: 'En dólares' }).click();
    await giver.getByRole('button', { name: 'US$ 25' }).click();
    await giver.getByRole('button', { name: 'Seguir' }).click();
  };
  await toStep4('Tomi');
  await giver.getByRole('heading', { name: 'Guardá tu regalo' }).waitFor();
  const link = giver.getByRole('button', { name: 'Usar mi propia billetera (avanzado) →' });
  await link.waitFor();
  await shot('a1-paso4-enlace');
  await link.click();
  await giver.getByRole('heading', { name: 'Recuperar con mi propia billetera' }).waitFor();
  await giver.getByText('Cada regalo es como una cajita con dos cerraduras', { exact: false }).waitFor();
  await shot('a2-explicacion');
  await giver.getByRole('button', { name: 'Mejor sigo con la web' }).click();
  await giver.getByRole('heading', { name: 'Guardá tu regalo' }).waitFor();
  await giver.getByRole('button', { name: 'Usar mi propia billetera (avanzado) →' }).click();
  await giver.getByRole('button', { name: 'Usar mi billetera' }).click();
  await giver.getByRole('heading', { name: 'Conectá tu billetera' }).waitFor();
  // Sin el origen no sirve: la billetera no reconocería su clave al firmar.
  await giver.getByLabel('Tu clave pública').fill(keyText.slice(keyText.indexOf(']') + 1));
  await giver.getByRole('button', { name: 'Revisar' }).click();
  await giver.getByText('Falta la huella y la ruta de la clave', { exact: false }).waitFor();
  // Una clave privada se rechaza y se borra del campo.
  await giver.getByLabel('Tu clave pública').fill(walletRoot.derive("m/48'/1'/0'/2'").privateExtendedKey);
  await giver.getByRole('button', { name: 'Revisar' }).click();
  await giver.getByText('Ojo: eso es una clave PRIVADA', { exact: false }).waitFor();
  if ((await giver.getByLabel('Tu clave pública').inputValue()) !== '') fail('la clave privada quedó en el campo');
  await giver.getByLabel('Tu clave pública').fill(keyText);
  await giver.getByRole('button', { name: 'Revisar' }).click();
  await giver.getByText(fingerprint.toUpperCase(), { exact: true }).waitFor();
  await shot('a3-conectar');
  await giver.getByRole('button', { name: 'Sí, es la misma' }).click();
  await giver.getByRole('heading', { name: 'Guardá tu regalo' }).waitFor();
  await giver.getByText(`Recuperable con tu billetera ·${fingerprint}·`, { exact: false }).waitFor();
  await shot('a4-paso4-elegida');

  // ── 2. Cuenta con passkey, pago a la P2WSH, clave cifrada y archivo de recupero ──
  await giver.getByLabel('Tu mail').fill(MAIL);
  await giver.getByRole('button', { name: 'Crear mi acceso' }).click();
  await giver.getByRole('heading', { name: 'Pagá 25.000 sats' }).waitFor({ timeout: 20_000 });
  const address1 = (await giver.locator('.direccion-completa').innerText()).replace(/\s/g, '');
  if (parseDestination(address1, signet).type !== 'p2wsh') fail(`el regalo no quedó en una P2WSH: ${address1}`);
  const row = (await sql`select r.testigo, r.recupero_ruta, u.recupero from regalos r join usuarios u on u.id = r.usuario_id where r.direccion = ${address1}`)[0];
  if (row === undefined || row.testigo === null || !String(row.recupero_ruta).startsWith(`${fingerprint}/48h/1h/0h/2h/0/0`)) fail(`el regalo no guardó su script y su ruta: ${JSON.stringify(row)}`);
  if (!String(row.recupero).startsWith('r1.') || String(row.recupero).includes('tpub') || String(row.recupero).includes(fingerprint)) fail('la clave de la billetera no quedó cifrada');
  // El script tiene la clave /0/0 de la billetera: la que va a firmar el recupero.
  const child0 = walletRoot.derive("m/48'/1'/0'/2'/0/0").publicKey as Uint8Array;
  if (!parseGiftWitnessScript(new Uint8Array(row.testigo as Buffer)).some((k) => Buffer.from(k).equals(Buffer.from(child0)))) fail('el script no tiene la clave de la billetera');
  chain.pay(address1, 25_000n, true);
  await giver.getByRole('heading', { name: '¡Pago recibido! Mandá el regalo' }).waitFor({ timeout: 15_000 });
  const giftLink = await giver.locator('.enlace-regalo').innerText();
  const giftWords = await giver.locator('.palabras-regalo li strong').allInnerTexts();
  const [download] = await Promise.all([giver.waitForEvent('download'), giver.getByRole('button', { name: 'Bajar el archivo de recupero' }).click()]);
  const file = readFileSync((await download.path()) as string, 'utf8');
  if (!file.includes(address1) || !file.includes(`wsh(sortedmulti(1,[${fingerprint}/48h/1h/0h/2h]tpub`) || !/#[a-z0-9]{8}\n/.test(file)) fail(`archivo de recupero incompleto:\n${file}`);
  await shot('a5-mandar');

  // ── 3. Quien recibe: link y palabras, como siempre ──
  const receiver = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'es-AR' });
  receiver.on('pageerror', (e) => problems.push(`error de página (recibe): ${e.message}`));
  await receiver.goto(giftLink);
  await receiver.getByRole('button', { name: 'Recibir mi regalo' }).click();
  for (let i = 0; i < 4; i++) await receiver.getByLabel(`Palabra ${i + 1}`).fill(giftWords[i] as string);
  await receiver.getByRole('button', { name: 'Seguir' }).click();
  await receiver.getByRole('button', { name: /Sí/ }).click();
  await receiver.getByLabel('Dirección de tu billetera').fill(receiverAddress);
  await receiver.getByRole('checkbox').check();
  await receiver.getByRole('button', { name: 'Seguir' }).click();
  await receiver.getByRole('button', { name: 'Recibir', exact: true }).click();
  await receiver.getByRole('heading', { name: '¡Listo!' }).waitFor().catch(async (e) => { await receiver.screenshot({ path: join(SHOTS, 'a-error-recibe.png'), fullPage: true }); throw e; });
  if (chain.broadcasts.length !== 1) fail(`se esperaba 1 difusión y hubo ${chain.broadcasts.length}`);
  const claim = inspectTransaction(chain.broadcasts[0] as string);
  if (claim.outputs.length !== 1 || !Buffer.from(claim.outputs[0]?.script as Uint8Array).equals(Buffer.from(parseDestination(receiverAddress, signet).script))) fail('el reclamo no va a la dirección de quien recibe');

  // ── 4. Otro regalo, recuperado desde «Mis regalos» con una PSBT ──
  await toStep4('Juli');
  // Con la sesión abierta, el paso 4 abre la llave con la passkey; la billetera ya está en la cuenta.
  await giver.getByRole('button', { name: /Seguir/ }).first().click();
  await giver.getByRole('heading', { name: 'Pagá 25.000 sats' }).waitFor({ timeout: 20_000 });
  const address2 = (await giver.locator('.direccion-completa').innerText()).replace(/\s/g, '');
  if (parseDestination(address2, signet).type !== 'p2wsh' || address2 === address1) fail('el segundo regalo no es multifirma o repite dirección');
  chain.pay(address2, 25_000n, true);
  await giver.getByRole('heading', { name: '¡Pago recibido! Mandá el regalo' }).waitFor({ timeout: 15_000 });
  giver.on('dialog', (d) => void d.accept());
  await giver.goto(`${BASE}/panel`);
  await giver.getByRole('button', { name: 'Recuperar con mi billetera' }).click();
  await giver.getByLabel('Una dirección de tu billetera, para recibirlo').fill(giverAddress);
  await giver.getByRole('button', { name: 'Armar la transacción' }).click();
  await giver.getByText(/vuelven a tu billetera/).waitFor();
  await giver.getByRole('img', { name: 'Bajar la transacción (.psbt)' }).waitFor();
  await shot('a6-psbt');
  const [psbtDownload] = await Promise.all([giver.waitForEvent('download'), giver.getByRole('button', { name: 'Bajar la transacción (.psbt)' }).click()]);
  // La «billetera» firma: encuentra su clave por la huella y la ruta de la PSBT.
  const tx = Transaction.fromPSBT(readPsbt(new Uint8Array(readFileSync((await psbtDownload.path()) as string))));
  const der = (tx.getInput(0).bip32Derivation as Array<[Uint8Array, { fingerprint: number; path: number[] }]> | undefined)?.find(([, d]) => d.fingerprint === walletRoot.fingerprint);
  if (der === undefined) fail('la PSBT no trae la ruta de la clave de la billetera');
  const signer = walletRoot.derive(`m/${der[1].path.map((n: number) => (n >= 2 ** 31 ? `${n - 2 ** 31}'` : String(n))).join('/')}`);
  tx.sign(signer.privateKey as Uint8Array);
  // Una PSBT sin firmar no se acepta.
  await giver.getByLabel('Transacción firmada (PSBT)').fill(psbtToBase64(readPsbt(new Uint8Array(readFileSync((await psbtDownload.path()) as string)))));
  await giver.getByRole('button', { name: 'Enviar a la red' }).click();
  await giver.getByText('La transacción no está firmada todavía.').waitFor();
  await giver.getByLabel('Transacción firmada (PSBT)').fill(psbtToBase64(tx.toPSBT()));
  await giver.getByRole('button', { name: 'Enviar a la red' }).click();
  await giver.getByText('Listo: el regalo vuelve a tu billetera.').waitFor({ timeout: 15_000 });
  if ((chain.broadcasts.length as number) !== 2) fail(`se esperaban 2 difusiones y hubo ${chain.broadcasts.length}`);
  const recovery = inspectTransaction(chain.broadcasts[1] as string);
  if (recovery.outputs.length !== 1 || !Buffer.from(recovery.outputs[0]?.script as Uint8Array).equals(Buffer.from(parseDestination(giverAddress, signet).script))) fail('el recupero no va a la billetera del que regala');

  // «Recuperar mis regalos»: muestra la billetera de la cuenta y se puede volver al modo común.
  await giver.getByRole('heading', { name: 'Recuperar mis regalos' }).scrollIntoViewIfNeeded();
  await giver.locator('.recupero-ajuste').getByRole('button', { name: 'Cambiar' }).click();
  await giver.getByText(`Con tu billetera ·${fingerprint}·.`).waitFor();
  await shot('a7-ajuste');
  await giver.getByRole('button', { name: 'Volver a la opción común' }).click();
  await giver.getByText('Con esta web: tu passkey o tus 12 palabras.').waitFor();
  const after = (await sql`select recupero from usuarios where email = ${MAIL}`)[0];
  if (after?.recupero !== null) fail('volver al modo común no borró la clave de la cuenta');

  if (problems.length > 0) fail(problems.join('\n'));
  console.log('OK: recupero avanzado: enlace discreto en el paso 4, explicación y conexión de la billetera, regalo P2WSH con clave cifrada y archivo de recupero, reclamo con link y palabras, y recupero con PSBT desde «Mis regalos».');
} finally {
  await browser.close();
  api?.kill();
  await chain.close();
  await sql.end();
}
