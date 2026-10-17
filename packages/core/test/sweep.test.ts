import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { HDKey } from '@scure/bip32';
import { p2pk, p2pkh, p2sh, p2tr, p2wpkh, p2wsh, TEST_NETWORK } from '@scure/btc-signer';
import {
  deriveGiftSecrets,
  dustThreshold,
  getNetwork,
  minimumGiftAmount,
  openGiftWallet,
  parseDestination,
  planSweep,
  RBF_SEQUENCE,
  signSweep,
  sweepWeight,
} from '../src/index.ts';
import {
  assertCoreError,
  bip143PreimageP2WPKH,
  bip143SighashP2WPKH,
  fromHex,
  loadVector,
  makeFundingTx,
  parseTx,
  toHex,
} from './helpers.ts';

const bip85 = loadVector<{ master: string }>('bip85.json');
const signet = getNetwork('signet');
const root = HDKey.fromExtendedKey(bip85.master);
const gift = deriveGiftSecrets(root, 0, 'es');
const wallet = openGiftWallet(gift.entropy, gift.passphraseWords, 'es', signet);

const otherKey = secp256k1.getPublicKey(new Uint8Array(32).fill(9));
const dest = parseDestination(p2wpkh(otherKey, TEST_NETWORK).address as string, signet);

function fund(amounts: bigint[], salt = 1) {
  const f = makeFundingTx(
    amounts.map((amount) => ({ script: wallet.script, amount })),
    salt,
  );
  return amounts.map((_, vout) => ({ txid: f.txid, vout, rawTx: f.rawTx }));
}

describe('Verificador BIP143 independiente (vector oficial)', () => {
  const v = loadVector<{
    unsignedTx: string;
    inputIndex: number;
    amount: string;
    publicKey: string;
    scriptPubKey: string;
    preimage: string;
    sigHash: string;
    signature: string;
  }>('bip143-p2wpkh.json');

  it('reproduce la preimagen y el sighash oficiales, y verifica la firma oficial', () => {
    const tx = parseTx(fromHex(v.unsignedTx));
    const pubkeyHash = fromHex(v.scriptPubKey).slice(2);
    assert.equal(toHex(bip143PreimageP2WPKH(tx, v.inputIndex, pubkeyHash, BigInt(v.amount))), v.preimage);
    const sighash = bip143SighashP2WPKH(tx, v.inputIndex, pubkeyHash, BigInt(v.amount));
    assert.equal(toHex(sighash), v.sigHash);
    const der = fromHex(v.signature).slice(0, -1); // sin el byte de sighash
    assert.ok(secp256k1.verify(der, sighash, fromHex(v.publicKey), { prehash: false, format: 'der' }));
  });
});

describe('Plan del barrido', () => {
  it('peso, vsize y comisión de una entrada a P2WPKH', () => {
    // 82 bytes sin witness (328 WU) + 2 de marker/flag + 108 de witness = 438 WU → 110 vB.
    assert.equal(sweepWeight(1, 22), 438);
    const plan = planSweep({ network: signet, utxos: fund([100_000n]), giftScript: wallet.script, destination: dest, feeRate: 1 });
    assert.equal(plan.vsize, 110);
    assert.equal(plan.fee, 110n);
    assert.equal(plan.amount, 99_890n);
    assert.equal(plan.total, 100_000n);
  });

  it('tasas fraccionarias sin errores de redondeo', () => {
    const utxos = fund([100_000n]);
    const at = (feeRate: number) => planSweep({ network: signet, utxos, giftScript: wallet.script, destination: dest, feeRate }).fee;
    assert.equal(at(0.1), 11n);
    assert.equal(at(2.5), 275n);
    assert.equal(at(1.01), 112n); // 111.1 → 112 (siempre hacia arriba)
  });

  it('suma varios UTXO y lee los montos de la transacción, no de un servidor', () => {
    const plan = planSweep({ network: signet, utxos: fund([30_000n, 20_000n, 1_000n]), giftScript: wallet.script, destination: dest, feeRate: 2 });
    assert.equal(plan.total, 51_000n);
    assert.equal(plan.inputs.length, 3);
    assert.equal(plan.amount, plan.total - plan.fee);
  });

  it('umbrales de dust de Bitcoin Core por tipo de dirección', () => {
    const cases: Array<[Uint8Array, boolean, bigint]> = [
      [p2wpkh(otherKey).script, true, 294n],
      [p2wsh(p2pk(otherKey)).script, true, 330n],
      [p2tr(otherKey.slice(1)).script, true, 330n],
      [p2pkh(otherKey).script, false, 546n],
      [p2sh(p2wpkh(otherKey)).script, false, 540n],
    ];
    for (const [script, witness, expected] of cases) assert.equal(dustThreshold(script, witness), expected);
  });

  it('si después de la comisión queda dust, explica por qué', () => {
    const error = assertCoreError(
      () => planSweep({ network: signet, utxos: fund([403n]), giftScript: wallet.script, destination: dest, feeRate: 1 }),
      'AMOUNT_BELOW_DUST',
    );
    assert.deepEqual(error.details, { total: 403n, fee: 110n, dust: 294n });
    planSweep({ network: signet, utxos: fund([404n]), giftScript: wallet.script, destination: dest, feeRate: 1 });
    assert.equal(minimumGiftAmount(1), 404n);
  });

  it('rechaza UTXO que no son del regalo o no coinciden con su txid', () => {
    const [good] = fund([10_000n]);
    assert.ok(good);
    const plan = (utxos: Parameters<typeof planSweep>[0]['utxos']) =>
      planSweep({ network: signet, utxos, giftScript: wallet.script, destination: dest, feeRate: 1 });
    assertCoreError(() => plan([]), 'NO_UTXOS');
    assertCoreError(() => plan([{ ...good, txid: 'ab'.repeat(32) }]), 'INVALID_UTXO');
    assertCoreError(() => plan([{ ...good, vout: 1 }]), 'INVALID_UTXO');
    assertCoreError(() => plan([{ ...good, vout: -1 }]), 'INVALID_UTXO');
    assertCoreError(() => plan([{ ...good, txid: 'xyz' }]), 'INVALID_UTXO');
    assertCoreError(() => plan([{ ...good, rawTx: 'zz' }]), 'INVALID_UTXO');
    assertCoreError(() => plan([good, good]), 'INVALID_UTXO');
    // Un servidor que informa una transacción ajena (paga a otra dirección).
    const foreign = makeFundingTx([{ script: dest.script, amount: 10_000n }], 9);
    assertCoreError(() => plan([{ txid: foreign.txid, vout: 0, rawTx: foreign.rawTx }]), 'INVALID_UTXO');
    // Un servidor que cambia el monto: el txid ya no coincide.
    const tampered = good.rawTx.replace('1027000000000000', '2027000000000000');
    assert.notEqual(tampered, good.rawTx);
    assertCoreError(() => plan([{ ...good, rawTx: tampered }]), 'INVALID_UTXO');
  });

  it('no arma transacciones más pesadas que el límite estándar', () => {
    assert.ok(sweepWeight(1469, 22) <= 400_000);
    assert.ok(sweepWeight(1470, 22) > 400_000);
    const many = Array.from({ length: 1470 }, (_, i) => 1_000n + BigInt(i));
    assertCoreError(
      () => planSweep({ network: signet, utxos: fund(many, 7), giftScript: wallet.script, destination: dest, feeRate: 1 }),
      'INVALID_UTXO',
    );
  });

  it('rechaza una dirección validada para otra red', () => {
    const regtestDest = parseDestination(p2wpkh(otherKey, getNetwork('regtest').btc).address as string, getNetwork('regtest'));
    assertCoreError(
      () => planSweep({ network: signet, utxos: fund([10_000n]), giftScript: wallet.script, destination: regtestDest, feeRate: 1 }),
      'WRONG_NETWORK',
    );
  });

  it('rechaza tasas de comisión absurdas', () => {
    const utxos = fund([100_000n]);
    for (const feeRate of [0, 0.05, 1001, Number.NaN, Number.POSITIVE_INFINITY, -1]) {
      assertCoreError(() => planSweep({ network: signet, utxos, giftScript: wallet.script, destination: dest, feeRate }), 'INVALID_FEE_RATE');
    }
  });
});

