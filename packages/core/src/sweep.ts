import { hex } from '@scure/base';
import { Transaction } from '@scure/btc-signer';
import type { Destination } from './address.ts';
import { CoreError } from './errors.ts';
import type { GiftWallet } from './gift.ts';
import { assertNetwork, type Network } from './network.ts';

// Barrido del regalo: gasta todos los UTXO de la dirección del regalo (P2WPKH) hacia
// una sola salida, la dirección del que recibe (o del que regala, si lo recupera).
// La comisión sale del monto. Se firma en el navegador.
//
// Dos pasos: planSweep() calcula montos para la pantalla "Vas a recibir X; la
// comisión es Y", y signSweep() firma exactamente ese plan.

/** Mínimo que acepta la red por defecto (Bitcoin Core ≥ 29.1: 0.1 sat/vB). */
export const MIN_FEE_RATE = 0.1;
/** Tope de sanidad: más que esto es casi seguro un error de unidades. */
export const MAX_FEE_RATE = 1000;
/** Señala RBF (BIP125), para poder acelerar el barrido si queda trabado. */
export const RBF_SEQUENCE = 0xfffffffd;
/** dustRelayFee por defecto de Bitcoin Core, en sat/vB. */
const DUST_RELAY_FEE = 3;
const MAX_MONEY = 2_100_000_000_000_000n;
/** Peso máximo de una transacción estándar (Bitcoin Core: MAX_STANDARD_TX_WEIGHT). */
const MAX_STANDARD_WEIGHT = 400_000;

export interface FundingUtxo {
  readonly txid: string;
  readonly vout: number;
  /**
   * La transacción completa que creó el UTXO, en hex. El monto se lee de acá y se
   * verifica contra el txid: no se confía en el monto que informe un servidor.
   */
  readonly rawTx: string;
}

export interface SweepInput {
  readonly txid: string;
  readonly vout: number;
  readonly amount: bigint;
}

export interface SweepPlan {
  readonly network: Network;
  readonly inputs: readonly SweepInput[];
  readonly giftScript: Uint8Array;
  readonly destination: Destination;
  /** sat/vB pedidos. */
  readonly feeRate: number;
  /** Suma de los UTXO. */
  readonly total: bigint;
  readonly fee: bigint;
  /** Lo que llega a destino: total - fee. */
  readonly amount: bigint;
  /** Peso máximo estimado (firmas de 72 bytes). La transacción firmada nunca pesa más. */
  readonly weight: number;
  readonly vsize: number;
}

function compactSizeLength(n: number): number {
  return n < 0xfd ? 1 : n <= 0xffff ? 3 : 5;
}

/** Peso de un barrido de `inputs` entradas P2WPKH a una salida con script de `scriptLength` bytes. */
export function sweepWeight(inputs: number, scriptLength: number): number {
  const nonWitness =
    4 + // version
    compactSizeLength(inputs) +
    inputs * (32 + 4 + 1 + 4) + // outpoint, scriptSig vacío, sequence
    compactSizeLength(1) +
    8 + compactSizeLength(scriptLength) + scriptLength +
    4; // locktime
  const witness =
    2 + // marker y flag
    inputs * (1 + 1 + 72 + 1 + 33); // 2 ítems: firma DER + sighash (máx. 72), clave pública comprimida
  return nonWitness * 4 + witness;
}

function feeFor(vsize: number, feeRate: number): bigint {
  const satPerKvB = BigInt(Math.round(feeRate * 1000));
  return (BigInt(vsize) * satPerKvB + 999n) / 1000n;
}

/** Umbral de dust de Bitcoin Core (GetDustThreshold) para una salida con este script. */
export function dustThreshold(script: Uint8Array, witness: boolean): bigint {
  const outputSize = 8 + compactSizeLength(script.length) + script.length;
  const spendSize = witness ? 32 + 4 + 1 + Math.floor(107 / 4) + 4 : 32 + 4 + 1 + 107 + 4;
  return BigInt((outputSize + spendSize) * DUST_RELAY_FEE);
}

function assertFeeRate(feeRate: number): void {
  if (!Number.isFinite(feeRate) || feeRate < MIN_FEE_RATE || feeRate > MAX_FEE_RATE) {
    throw new CoreError('INVALID_FEE_RATE', `Tasa de comisión fuera de rango: ${feeRate}`, { min: MIN_FEE_RATE, max: MAX_FEE_RATE });
  }
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

/** Lee el monto de un UTXO desde la transacción completa, verificando txid y script. */
export function readFundingUtxo(utxo: FundingUtxo, giftScript: Uint8Array): SweepInput {
  const txid = utxo.txid.toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(txid) || !Number.isInteger(utxo.vout) || utxo.vout < 0 || utxo.vout > 0xffffffff) {
    throw new CoreError('INVALID_UTXO', 'UTXO con formato inválido.');
  }
  let tx: Transaction;
  try {
    tx = Transaction.fromRaw(hex.decode(utxo.rawTx.toLowerCase()), {
      allowUnknownInputs: true,
      allowUnknownOutputs: true,
      allowUnknownVersion: true,
      disableScriptCheck: true,
    });
  } catch {
    throw new CoreError('INVALID_UTXO', 'No se pudo leer la transacción del UTXO.', { txid });
  }
  if (tx.id !== txid) throw new CoreError('INVALID_UTXO', 'La transacción no corresponde al txid.', { txid });
  if (utxo.vout >= tx.outputsLength) throw new CoreError('INVALID_UTXO', 'La salida no existe.', { txid, vout: utxo.vout });
  const output = tx.getOutput(utxo.vout);
  if (output.script === undefined || output.amount === undefined || !equalBytes(output.script, giftScript)) {
    throw new CoreError('INVALID_UTXO', 'La salida no es de la dirección del regalo.', { txid, vout: utxo.vout });
  }
  return { txid, vout: utxo.vout, amount: output.amount };
}

