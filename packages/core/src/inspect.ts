import { hex } from '@scure/base';
import { Transaction } from '@scure/btc-signer';
import { CoreError } from './errors.ts';

// Lectura de una transacción firmada, para que el servidor verifique un barrido
// antes de difundirlo (qué gasta y a dónde manda), sin confiar en el navegador.

export interface InspectedTx {
  readonly txid: string;
  readonly inputs: ReadonlyArray<{ readonly txid: string; readonly vout: number }>;
  readonly outputs: ReadonlyArray<{ readonly script: Uint8Array; readonly amount: bigint }>;
  readonly weight: number;
  readonly vsize: number;
}

export function inspectTransaction(rawHex: string): InspectedTx {
  if (!/^(?:[0-9a-fA-F]{2})+$/.test(rawHex) || rawHex.length > 200_000) {
    throw new CoreError('INVALID_UTXO', 'Transacción con formato inválido.', { reason: 'hex' });
  }
  let tx: Transaction;
  try {
    tx = Transaction.fromRaw(hex.decode(rawHex.toLowerCase()), {
      allowUnknownInputs: true,
      allowUnknownOutputs: true,
      disableScriptCheck: true,
    });
  } catch {
    throw new CoreError('INVALID_UTXO', 'No se pudo leer la transacción.', { reason: 'decode' });
  }
  const inputs = Array.from({ length: tx.inputsLength }, (_, i) => {
    const input = tx.getInput(i);
    if (input.txid === undefined || input.index === undefined) {
      throw new CoreError('INVALID_UTXO', 'Entrada incompleta.', { reason: 'input' });
    }
    return { txid: hex.encode(input.txid), vout: input.index };
  });
  const outputs = Array.from({ length: tx.outputsLength }, (_, i) => {
    const output = tx.getOutput(i);
    if (output.script === undefined || output.amount === undefined) {
      throw new CoreError('INVALID_UTXO', 'Salida incompleta.', { reason: 'output' });
    }
    return { script: output.script, amount: output.amount };
  });
  let weight: number;
  let vsize: number;
  try {
    weight = tx.weight;
    vsize = tx.vsize;
  } catch {
    throw new CoreError('INVALID_UTXO', 'La transacción no está firmada.', { reason: 'unsigned' });
  }
  return Object.freeze({ txid: tx.id, inputs, outputs, weight, vsize });
}