describe('Firma del barrido', () => {
  const plan = planSweep({ network: signet, utxos: fund([60_000n, 25_000n], 3), giftScript: wallet.script, destination: dest, feeRate: 3 });
  const signed = signSweep(plan, wallet);
  const tx = parseTx(fromHex(signed.hex));

  it('una sola salida, al destino, por el monto del plan', () => {
    assert.equal(tx.outputs.length, 1);
    assert.equal(toHex(tx.outputs[0]?.script as Uint8Array), toHex(dest.script));
    assert.equal(tx.outputs[0]?.amount, plan.amount);
    assert.equal(signed.fee, plan.total - plan.amount);
  });

  it('versión 2, locktime 0, RBF activado en todas las entradas', () => {
    assert.equal(tx.version, 2);
    assert.equal(tx.lockTime, 0);
    for (const input of tx.inputs) {
      assert.equal(input.sequence, RBF_SEQUENCE);
      assert.equal(input.scriptSig.length, 0);
    }
  });

  it('pesa como mucho lo estimado', () => {
    assert.ok(signed.weight <= plan.weight);
    assert.ok(signed.vsize <= plan.vsize);
  });

  it('cada firma verifica con un BIP143 independiente, low-S y low-R', () => {
    const pubkeyHash = p2wpkh(wallet.publicKey).script.slice(2);
    tx.inputs.forEach((_, i) => {
      const [sig, pubkey] = tx.witnesses[i] ?? [];
      assert.ok(sig && pubkey);
      assert.equal(toHex(pubkey), toHex(wallet.publicKey));
      assert.equal(sig[sig.length - 1], 0x01, 'SIGHASH_ALL');
      const der = sig.slice(0, -1);
      const sighash = bip143SighashP2WPKH(tx, i, pubkeyHash, plan.inputs[i]?.amount as bigint);
      assert.ok(secp256k1.verify(der, sighash, wallet.publicKey, { prehash: false, format: 'der', lowS: true }));
      // low-R: r ocupa 32 bytes sin relleno (DER: 30 len 02 20 ...).
      assert.equal(der[3], 0x20);
    });
  });

  it('el txid es el hash de la transacción sin witness', () => {
    assert.match(signed.txid, /^[0-9a-f]{64}$/);
  });

  it('no firma con otra billetera ni otra red', () => {
    const other = openGiftWallet(deriveGiftSecrets(root, 1, 'es').entropy, gift.passphraseWords, 'es', signet);
    assertCoreError(() => signSweep(plan, other), 'SIGNING_FAILED');
    const regtestWallet = openGiftWallet(gift.entropy, gift.passphraseWords, 'es', getNetwork('regtest'));
    assertCoreError(() => signSweep(plan, regtestWallet), 'SIGNING_FAILED');
  });
});
