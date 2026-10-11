// Baja los vectores de prueba oficiales desde commits fijos y los guarda como JSON
// en test/vectors/. Solo se corre a mano, para regenerar o auditar los fixtures:
//
//   node packages/core/scripts/fetch-vectors.ts
//
// Los tests no usan la red: leen los JSON commiteados.

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIPS_COMMIT = '927b6de9915c9262615a6399de51b200f81e5aa4';
const TREZOR_COMMIT = 'b57a5ad77a981e743f4167ab2f7927a55c1e82a8';
const BIP32JP_COMMIT = '5a43706289c55473c120e552244f6de348d0035b';

const BIPS = `https://raw.githubusercontent.com/bitcoin/bips/${BIPS_COMMIT}`;
const TREZOR = `https://raw.githubusercontent.com/trezor/python-mnemonic/${TREZOR_COMMIT}/vectors.json`;
const BIP32JP = `https://raw.githubusercontent.com/bip32JP/bip32JP.github.io/${BIP32JP_COMMIT}/test_JP_BIP39.json`;

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'test', 'vectors');

async function get(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

function save(name: string, source: string | string[], data: unknown): void {
  const body = { source, ...(data as object) };
  writeFileSync(join(OUT, name), JSON.stringify(body, null, 2) + '\n');
  console.log(`ok ${name}`);
}

function must<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`no se encontró: ${what}`);
  return value;
}

function section(text: string, start: string, end: string): string {
  const i = text.indexOf(start);
  if (i < 0) throw new Error(`no se encontró la sección ${start}`);
  const j = text.indexOf(end, i + start.length);
  return text.slice(i, j < 0 ? undefined : j);
}

function field(text: string, name: string): string {
  const re = new RegExp(`${name}\\s*[:=]\\s*([^\\s,]+)`);
  return must(re.exec(text)?.[1], name);
}

async function bip32(): Promise<void> {
  const url = `${BIPS}/bip-0032.mediawiki`;
  const text = await get(url);
  const vectors = [];
  for (let n = 1; n <= 4; n++) {
    const body = section(text, `===Test vector ${n}===`, '===Test vector');
    const seed = field(body, 'Seed \\(hex\\)');
    const chains = [];
    const re = /\* Chain (\S+)\n\*\* ext pub: (\S+)\n\*\* ext prv: (\S+)/g;
    for (const m of body.matchAll(re)) {
      const path = must(m[1], 'path').replaceAll('<sub>H</sub>', "'");
      chains.push({ path, xpub: m[2], xprv: m[3] });
    }
    if (chains.length === 0) throw new Error(`vector ${n} sin cadenas`);
    vectors.push({ seed, chains });
  }
  const invalidBody = section(text, '===Test vector 5===', '==Acknowledgements==');
  const invalid = [...invalidBody.matchAll(/^\* (\S+) \((.+)\)$/gm)].map((m) => ({ key: m[1], reason: m[2] }));
  if (invalid.length !== 16) throw new Error(`se esperaban 16 claves inválidas, hay ${invalid.length}`);
  save('bip32.json', url, { vectors, invalid });
}

async function bip39(): Promise<void> {
  const trezor = JSON.parse(await get(TREZOR)) as { english: string[][] };
  save('bip39-trezor.json', TREZOR, {
    passphrase: 'TREZOR',
    english: trezor.english.map(([entropy, mnemonic, seed, xprv]) => ({ entropy, mnemonic, seed, xprv })),
  });
  const jp = JSON.parse(await get(BIP32JP)) as unknown[];
  save('bip39-japanese.json', BIP32JP, { vectors: jp });
}

async function bip84(): Promise<void> {
  const url = `${BIPS}/bip-0084.mediawiki`;
  const body = section(await get(url), '==Test vectors==', '==Reference==');
  const pre = must(/<pre>([\s\S]*?)<\/pre>/.exec(body)?.[1], 'bloque pre de BIP84');
  const mnemonic = must(/mnemonic = (.+)/.exec(pre)?.[1], 'mnemonic').trim();
  const addresses = [];
  const re = /\/\/ .*= (m\/\S+)\n\s*privkey = (\S+)\n\s*pubkey\s*= (\S+)\n\s*address = (\S+)/g;
  for (const m of pre.matchAll(re)) addresses.push({ path: m[1], wif: m[2], pubkey: m[3], address: m[4] });
  if (addresses.length !== 3) throw new Error(`se esperaban 3 direcciones, hay ${addresses.length}`);
  save('bip84.json', url, {
    mnemonic,
    rootpriv: field(pre, 'rootpriv'),
    rootpub: field(pre, 'rootpub'),
    account: { path: "m/84'/0'/0'", xpriv: field(pre, 'xpriv'), xpub: field(pre, 'xpub') },
    addresses,
  });
}

