import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { HDKey } from '@scure/bip32';
import { p2wpkh, TEST_NETWORK } from '@scure/btc-signer';
import { deriveGiftSecrets, getNetwork, inspectTransaction, openGiftWallet, parseDestination, planSweep, signSweep } from '../src/index.ts';
import { assertCoreError, loadVector, makeFundingTx, toHex } from './helpers.ts';

const signet = getNetwork('signet');
const root = HDKey.fromExtendedKey(loadVector<{ master: string }>('bip85.json').master);
const gift = deriveGiftSecrets(root, 4, 'pt');
const wallet = openGiftWallet(gift.entropy, gift.passphraseWords, 'pt', signet);
const dest = parseDestination(p2wpkh(secp256k1.getPublicKey(new Uint8Array(32).fill(3)), TEST_NETWORK).address as string, signet);

describe('Inspección de transacciones (lado servidor)', () => {
  it('lee entradas, salidas, txid y tamaño de un barrido firmado', () => {
    const f = makeFundingTx([{ script: wallet.script, amount: 40_000n }, { script: wallet.script, amount: 2_000n }], 5);
    const plan = planSweep({
      network: signet,
      utxos: [0, 1].map((vout) => ({ txid: f.txid, vout, rawTx: f.rawTx })),
      giftScript: wallet.script,
      destination: dest,
      feeRate: 1.5,
    });
    const signed = signSweep(plan, wallet);
    const tx = inspectTransaction(signed.hex);
    assert.equal(tx.txid, signed.txid);
    assert.deepEqual(tx.inputs, [{ txid: f.txid, vout: 0 }, { txid: f.txid, vout: 1 }]);
    assert.equal(tx.outputs.length, 1);
    assert.equal(toHex(tx.outputs[0]?.script as Uint8Array), toHex(dest.script));
    assert.equal(tx.outputs[0]?.amount, plan.amount);
    assert.equal(tx.vsize, signed.vsize);
  });

  it('rechaza basura', () => {
    assertCoreError(() => inspectTransaction(''), 'INVALID_UTXO');
    assertCoreError(() => inspectTransaction('zz'), 'INVALID_UTXO');
    assertCoreError(() => inspectTransaction('abc'), 'INVALID_UTXO');
    assertCoreError(() => inspectTransaction('00'.repeat(20)), 'INVALID_UTXO');
    // Una transacción sin firmar no es un barrido.
    const unsigned = makeFundingTx([{ script: dest.script, amount: 1_000n }], 2);
    assert.equal(assertCoreError(() => inspectTransaction(unsigned.rawTx), 'INVALID_UTXO').details?.reason, 'unsigned');
  });
});
