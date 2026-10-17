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