async function bip85(): Promise<void> {
  const url = `${BIPS}/bip-0085.mediawiki`;
  const text = await get(url);
  const derived = [];
  for (const n of [1, 2]) {
    const body = section(text, `====Test case ${n}====`, '====');
    derived.push({
      path: must(/PATH: (\S+)/.exec(body)?.[1], 'PATH'),
      derivedKey: field(body, 'DERIVED KEY'),
      derivedEntropy: field(body, 'DERIVED ENTROPY'),
    });
  }
  const master = must(/MASTER BIP32 ROOT KEY: (xprv\S+)/.exec(text)?.[1], 'master');
  const bip39Vectors = [];
  for (const words of [12, 18, 24]) {
    const body = section(text, `====${words} English words====`, '===');
    bip39Vectors.push({
      path: must(/PATH: (\S+)/.exec(body)?.[1], 'PATH'),
      words,
      entropy: field(body, 'DERIVED ENTROPY'),
      mnemonic: must(/DERIVED BIP39 MNEMONIC=(.+)/.exec(body)?.[1], 'mnemonic').trim(),
    });
  }
  const hexBody = section(text, '===HEX===', '===PWD BASE64===');
  const hex = [{ path: must(/PATH: (\S+)/.exec(hexBody)?.[1], 'PATH'), entropy: field(hexBody, 'DERIVED ENTROPY') }];
  for (const v of [...derived, ...bip39Vectors, ...hex]) {
    if (!text.includes(master)) throw new Error('master inesperado');
    if (!v.path.startsWith("m/83696968'")) throw new Error(`path inesperado ${v.path}`);
  }
  save('bip85.json', url, { master, derived, bip39: bip39Vectors, hex });
}

async function bip143(): Promise<void> {
  const url = `${BIPS}/bip-0143.mediawiki`;
  const body = section(await get(url), '=== Native P2WPKH ===', '=== P2SH-P2WPKH ===');
  const second = section(body, 'The second input comes from a P2WPKH witness program', 'To sign it');
  save('bip143-p2wpkh.json', url, {
    unsignedTx: must(/following is an unsigned transaction:\s+([0-9a-f]+)/.exec(body)?.[1], 'unsignedTx'),
    inputIndex: 1,
    amount: '600000000',
    scriptPubKey: field(second, 'scriptPubKey'),
    privateKey: field(second, 'private key'),
    publicKey: field(second, 'public key'),
    scriptCode: field(body, 'scriptCode'),
    hashPrevouts: must(/hashPrevouts:\s+([0-9a-f]{64})\n/.exec(body.split('hash preimage')[1] ?? '')?.[1], 'hashPrevouts'),
    preimage: field(body, 'hash preimage'),
    sigHash: field(body, 'sigHash'),
    signature: field(body, 'signature'),
    signedTx: must(/serialized signed transaction is: ([0-9a-f]+)/.exec(body)?.[1], 'signedTx'),
  });
}

async function bip350(): Promise<void> {
  const url = `${BIPS}/bip-0350.mediawiki`;
  const body = section(await get(url), '===Test vectors for v0-v16 native segregated witness addresses===', '==Appendix');
  const [validPart, invalidPart] = body.split('The following list gives invalid segwit addresses');
  const valid = [...must(validPart, 'válidas').matchAll(/<tt>(\S+)<\/tt>: <tt>([0-9a-f]+)<\/tt>/g)].map((m) => ({ address: m[1], script: m[2] }));
  const invalid = [...must(invalidPart, 'inválidas').matchAll(/<tt>(\S+)<\/tt>: (.+)/g)].map((m) => ({ address: m[1], reason: m[2] }));
  if (valid.length !== 8 || invalid.length !== 15) throw new Error(`conteo inesperado ${valid.length}/${invalid.length}`);
  save('bip350-addresses.json', url, { valid, invalid });
}

async function wordlists(): Promise<void> {
  const langs = { en: 'english', es: 'spanish', pt: 'portuguese', it: 'italian' } as const;
  const sha256: Record<string, string> = {};
  const urls: string[] = [];
  for (const [code, name] of Object.entries(langs)) {
    const url = `${BIPS}/bip-0039/${name}.txt`;
    urls.push(url);
    const text = await get(url);
    if (text.split('\n').filter(Boolean).length !== 2048) throw new Error(`${name}: no tiene 2048 palabras`);
    sha256[code] = createHash('sha256').update(text, 'utf8').digest('hex');
  }
  save('wordlists.json', urls, { sha256 });
}

mkdirSync(OUT, { recursive: true });
await bip32();
await bip39();
await bip84();
await bip85();
await bip143();
await bip350();
await wordlists();
