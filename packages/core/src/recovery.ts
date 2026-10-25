import { sha256 } from '@noble/hashes/sha2.js';
import { base64, base64urlnopad, createBase58check, hex } from '@scure/base';
import { HDKey } from '@scure/bip32';
import { bip32Path, OutScript, p2ms, p2wsh, Transaction } from '@scure/btc-signer';
import { bip85Hex } from './bip85.ts';
import { CoreError } from './errors.ts';
import { type DerivedGift, deriveGift, type GiftAccountKey, type GiftWallet } from './gift.ts';
import type { Lang } from './wordlists.ts';
import { assertNetwork, type Network } from './network.ts';
import { RBF_SEQUENCE, type SignedSweep, type SweepPlan } from './sweep.ts';
import { descriptorChecksum } from './xpub.ts';

// Recupero avanzado (handoffs del 17/10 y del 21/10/2026): el que regala usa la llave de su
// propia billetera como segunda llave del regalo. Cada regalo queda en una multifirma 1-de-2
// P2WSH, sin timelock:
//
//   wsh(sortedmulti(1, [huella/48'/coin'/cuenta'/2']xpub/0/i, <clave del regalo>))
//
// La clave del regalo es la de siempre (m/84'/coin'/0'/0/0 sobre semilla + 4 palabras): quien
// recibe abre el regalo con el link y las palabras, sin cambios. La del que regala es la hija
// /0/i de la clave pública BIP48 (P2WSH) de su billetera, con i = índice del regalo. La web
// nunca ve ni genera la clave privada de esa billetera. Ver docs/derivacion.md, sección 10.

const B58 = createBase58check(sha256);

/** Versiones de clave pública aceptadas y su equivalente estándar (xpub/tpub). */
const XPUB = { public: 0x0488b21e, private: 0x0488ade4 } as const;
const TPUB = { public: 0x043587cf, private: 0x04358394 } as const;
/** SLIP-132 para multifirma P2WSH: Zpub (mainnet) y Vpub (pruebas). */
const ZPUB_MS = 0x02aa7ed3;
const VPUB_MS = 0x02575483;
const PRIVATE_VERSIONS = new Set([0x0488ade4, 0x04358394, 0x02aa7a99, 0x02575048, 0x04b2430c, 0x045f18bc, 0x049d7878, 0x044a4e28]);
const HARDENED = 0x80000000;
/** Profundidad de una cuenta BIP48: m/48'/coin'/cuenta'/2'. */
const BIP48_DEPTH = 4;
const BIP48_SCRIPT_P2WSH = 2;
const MAX_INDEX = 2 ** 31 - 1;

export type RecoveryKeyProblem = 'formato' | 'privada' | 'origen' | 'ruta' | 'red' | 'profundidad';

export interface RecoveryKey {
  readonly network: Network;
  /** Huella de la billetera (raíz), como número y en hex de 8 caracteres. */
  readonly fingerprint: number;
  readonly fingerprintHex: string;
  /** Ruta de la cuenta, p. ej. [48', 1', 0', 2'] (con el bit de endurecida). */
  readonly path: readonly number[];
  /** Clave pública de la cuenta (profundidad 4), en xpub/tpub estándar. */
  readonly hd: HDKey;
  /** Forma canónica: "[huella/48h/coin h/cuenta h/2h]xpub…". Es lo que se guarda cifrado. */
  readonly text: string;
}

function fail(problem: RecoveryKeyProblem, message: string): never {
  throw new CoreError('INVALID_XPUB', message, { problem });
}

function pathText(path: readonly number[]): string {
  return path.map((n) => (n >= HARDENED ? `${n - HARDENED}h` : String(n))).join('/');
}

