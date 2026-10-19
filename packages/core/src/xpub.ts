import { sha256 } from '@noble/hashes/sha2.js';
import { createBase58check } from '@scure/base';
import { HDKey } from '@scure/bip32';
import { p2wpkh } from '@scure/btc-signer';
import { CoreError } from './errors.ts';
import { assertNetwork, type Network } from './network.ts';

// Llave pública de cuenta (BIP84, segwit nativo) para las listas de regalos. Con ella la
// plataforma genera una dirección por invitado, pero no puede mover nada: es solo pública.
// Se aceptan zpub (mainnet) y vpub (redes de prueba), que dicen sin ambigüedad el tipo de
// dirección. Una xpub/tpub genérica no dice si es segwit nativo, así que se rechaza.

const B58 = createBase58check(sha256);

/** Versiones SLIP-132 de BIP84: pública y privada. */
const ZPUB = { public: 0x04b24746, private: 0x04b2430c } as const;
const VPUB = { public: 0x045f1cf6, private: 0x045f18bc } as const;
const PRIVATE_VERSIONS = new Set([0x04b2430c, 0x045f18bc, 0x0488ade4, 0x04358394, 0x049d7878, 0x044a4e28]);
const GENERIC_PUBLIC = new Set([0x0488b21e, 0x043587cf, 0x049d7cb2, 0x044a5262]);

/** Profundidad de una cuenta BIP84: m/84'/coin'/cuenta'. */
const ACCOUNT_DEPTH = 3;
const MAX_INDEX = 2 ** 31 - 1;

export type AccountKeyProblem = 'formato' | 'privada' | 'generica' | 'red' | 'profundidad';

export interface AccountKey {
  readonly network: Network;
  /** La llave tal como se guarda (zpub… o vpub…), sin espacios. */
  readonly text: string;
  readonly hd: HDKey;
}

export interface ListAddress {
  readonly index: number;
  readonly address: string;
  readonly script: Uint8Array;
}

function fail(problem: AccountKeyProblem, message: string): never {
  throw new CoreError('INVALID_XPUB', message, { problem });
}

/** Lee una zpub/vpub pegada por la persona y la valida contra la red. */
export function parseAccountKey(input: string, network: Network): AccountKey {
  assertNetwork(network);
  const text = input.trim().replace(/\s+/g, '');
  let raw: Uint8Array;
  try {
    raw = B58.decode(text);
  } catch {
    return fail('formato', 'No es una llave pública válida.');
  }
  if (raw.length !== 78) fail('formato', 'No es una llave pública válida.');
  const version = ((raw[0] as number) << 24) | ((raw[1] as number) << 16) | ((raw[2] as number) << 8) | (raw[3] as number);
  const v = version >>> 0;
  if (PRIVATE_VERSIONS.has(v)) fail('privada', 'Es una clave PRIVADA: nunca la pegues en ninguna página.');
  if (GENERIC_PUBLIC.has(v)) fail('generica', 'Hace falta la zpub/vpub de una cuenta de segwit nativo (BIP84).');
  const expected = network.name === 'mainnet' ? ZPUB : VPUB;
  if (v !== expected.public) {
    fail(v === ZPUB.public || v === VPUB.public ? 'red' : 'formato', 'La llave no es de esta red.');
  }
  let hd: HDKey;
  try {
    hd = HDKey.fromExtendedKey(text, expected);
  } catch {
    return fail('formato', 'No es una llave pública válida.');
  }
  if (hd.privateKey !== null) fail('privada', 'Es una clave PRIVADA: nunca la pegues en ninguna página.');
  if (hd.depth !== ACCOUNT_DEPTH) fail('profundidad', 'Hace falta la llave pública de la cuenta (m/84\'/…/0\').');
  return Object.freeze({ network, text, hd });
}

/** Dirección de recepción `index` de la cuenta (rama externa m/0/index, como cualquier billetera). */
export function deriveListAddress(account: AccountKey, index: number): ListAddress {
  if (!Number.isInteger(index) || index < 0 || index > MAX_INDEX) throw new CoreError('INVALID_INDEX', `Índice inválido: ${index}`);
  const child = account.hd.derive(`m/0/${index}`);
  if (child.publicKey === null) throw new CoreError('INVALID_PATH', 'No se pudo derivar la dirección.');
  const payment = p2wpkh(child.publicKey, account.network.btc);
  return Object.freeze({ index, address: payment.address as string, script: payment.script });
}

/** Serializa la cuenta BIP84 de una raíz como zpub/vpub (para pruebas y herramientas). */
export function accountKeyText(root: HDKey, network: Network, account = 0): string {
  assertNetwork(network);
  const versions = network.name === 'mainnet' ? ZPUB : VPUB;
  const node = root.derive(`m/84'/${network.coinType}'/${account}'`);
  return new HDKey({
    versions,
    depth: node.depth,
    index: node.index,
    parentFingerprint: node.parentFingerprint,
    chainCode: node.chainCode as Uint8Array,
    publicKey: node.publicKey as Uint8Array,
  }).publicExtendedKey;
}