export interface PlanSweepOptions {
  readonly network: Network;
  /**
   * Solo UTXO con al menos 1 confirmación: uno sin confirmar puede desaparecer por RBF
   * y dejar el barrido inválido.
   */
  readonly utxos: readonly FundingUtxo[];
  /** Script de la dirección del regalo (GiftWallet.script). */
  readonly giftScript: Uint8Array;
  readonly destination: Destination;
  readonly feeRate: number;
}

export function planSweep({ network, utxos, giftScript, destination, feeRate }: PlanSweepOptions): SweepPlan {
  assertNetwork(network);
  assertFeeRate(feeRate);
  if (destination.network !== network) throw new CoreError('WRONG_NETWORK', 'La dirección de destino se validó para otra red.');
  if (utxos.length === 0) throw new CoreError('NO_UTXOS', 'El regalo no tiene fondos.');
  const seen = new Set<string>();
  const inputs = utxos.map((u) => {
    const input = readFundingUtxo(u, giftScript);
    const key = `${input.txid}:${input.vout}`;
    if (seen.has(key)) throw new CoreError('INVALID_UTXO', 'UTXO repetido.', { txid: input.txid, vout: input.vout });
    seen.add(key);
    return input;
  });
  const total = inputs.reduce((sum, i) => sum + i.amount, 0n);
  if (total <= 0n || total > MAX_MONEY) throw new CoreError('INVALID_UTXO', 'Monto total inválido.');
  const weight = sweepWeight(inputs.length, destination.script.length);
  if (weight > MAX_STANDARD_WEIGHT) throw new CoreError('INVALID_UTXO', 'Demasiados UTXO para una sola transacción.', { inputs: inputs.length });
  const vsize = Math.ceil(weight / 4);
  const fee = feeFor(vsize, feeRate);
  const amount = total - fee;
  const dust = dustThreshold(destination.script, destination.witness);
  if (amount < dust) {
    throw new CoreError('AMOUNT_BELOW_DUST', 'Después de la comisión no queda un monto que la red acepte.', { total, fee, dust });
  }
  return Object.freeze({ network, inputs: Object.freeze(inputs), giftScript, destination, feeRate, total, fee, amount, weight, vsize });
}

/** Comisión de barrer un regalo de una entrada a una dirección P2WPKH. */
export function estimateSweepFee(feeRate: number, inputs = 1, destinationScriptLength = 22): bigint {
  assertFeeRate(feeRate);
  return feeFor(Math.ceil(sweepWeight(inputs, destinationScriptLength) / 4), feeRate);
}

/** Monto mínimo que tiene sentido regalar con esta comisión: barrerlo deja más que dust. */
export function minimumGiftAmount(feeRate: number): bigint {
  return estimateSweepFee(feeRate) + dustThreshold(new Uint8Array(22), true);
}

export interface SignedSweep {
  readonly hex: string;
  readonly txid: string;
  readonly fee: bigint;
  readonly amount: bigint;
  readonly weight: number;
  readonly vsize: number;
}

export function signSweep(plan: SweepPlan, wallet: GiftWallet): SignedSweep {
  if (wallet.network !== plan.network) throw new CoreError('SIGNING_FAILED', 'La billetera es de otra red.');
  if (!equalBytes(wallet.script, plan.giftScript)) throw new CoreError('SIGNING_FAILED', 'La billetera no es la del regalo.');
  const tx = new Transaction({ version: 2, lockTime: 0, lowR: true });
  for (const input of plan.inputs) {
    tx.addInput({
      txid: input.txid,
      index: input.vout,
      sequence: RBF_SEQUENCE,
      witnessUtxo: { script: plan.giftScript, amount: input.amount },
    });
  }
  tx.addOutput({ script: plan.destination.script, amount: plan.amount });
  const signed = tx.sign(wallet.privateKey);
  if (signed !== plan.inputs.length) {
    throw new CoreError('SIGNING_FAILED', `Se firmaron ${signed} de ${plan.inputs.length} entradas.`);
  }
  tx.finalize();

  // Verificaciones finales: lo firmado tiene que ser exactamente el plan.
  const out = tx.getOutput(0);
  if (
    tx.outputsLength !== 1 ||
    out.amount !== plan.amount ||
    out.script === undefined ||
    !equalBytes(out.script, plan.destination.script) ||
    tx.fee !== plan.fee ||
    tx.weight > plan.weight
  ) {
    throw new CoreError('SIGNING_FAILED', 'La transacción firmada no coincide con el plan.');
  }
  return Object.freeze({ hex: tx.hex, txid: tx.id, fee: plan.fee, amount: plan.amount, weight: tx.weight, vsize: tx.vsize });
}