function parseOriginPath(text: string): number[] {
  const parts = text.replace(/^m\//, '').split('/');
  return parts.map((p) => {
    const m = /^(\d{1,10})(['hH]?)$/.exec(p);
    if (m === null) return fail('origen', 'La ruta de origen no es válida.');
    const n = Number(m[1]);
    if (n > MAX_INDEX) fail('origen', 'La ruta de origen no es válida.');
    return m[2] === '' ? n : n + HARDENED;
  });
}

/** Lee una clave extendida pública (xpub, tpub, Zpub o Vpub) y la pasa a xpub/tpub estándar. */
function readExtendedPublic(text: string, network: Network): HDKey {
  let raw: Uint8Array;
  try {
    raw = B58.decode(text);
  } catch {
    return fail('formato', 'No es una clave pública válida.');
  }
  if (raw.length !== 78) fail('formato', 'No es una clave pública válida.');
  const v = ((((raw[0] as number) << 24) | ((raw[1] as number) << 16) | ((raw[2] as number) << 8) | (raw[3] as number)) >>> 0);
  if (PRIVATE_VERSIONS.has(v)) fail('privada', 'Es una clave PRIVADA: nunca la pegues en ninguna página.');
  const mainnet = network.name === 'mainnet';
  const std = mainnet ? XPUB : TPUB;
  const okVersions = mainnet ? [XPUB.public, ZPUB_MS] : [TPUB.public, VPUB_MS];
  if (!okVersions.includes(v)) {
    const other = mainnet ? [TPUB.public, VPUB_MS] : [XPUB.public, ZPUB_MS];
    fail(other.includes(v) ? 'red' : 'formato', 'La clave no es de esta red, o no es de una cuenta multifirma.');
  }
  // Se reescribe con la versión estándar para que cualquier billetera la entienda.
  const fixed = raw.slice();
  fixed[0] = (std.public >>> 24) & 0xff;
  fixed[1] = (std.public >>> 16) & 0xff;
  fixed[2] = (std.public >>> 8) & 0xff;
  fixed[3] = std.public & 0xff;
  let hd: HDKey;
  try {
    hd = HDKey.fromExtendedKey(B58.encode(fixed), std);
  } catch {
    return fail('formato', 'No es una clave pública válida.');
  }
  if (hd.privateKey !== null) fail('privada', 'Es una clave PRIVADA: nunca la pegues en ninguna página.');
  return hd;
}

/** Lo que exporta Coldcard («Multisig wallets → Export XPUB»): JSON con xfp, p2wsh_deriv y p2wsh. */
function fromColdcardJson(text: string): { origin: string; key: string } | null {
  if (!text.startsWith('{')) return null;
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return fail('formato', 'El archivo no se pudo leer.');
  }
  const o = json as Record<string, unknown>;
  const xfp = typeof o.xfp === 'string' ? o.xfp : null;
  const deriv = typeof o.p2wsh_deriv === 'string' ? o.p2wsh_deriv : null;
  const key = typeof o.p2wsh === 'string' ? o.p2wsh : null;
  if (xfp === null || deriv === null || key === null) return fail('formato', 'El archivo no tiene la clave multifirma (p2wsh).');
  return { origin: `${xfp}/${deriv.replace(/^m\//, '')}`, key };
}

/**
 * Lee la clave pública de recupero que pega o escanea la persona y la valida contra la red.
 * Formatos: "[huella/48'/coin'/cuenta'/2']xpub…" (también tpub, Zpub o Vpub, con ' o h), o el
 * JSON de exportación multifirma de Coldcard. Hace falta el origen (huella y ruta): sin él, la
 * billetera no reconoce la clave al firmar.
 */
export function parseRecoveryKey(input: string, network: Network): RecoveryKey {
  assertNetwork(network);
  const compact = input.trim();
  const cc = fromColdcardJson(compact);
  let origin: string;
  let keyText: string;
  if (cc !== null) {
    ({ origin, key: keyText } = cc);
  } else {
    const text = compact.replace(/\s+/g, '');
    const m = /^\[([^\]]+)\]([1-9A-HJ-NP-Za-km-z]{100,120})(?:\/[0-9*]+)*$/.exec(text);
    if (m === null) {
      if (/^[1-9A-HJ-NP-Za-km-z]{100,120}$/.test(text)) {
        readExtendedPublic(text, network); // si es privada o de otra red, lo dice primero
        fail('origen', 'Falta el origen de la clave: [huella/48h/…/2h] delante de la xpub.');
      }
      return fail('formato', 'No es una clave pública válida.');
    }
    origin = m[1] as string;
    keyText = m[2] as string;
  }
  const [fpText, ...rest] = origin.split('/');
  if (fpText === undefined || !/^[0-9a-fA-F]{8}$/.test(fpText)) fail('origen', 'La huella de la billetera tiene que tener 8 caracteres hexadecimales.');
  const path = parseOriginPath(rest.join('/'));
  const hd = readExtendedPublic(keyText, network);
  if (hd.depth !== BIP48_DEPTH || path.length !== BIP48_DEPTH) fail('profundidad', "Hace falta la clave de la cuenta multifirma (m/48'/…/…'/2').");
  const [purpose, coin, account, script] = path as [number, number, number, number];
  if (purpose !== 48 + HARDENED || account < HARDENED || script !== BIP48_SCRIPT_P2WSH + HARDENED) {
    fail('ruta', "La clave tiene que ser de una cuenta multifirma P2WSH (m/48'/…/…'/2').");
  }
  if (coin !== network.coinType + HARDENED) fail('red', 'La clave no es de esta red.');
  if (hd.index !== script) fail('ruta', 'La ruta de origen no corresponde a la clave.');
  const fingerprint = Number.parseInt(fpText, 16) >>> 0;
  const fingerprintHex = fpText.toLowerCase();
  const canonical = `[${fingerprintHex}/${pathText(path)}]${hd.publicExtendedKey}`;
  return Object.freeze({ network, fingerprint, fingerprintHex, path: Object.freeze([...path]), hd, text: canonical });
}

/** Clave BIP48 P2WSH de una raíz, en la forma canónica (para pruebas y herramientas). */
export function recoveryKeyText(root: HDKey, network: Network, account = 0): string {
  assertNetwork(network);
  const node = root.derive(`m/48'/${network.coinType}'/${account}'/2'`);
  const std = network.name === 'mainnet' ? XPUB : TPUB;
  const pub = new HDKey({
    versions: std,
    depth: node.depth,
    index: node.index,
    parentFingerprint: node.parentFingerprint,
    chainCode: node.chainCode as Uint8Array,
    publicKey: node.publicKey as Uint8Array,
  });
  const fp = root.fingerprint.toString(16).padStart(8, '0');
  return `[${fp}/48h/${network.coinType}h/${account}h/2h]${pub.publicExtendedKey}`;
}

export interface RecoveryChild {
  readonly index: number;
  readonly publicKey: Uint8Array;
  /** Ruta completa desde la raíz de la billetera: cuenta + /0/i. */
  readonly path: readonly number[];
}

/** La clave hija /0/i de la cuenta de recupero: una por regalo. */
export function deriveRecoveryChild(key: RecoveryKey, index: number): RecoveryChild {
  if (!Number.isInteger(index) || index < 0 || index > MAX_INDEX) throw new CoreError('INVALID_INDEX', `Índice inválido: ${index}`);
  const child = key.hd.derive(`m/0/${index}`);
  if (child.publicKey === null) throw new CoreError('INVALID_PATH', 'No se pudo derivar la clave.');
  return Object.freeze({ index, publicKey: child.publicKey.slice(), path: Object.freeze([...key.path, 0, index]) });
}

export interface GiftMultisig {
  readonly address: string;
  /** Script de salida (P2WSH). */
  readonly script: Uint8Array;
  /** Script de testigo: OP_1 <clave> <clave> OP_2 OP_CHECKMULTISIG, con las claves ordenadas. */
  readonly witnessScript: Uint8Array;
}

/** sortedmulti(1, a, b): las claves en orden lexicográfico (BIP67). */
function sortedMultisig1of2(keys: readonly Uint8Array[]): ReturnType<typeof p2ms> {
  const sorted = [...keys].sort((x, y) => {
    const a = hex.encode(x);
    const b = hex.encode(y);
    return a < b ? -1 : a > b ? 1 : 0;
  });
  return p2ms(1, sorted);
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

/** La dirección 1-de-2 del regalo a partir de las dos claves públicas. */
export function giftMultisig(giftPublicKey: Uint8Array, recoveryPublicKey: Uint8Array, network: Network): GiftMultisig {
  assertNetwork(network);
  if (equalBytes(giftPublicKey, recoveryPublicKey)) throw new CoreError('INVALID_XPUB', 'Las dos claves son la misma.', { problem: 'formato' });
  const payment = p2wsh(sortedMultisig1of2([giftPublicKey, recoveryPublicKey]), network.btc);
  return Object.freeze({ address: payment.address as string, script: payment.script, witnessScript: payment.witnessScript as Uint8Array });
}

/**
 * Lee un script de testigo y verifica que sea una multifirma 1-de-2 de claves comprimidas en
 * orden (sortedmulti). Devuelve las dos claves públicas.
 */
export function parseGiftWitnessScript(witnessScript: Uint8Array): readonly [Uint8Array, Uint8Array] {
  let decoded: { type: string; m?: number; pubkeys?: Uint8Array[] };
  try {
    decoded = OutScript.decode(witnessScript) as { type: string; m?: number; pubkeys?: Uint8Array[] };
  } catch {
    throw new CoreError('INVALID_UTXO', 'El script del regalo no es válido.');
  }
  if (decoded.type !== 'ms' || decoded.m !== 1 || decoded.pubkeys?.length !== 2) {
    throw new CoreError('INVALID_UTXO', 'El script del regalo no es una multifirma 1-de-2.');
  }
  const [a, b] = decoded.pubkeys as [Uint8Array, Uint8Array];
  if (a.length !== 33 || b.length !== 33 || !equalBytes(sortedMultisig1of2([a, b]).script, witnessScript)) {
    throw new CoreError('INVALID_UTXO', 'El script del regalo no está en la forma esperada.');
  }
  return [a, b];
}

/**
 * La billetera del regalo cuando el regalo es multifirma: misma clave, pero la dirección y el
 * script son los de la 1-de-2. Falla si el script no incluye la clave del regalo.
 */
export function multisigGiftWallet(wallet: GiftWallet, witnessScript: Uint8Array): GiftWallet {
  const keys = parseGiftWitnessScript(witnessScript);
  if (!keys.some((k) => equalBytes(k, wallet.publicKey))) throw new CoreError('INVALID_UTXO', 'El script no es de este regalo.');
  const payment = p2wsh(sortedMultisig1of2(keys), wallet.network.btc);
  return {
    ...wallet,
    address: payment.address as string,
    script: payment.script,
    witnessScript: payment.witnessScript as Uint8Array,
    wipe: () => wallet.wipe(),
  };
}

/**
 * Descriptor de un regalo multifirma, para importarlo en una billetera (Bitcoin Core
 * `importdescriptors`, u otra que acepte descriptores) y recuperarlo sin la web. Las dos llaves
 * van como xpub con su origen: es lo que piden las billeteras de hardware para firmar.
 */
export function giftRecoveryDescriptor(key: RecoveryKey, index: number, gift: GiftAccountKey): string {
  const child = deriveRecoveryChild(key, index);
  const mine = `[${key.fingerprintHex}/${pathText(key.path)}]${key.hd.publicExtendedKey}/0/${child.index}`;
  const theirs = `[${gift.fingerprintHex}/84h/${gift.coinType}h/0h]${gift.xpub}/0/0`;
  const body = `wsh(sortedmulti(1,${mine},${theirs}))`;
  return `${body}#${descriptorChecksum(body)}`;
}

/** Regalo multifirma completo: los secretos de siempre, la dirección 1-de-2 y su script de testigo. */
export interface DerivedMultisigGift extends DerivedGift {
  readonly witnessScript: Uint8Array;
  /** Ruta de la clave de recupero usada, desde la raíz de la billetera del que regala. */
  readonly recoveryPath: readonly number[];
}

/** Deriva el regalo `index` en modo avanzado: misma semilla y palabras, dirección multifirma. */
export function deriveMultisigGift(root: HDKey, index: number, lang: Lang, network: Network, key: RecoveryKey): DerivedMultisigGift {
  if (key.network !== network) throw new CoreError('WRONG_NETWORK', 'La clave de recupero es de otra red.');
  const gift = deriveGift(root, index, lang, network);
  const child = deriveRecoveryChild(key, index);
  const ms = giftMultisig(gift.publicKey, child.publicKey, network);
  return Object.freeze({ ...gift, address: ms.address, witnessScript: ms.witnessScript, recoveryPath: child.path });
}

// --- PSBT del recupero -------------------------------------------------------------------

export interface RecoveryPsbtOptions {
  /** Plan del barrido hacia la dirección del que regala (planSweep con el script de testigo). */
  readonly plan: SweepPlan;
  readonly witnessScript: Uint8Array;
  /** Transacciones completas de cada entrada, por txid: algunas billeteras de hardware las piden. */
  readonly rawTxs: ReadonlyMap<string, string>;
  readonly key: RecoveryKey;
  readonly index: number;
  /** Origen de la clave del regalo, si se conoce (lo incluye para billeteras que lo usan). */
  readonly gift?: GiftAccountKey & { readonly publicKey: Uint8Array };
}

/**
 * Arma la PSBT sin firmar del recupero: gasta todos los UTXO del regalo hacia la dirección del
 * que regala. La firma la pone su billetera con la clave /0/i de su cuenta multifirma.
 */
export function buildRecoveryPsbt(options: RecoveryPsbtOptions): Uint8Array {
  const { plan, witnessScript, rawTxs, key, index, gift } = options;
  const child = deriveRecoveryChild(key, index);
  const keys = parseGiftWitnessScript(witnessScript);
  if (!keys.some((k) => equalBytes(k, child.publicKey))) {
    throw new CoreError('SIGNING_FAILED', 'Este regalo se armó con otra billetera de recupero.', { reason: 'otra_billetera' });
  }
  if (!equalBytes(p2wsh(sortedMultisig1of2(keys), plan.network.btc).script, plan.giftScript)) {
    throw new CoreError('SIGNING_FAILED', 'El script no corresponde a la dirección del regalo.');
  }
  const tx = new Transaction({ version: 2, lockTime: 0 });
  for (const input of plan.inputs) {
    const raw = rawTxs.get(input.txid);
    const derivation: [Uint8Array, { fingerprint: number; path: number[] }][] = [[child.publicKey, { fingerprint: key.fingerprint, path: [...child.path] }]];
    if (gift !== undefined) derivation.push([gift.publicKey, { fingerprint: gift.fingerprint, path: bip32Path(`m/84'/${gift.coinType}'/0'/0/0`) }]);
    tx.addInput({
      txid: input.txid,
      index: input.vout,
      sequence: RBF_SEQUENCE,
      witnessUtxo: { script: plan.giftScript, amount: input.amount },
      ...(raw === undefined ? {} : { nonWitnessUtxo: hex.decode(raw) }),
      witnessScript,
      bip32Derivation: derivation,
    });
  }
  tx.addOutput({ script: plan.destination.script, amount: plan.amount });
  if (tx.fee !== plan.fee) throw new CoreError('SIGNING_FAILED', 'La transacción no coincide con el plan.');
  return tx.toPSBT(0);
}

/** Lee una PSBT en binario, base64 o hex (lo que devuelven las billeteras al exportarla). */
export function readPsbt(input: Uint8Array | string): Uint8Array {
  if (typeof input !== 'string') {
    // Algunas billeteras guardan el archivo .psbt como texto base64.
    const head = new TextDecoder().decode(input.slice(0, 5));
    if (head === 'cHNid') return readPsbt(new TextDecoder().decode(input));
    return input;
  }
  const s = input.trim().replace(/\s+/g, '');
  try {
    if (/^70736274ff/i.test(s)) return hex.decode(s.toLowerCase());
    if (s.startsWith('cHNid')) return base64.decode(s);
  } catch {
    // cae al error de abajo
  }
  throw new CoreError('SIGNING_FAILED', 'No es una PSBT.', { reason: 'formato' });
}

/**
 * Toma la PSBT que devolvió la billetera ya firmada, verifica que sea exactamente el plan (mismas
 * entradas, una sola salida al mismo destino y por el mismo monto) y la finaliza.
 */
export function finalizeRecoveryPsbt(signedPsbt: Uint8Array, plan: SweepPlan, witnessScript: Uint8Array): SignedSweep {
  let tx: Transaction;
  try {
    tx = Transaction.fromPSBT(signedPsbt);
  } catch {
    throw new CoreError('SIGNING_FAILED', 'No se pudo leer la PSBT.', { reason: 'formato' });
  }
  const sameInputs =
    tx.inputsLength === plan.inputs.length &&
    plan.inputs.every((input, i) => {
      const got = tx.getInput(i);
      return got.txid !== undefined && hex.encode(got.txid) === input.txid && got.index === input.vout;
    });
  const out = tx.outputsLength === 1 ? tx.getOutput(0) : null;
  if (!sameInputs || out === null || out.amount !== plan.amount || out.script === undefined || !equalBytes(out.script, plan.destination.script)) {
    throw new CoreError('SIGNING_FAILED', 'La PSBT no es la de este recupero.', { reason: 'otra_psbt' });
  }
  for (let i = 0; i < tx.inputsLength; i++) {
    const input = tx.getInput(i);
    if (input.finalScriptWitness !== undefined) continue;
    if (input.partialSig === undefined || input.partialSig.length === 0) {
      throw new CoreError('SIGNING_FAILED', 'La PSBT no está firmada.', { reason: 'sin_firma' });
    }
    if (input.witnessScript === undefined) tx.updateInput(i, { witnessScript }, true);
  }
  try {
    tx.finalize();
  } catch {
    throw new CoreError('SIGNING_FAILED', 'No se pudo completar la firma.', { reason: 'sin_firma' });
  }
  if (tx.fee !== plan.fee) throw new CoreError('SIGNING_FAILED', 'La comisión no coincide con el plan.', { reason: 'otra_psbt' });
  return Object.freeze({ hex: tx.hex, txid: tx.id, fee: plan.fee, amount: plan.amount, weight: tx.weight, vsize: tx.vsize });
}

/** La PSBT en base64, como la piden la mayoría de las billeteras al pegarla o leer el QR. */
export function psbtToBase64(psbt: Uint8Array): string {
  return base64.encode(psbt);
}

// --- La clave de recupero, guardada cifrada ---------------------------------------------
//
// La clave pública de recupero no va al servidor en claro: se cifra con una clave que sale de
// la clave maestra (BIP85 HEX de 32 bytes, índice 0, y HKDF con un dominio propio). Así sirve
// en cualquier dispositivo donde se abra la cuenta, y el servidor no la puede leer.
//   formato = "r1." + base64url(iv) + "." + base64url(cifrado+tag)

const enc = new TextEncoder();
const SEAL_VERSION = 'r1';
const SEAL_INFO = enc.encode('regalalebitcoins/recupero/v1/aes-gcm');
const SEAL_AAD = enc.encode('regalalebitcoins/recupero/v1');
const SEAL_BIP85_INDEX = 0;

function subtle(): SubtleCrypto {
  const s = globalThis.crypto?.subtle;
  if (s === undefined) throw new CoreError('NO_SECURE_RANDOM', 'Este entorno no tiene WebCrypto.');
  return s;
}

async function sealKey(masterRoot: HDKey): Promise<CryptoKey> {
  const secret = bip85Hex(masterRoot, 32, SEAL_BIP85_INDEX);
  try {
    const base = await subtle().importKey('raw', secret as BufferSource, 'HKDF', false, ['deriveKey']);
    return await subtle().deriveKey(
      { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: SEAL_INFO as BufferSource },
      base,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
  } finally {
    secret.fill(0);
  }
}

export async function sealRecoveryKey(masterRoot: HDKey, key: RecoveryKey): Promise<string> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: SEAL_AAD as BufferSource }, await sealKey(masterRoot), enc.encode(key.text) as BufferSource),
  );
  return `${SEAL_VERSION}.${base64urlnopad.encode(iv)}.${base64urlnopad.encode(ct)}`;
}

export async function openRecoveryKey(masterRoot: HDKey, sealed: string, network: Network): Promise<RecoveryKey> {
  const parts = sealed.split('.');
  if (parts.length !== 3 || parts[0] !== SEAL_VERSION) throw new CoreError('INVALID_VAULT', 'Formato desconocido.');
  let plain: ArrayBuffer;
  try {
    const iv = base64urlnopad.decode(parts[1] as string);
    const ct = base64urlnopad.decode(parts[2] as string);
    plain = await subtle().decrypt({ name: 'AES-GCM', iv: iv as BufferSource, additionalData: SEAL_AAD as BufferSource }, await sealKey(masterRoot), ct as BufferSource);
  } catch {
    throw new CoreError('INVALID_VAULT', 'No se pudo abrir la clave de recupero con esta cuenta.');
  }
  return parseRecoveryKey(new TextDecoder().decode(plain), network);
}
