import { readFileSync } from 'node:fs';
import { sha256 } from '@noble/hashes/sha2.js';
import { hex } from '@scure/base';
import { Transaction } from '@scure/btc-signer';
import assert from 'node:assert/strict';
import { CoreError, type CoreErrorCode } from '../src/index.ts';

export function loadVector<T>(name: string): T {
  return JSON.parse(readFileSync(new URL(`./vectors/${name}`, import.meta.url), 'utf8')) as T;
}

export const toHex = (b: Uint8Array): string => hex.encode(b);
export const fromHex = (s: string): Uint8Array => hex.decode(s);

export function assertCoreError(fn: () => unknown, code: CoreErrorCode): CoreError {
  let caught: unknown;
  try {
    fn();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof CoreError, `se esperaba CoreError ${code}, llegó ${String(caught)}`);
  assert.equal(caught.code, code);
  return caught;
}

/** Una transacción cualquiera que paga a los scripts dados (no hace falta que sea válida en la red). */
export function makeFundingTx(outputs: ReadonlyArray<{ script: Uint8Array; amount: bigint }>, salt = 0): { txid: string; rawTx: string } {
  const tx = new Transaction({ allowUnknownInputs: true, allowUnknownOutputs: true });
  tx.addInput({ txid: (salt % 256).toString(16).padStart(2, '0').repeat(32), index: salt });
  for (const o of outputs) tx.addOutput(o);
  const raw = tx.unsignedTx;
  return { txid: Transaction.fromRaw(raw, { allowUnknownInputs: true, allowUnknownOutputs: true, disableScriptCheck: true }).id, rawTx: hex.encode(raw) };
}

// ---------------------------------------------------------------------------
// Parser de transacciones y sighash BIP143 escritos desde la especificación, sin
// usar @scure/btc-signer, para verificar de forma independiente lo que firma.
// ---------------------------------------------------------------------------

export interface ParsedTx {
  version: number;
  inputs: Array<{ txid: Uint8Array; vout: number; scriptSig: Uint8Array; sequence: number }>;
  outputs: Array<{ amount: bigint; script: Uint8Array }>;
  witnesses: Uint8Array[][];
  lockTime: number;
}

class Reader {
  private pos = 0;
  private readonly b: Uint8Array;
  constructor(b: Uint8Array) {
    this.b = b;
  }
  bytes(n: number): Uint8Array {
    if (this.pos + n > this.b.length) throw new Error('fin inesperado');
    const out = this.b.slice(this.pos, this.pos + n);
    this.pos += n;
    return out;
  }
  u8(): number {
    return this.bytes(1)[0] as number;
  }
  u32(): number {
    const b = this.bytes(4);
    return ((b[0] as number) | ((b[1] as number) << 8) | ((b[2] as number) << 16) | ((b[3] as number) << 24)) >>> 0;
  }
  u64(): bigint {
    const b = this.bytes(8);
    let v = 0n;
    for (let i = 7; i >= 0; i--) v = (v << 8n) | BigInt(b[i] as number);
    return v;
  }
  varint(): number {
    const first = this.u8();
    if (first < 0xfd) return first;
    if (first === 0xfd) {
      const b = this.bytes(2);
      return (b[0] as number) | ((b[1] as number) << 8);
    }
    if (first === 0xfe) return this.u32();
    throw new Error('varint demasiado grande');
  }
  peek(): number {
    return this.b[this.pos] as number;
  }
  get done(): boolean {
    return this.pos === this.b.length;
  }
}

export function parseTx(raw: Uint8Array): ParsedTx {
  const r = new Reader(raw);
  const version = r.u32();
  let segwit = false;
  if (r.peek() === 0) {
    r.u8();
    assert.equal(r.u8(), 1, 'flag segwit');
    segwit = true;
  }
  const inputs = Array.from({ length: r.varint() }, () => ({
    txid: r.bytes(32),
    vout: r.u32(),
    scriptSig: r.bytes(r.varint()),
    sequence: r.u32(),
  }));
  const outputs = Array.from({ length: r.varint() }, () => ({ amount: r.u64(), script: r.bytes(r.varint()) }));
  const witnesses = segwit ? inputs.map(() => Array.from({ length: r.varint() }, () => r.bytes(r.varint()))) : [];
  const lockTime = r.u32();
  assert.ok(r.done, 'bytes sobrantes');
  return { version, inputs, outputs, witnesses, lockTime };
}

const dsha256 = (b: Uint8Array): Uint8Array => sha256(sha256(b));

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

const le32 = (n: number): Uint8Array => Uint8Array.of(n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff);
function le64(n: bigint): Uint8Array {
  const out = new Uint8Array(8);
  for (let i = 0; i < 8; i++) out[i] = Number((n >> BigInt(8 * i)) & 0xffn);
  return out;
}
const varintBytes = (n: number): Uint8Array => {
  assert.ok(n < 0xfd);
  return Uint8Array.of(n);
};

/** Preimagen BIP143 de una entrada P2WPKH con SIGHASH_ALL. */
export function bip143PreimageP2WPKH(tx: ParsedTx, index: number, pubkeyHash: Uint8Array, amount: bigint): Uint8Array {
  const input = tx.inputs[index];
  assert.ok(input);
  const hashPrevouts = dsha256(concat(...tx.inputs.map((i) => concat(i.txid, le32(i.vout)))));
  const hashSequence = dsha256(concat(...tx.inputs.map((i) => le32(i.sequence))));
  const hashOutputs = dsha256(concat(...tx.outputs.map((o) => concat(le64(o.amount), varintBytes(o.script.length), o.script))));
  const scriptCode = concat(Uint8Array.of(0x19, 0x76, 0xa9, 0x14), pubkeyHash, Uint8Array.of(0x88, 0xac));
  return concat(
    le32(tx.version),
    hashPrevouts,
    hashSequence,
    input.txid,
    le32(input.vout),
    scriptCode,
    le64(amount),
    le32(input.sequence),
    hashOutputs,
    le32(tx.lockTime),
    le32(1), // SIGHASH_ALL
  );
}

export function bip143SighashP2WPKH(tx: ParsedTx, index: number, pubkeyHash: Uint8Array, amount: bigint): Uint8Array {
  return dsha256(bip143PreimageP2WPKH(tx, index, pubkeyHash, amount));
}