// Llave de cobro de la plataforma (handoff 2026-10-19, «cobro y créditos»): se carga como
// descriptor de Bitcoin Core, `wpkh([huella/84'/coin'/cuenta']xpub…)`, con o sin `/0/*` y con o sin
// checksum (`#…`). También se acepta una zpub/vpub. Es de solo lectura: con ella el servidor genera
// una dirección por pago, pero no puede gastar nada. Las claves están en la billetera de Rodolfo.

const XPUB = { public: 0x0488b21e, private: 0x0488ade4 } as const;
const TPUB = { public: 0x043587cf, private: 0x04358394 } as const;
const DESCRIPTOR = /^wpkh\(\[([0-9a-fA-F]{8})\/84['h]\/([01])['h]\/(\d{1,9})['h]\]([1-9A-HJ-NP-Za-km-z]{100,120})(\/0\/\*)?\)(?:#([a-z0-9]{8}))?$/;

/** Checksum de descriptores (BIP 380). */
const INPUT_CHARSET = '0123456789()[],\'/*abcdefgh@:$%{}IJKLMNOPQRSTUVWXYZ&+-.;<=>?!^_|~ijklmnopqrstuvwxyzABCDEFGH`#"\\ ';
const CHECKSUM_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
function polymod(c: bigint, val: number): bigint {
  const c0 = c >> 35n;
  let r = ((c & 0x7ffffffffn) << 5n) ^ BigInt(val);
  if (c0 & 1n) r ^= 0xf5dee51989n;
  if (c0 & 2n) r ^= 0xa9fdca3312n;
  if (c0 & 4n) r ^= 0x1bab10e32dn;
  if (c0 & 8n) r ^= 0x3706b1677an;
  if (c0 & 16n) r ^= 0x644d626ffdn;
  return r;
}
export function descriptorChecksum(desc: string): string {
  let c = 1n;
  let cls = 0;
  let clscount = 0;
  for (const ch of desc) {
    const pos = INPUT_CHARSET.indexOf(ch);
    if (pos === -1) throw new CoreError('INVALID_XPUB', 'Descriptor con caracteres inválidos.', { problem: 'formato' });
    c = polymod(c, pos & 31);
    cls = cls * 3 + (pos >> 5);
    if (++clscount === 3) {
      c = polymod(c, cls);
      cls = 0;
      clscount = 0;
    }
  }
  if (clscount > 0) c = polymod(c, cls);
  for (let j = 0; j < 8; j++) c = polymod(c, 0);
  c ^= 1n;
  let out = '';
  for (let j = 0; j < 8; j++) out += CHECKSUM_CHARSET[Number((c >> (5n * BigInt(7 - j))) & 31n)];
  return out;
}

/** Lee la llave de cobro (descriptor wpkh de una cuenta BIP84, o zpub/vpub) y la valida contra la red. */
export function parsePaymentKey(input: string, network: Network): AccountKey {
  assertNetwork(network);
  const text = input.trim().replace(/\s+/g, '');
  if (!text.startsWith('wpkh(')) return parseAccountKey(text, network);
  const m = DESCRIPTOR.exec(text);
  if (m === null) return fail('formato', 'El descriptor tiene que ser wpkh([huella/84h/0h/0h]xpub…).');
  const [, , coin, , key, , checksum] = m as unknown as [string, string, string, string, string, string | undefined, string | undefined];
  const body = text.split('#')[0] as string;
  if (checksum !== undefined && descriptorChecksum(body) !== checksum) fail('formato', 'El checksum del descriptor no coincide.');
  if (Number(coin) !== network.coinType) fail('red', 'La llave no es de esta red.');
  let raw: Uint8Array;
  try {
    raw = B58.decode(key);
  } catch {
    return fail('formato', 'No es una llave pública válida.');
  }
  if (raw.length !== 78) fail('formato', 'No es una llave pública válida.');
  const v = ((((raw[0] as number) << 24) | ((raw[1] as number) << 16) | ((raw[2] as number) << 8) | (raw[3] as number)) >>> 0);
  if (PRIVATE_VERSIONS.has(v)) fail('privada', 'Es una clave PRIVADA: nunca la pegues en ninguna página.');
  const expected = network.name === 'mainnet' ? XPUB : TPUB;
  if (v !== expected.public) fail(v === XPUB.public || v === TPUB.public ? 'red' : 'formato', 'La llave no es de esta red.');
  let hd: HDKey;
  try {
    hd = HDKey.fromExtendedKey(key, expected);
  } catch {
    return fail('formato', 'No es una llave pública válida.');
  }
  if (hd.privateKey !== null) fail('privada', 'Es una clave PRIVADA: nunca la pegues en ninguna página.');
  if (hd.depth !== ACCOUNT_DEPTH) fail('profundidad', 'Hace falta la llave pública de la cuenta (m/84\'/…/0\').');
  // Se guarda sin checksum y con la rama de recepción explícita, para compararla siempre igual.
  const normalized = body.endsWith('/0/*)') ? body : `${body.slice(0, -1)}/0/*)`;
  return Object.freeze({ network, text: `${normalized}#${descriptorChecksum(normalized)}`, hd });
}
