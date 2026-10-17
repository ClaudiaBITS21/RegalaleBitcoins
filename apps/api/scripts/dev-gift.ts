// Crea un regalo de prueba en signet para desarrollo y lo guarda en .dev/ (gitignored).
// Solo signet: nunca genera nada para mainnet.
//
//   node apps/api/scripts/dev-gift.ts            # crea (o muestra) el regalo de prueba
//   node apps/api/scripts/dev-gift.ts --nuevo    # crea otro (índice siguiente)

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  deriveGiftSecrets,
  encodeGiftFragment,
  generateMasterMnemonic,
  getNetwork,
  type Lang,
  masterRootFromMnemonic,
  openGiftWallet,
} from '@regalale/core';

export interface DevGift {
  index: number;
  lang: Lang;
  address: string;
  fragment: string;
  words: string[];
  entropyHex: string;
}

export interface DevState {
  network: 'signet';
  /** Clave maestra de prueba. Solo signet: no tiene valor. */
  masterMnemonic: string;
  gifts: DevGift[];
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const DEV_FILE = join(ROOT, '.dev', 'dev-gifts.json');

export function loadDevState(): DevState | null {
  return existsSync(DEV_FILE) ? (JSON.parse(readFileSync(DEV_FILE, 'utf8')) as DevState) : null;
}

export function createDevGift(state: DevState, lang: Lang = 'es'): DevGift {
  const network = getNetwork('signet');
  const root = masterRootFromMnemonic(state.masterMnemonic);
  const index = state.gifts.length;
  const secrets = deriveGiftSecrets(root, index, lang);
  const wallet = openGiftWallet(secrets.entropy, secrets.passphraseWords, lang, network);
  wallet.wipe();
  const gift: DevGift = {
    index,
    lang,
    address: wallet.address,
    fragment: encodeGiftFragment(secrets.entropy),
    words: [...secrets.passphraseWords],
    entropyHex: Buffer.from(secrets.entropy).toString('hex'),
  };
  state.gifts.push(gift);
  return gift;
}

function save(state: DevState): void {
  mkdirSync(dirname(DEV_FILE), { recursive: true });
  writeFileSync(DEV_FILE, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const state = loadDevState() ?? { network: 'signet' as const, masterMnemonic: generateMasterMnemonic(), gifts: [] };
  const fresh = process.argv.includes('--nuevo') || state.gifts.length === 0;
  const gift = fresh ? createDevGift(state) : (state.gifts.at(-1) as DevGift);
  save(state);
  console.log(`Regalo de prueba #${gift.index} (signet, ${gift.lang})`);
  console.log(`  dirección:  ${gift.address}`);
  console.log(`  fragmento:  #${gift.fragment}`);
  console.log(`  palabras:   ${gift.words.join(' ')}`);
  console.log(`  explorador: https://mempool.space/signet/address/${gift.address}`);
  console.log(`Guardado en ${DEV_FILE}`);
}
