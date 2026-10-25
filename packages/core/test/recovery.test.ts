import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { sha256 } from '@noble/hashes/sha2.js';
import { createBase58check, hex } from '@scure/base';
import { HDKey } from '@scure/bip32';
import { mnemonicToSeedSync } from '@scure/bip39';
import { Transaction } from '@scure/btc-signer';
import {
  buildRecoveryPsbt,
  deriveGift,
  deriveMultisigGift,
  deriveRecoveryChild,
  descriptorChecksum,
  finalizeRecoveryPsbt,
  getNetwork,
  giftRecoveryDescriptor,
  isCoreError,
  masterRootFromMnemonic,
  multisigGiftWallet,
  openGiftWallet,
  openRecoveryKey,
  parseDestination,
  parseGiftWitnessScript,
  parseRecoveryKey,
  planSweep,
  psbtToBase64,
  readPsbt,
  recoveryKeyText,
  sealRecoveryKey,
  signSweep,
  sweepWeight,
} from '../src/index.ts';
import { assertCoreError, makeFundingTx, toHex, verifyP2WSHMultisigInputs } from './helpers.ts';

// Recupero avanzado: multifirma 1-de-2 con la clave pública BIP48 de la billetera del que regala.
// Ver docs/derivacion.md, sección 10. Los vectores de abajo fijan el esquema: no cambian en silencio.

const B58 = createBase58check(sha256);
const signet = getNetwork('signet');
const mainnet = getNetwork('mainnet', { allowMainnet: true });
// Clave maestra de la web (la del que regala, en su bóveda) y billetera propia, distinta.
const MASTER = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const WALLET = 'legal winner thank year wave sausage worth useful legal winner thank yellow';
const master = masterRootFromMnemonic(MASTER);
const walletRoot = HDKey.fromMasterSeed(mnemonicToSeedSync(WALLET, ''));
const keyText = recoveryKeyText(walletRoot, signet);
const key = parseRecoveryKey(keyText, signet);

const problem = (fn: () => unknown): string => {
  try {
    fn();
  } catch (e) {
    if (isCoreError(e, 'INVALID_XPUB')) return (e.details as { problem: string }).problem;
    throw e;
  }
  return 'ninguno';
};

describe('clave pública de recupero (BIP48 P2WSH)', () => {
  it('forma canónica con huella y ruta; acepta comillas o h, espacios y una rama al final', () => {
    assert.match(keyText, /^\[[0-9a-f]{8}\/48h\/1h\/0h\/2h\]tpub/);
    assert.equal(key.fingerprint, walletRoot.fingerprint);
    assert.equal(key.text, keyText);
    const close = keyText.indexOf(']');
    const quoted = keyText.slice(0, close).replace(/h/g, "'") + keyText.slice(close);
    assert.equal(parseRecoveryKey(`  ${quoted}\n`, signet).text, keyText);
    assert.equal(parseRecoveryKey(`${keyText}/0/*`, signet).text, keyText);
  });

  it('acepta Vpub (SLIP-132) y el JSON de exportación multifirma de Coldcard', () => {
    const tpub = keyText.slice(keyText.indexOf(']') + 1);
    // Vpub: la misma clave con la versión SLIP-132 de multifirma P2WSH para redes de prueba.
    const raw = B58.decode(tpub);
    raw.set([0x02, 0x57, 0x54, 0x83], 0);
    const vpub = B58.encode(raw);
    assert.ok(vpub.startsWith('Vpub'));
    assert.equal(parseRecoveryKey(`[${key.fingerprintHex}/48'/1'/0'/2']${vpub}`, signet).text, keyText);
    const json = JSON.stringify({ xfp: key.fingerprintHex.toUpperCase(), p2wsh_deriv: "m/48'/1'/0'/2'", p2wsh: vpub, account: '0' });
    assert.equal(parseRecoveryKey(json, signet).text, keyText);
  });

  it('rechaza lo que no sirve, diciendo por qué', () => {
    const tpub = keyText.slice(keyText.indexOf(']') + 1);
    assert.equal(problem(() => parseRecoveryKey(tpub, signet)), 'origen');
    assert.equal(problem(() => parseRecoveryKey(walletRoot.derive("m/48'/1'/0'/2'").privateExtendedKey, signet)), 'privada');
    assert.equal(problem(() => parseRecoveryKey(keyText, mainnet)), 'red');
    assert.equal(problem(() => parseRecoveryKey(keyText.replace('/48h/', '/84h/'), signet)), 'ruta');
    assert.equal(problem(() => parseRecoveryKey(keyText.replace('/2h]', '/1h]'), signet)), 'ruta');
    assert.equal(problem(() => parseRecoveryKey('hola', signet)), 'formato');
    assert.equal(problem(() => parseRecoveryKey(`[zzzz/48h/1h/0h/2h]${tpub}`, signet)), 'origen');
  });
});

describe('regalo multifirma 1-de-2', () => {
  const gift = deriveMultisigGift(master, 0, 'es', signet, key);

  it('misma semilla y palabras que el regalo común; otra dirección (P2WSH)', () => {
    const plain = deriveGift(master, 0, 'es', signet);
    assert.deepEqual(gift.passphraseWords, plain.passphraseWords);
    assert.equal(toHex(gift.entropy), toHex(plain.entropy));
    assert.notEqual(gift.address, plain.address);
    assert.match(gift.address, /^tb1q[0-9a-z]{58}$/);
  });

  it('vector de regresión: dirección y script de testigo', () => {
    // Si esto cambia, cambió el esquema de docs/derivacion.md (sección 10).
    assert.equal(key.text, VECTOR.key);
    assert.equal(gift.address, VECTOR.address);
    assert.equal(toHex(gift.witnessScript), VECTOR.witnessScript);
    assert.equal(gift.recoveryPath.join('/'), [48 + 2 ** 31, 1 + 2 ** 31, 2 ** 31, 2 + 2 ** 31, 0, 0].join('/'));
  });

  it('quien recibe abre la misma dirección con el link, las palabras y el script del servidor', () => {
    const wallet = multisigGiftWallet(openGiftWallet(gift.entropy, gift.passphraseWords, 'es', signet), gift.witnessScript);
    assert.equal(wallet.address, gift.address);
    // Un script de otro regalo no se acepta.
    const other = deriveMultisigGift(master, 1, 'es', signet, key);
    assertCoreError(() => multisigGiftWallet(openGiftWallet(gift.entropy, gift.passphraseWords, 'es', signet), other.witnessScript), 'INVALID_UTXO');
  });

  it('el script de testigo es una 1-de-2 ordenada con la clave del regalo y la /0/i de la billetera', () => {
    const [a, b] = parseGiftWitnessScript(gift.witnessScript);
    const child = deriveRecoveryChild(key, 0).publicKey;
    assert.deepEqual(new Set([toHex(a), toHex(b)]), new Set([toHex(gift.publicKey), toHex(child)]));
    assert.ok(toHex(a) < toHex(b));
  });

  it('cada regalo usa otra clave de la billetera: no se pueden vincular', () => {
    const g1 = deriveMultisigGift(master, 1, 'es', signet, key);
    const [a, b] = parseGiftWitnessScript(g1.witnessScript);
    const child0 = toHex(deriveRecoveryChild(key, 0).publicKey);
    assert.ok(toHex(a) !== child0 && toHex(b) !== child0);
  });

  it('descriptor con las dos xpub y checksum válido', () => {
    const d = giftRecoveryDescriptor(key, 0, gift.account);
    const [body, cs] = d.split('#') as [string, string];
    assert.equal(descriptorChecksum(body), cs);
    assert.match(body, /^wsh\(sortedmulti\(1,\[[0-9a-f]{8}\/48h\/1h\/0h\/2h\]tpub[^/]+\/0\/0,\[[0-9a-f]{8}\/84h\/1h\/0h\]tpub[^/]+\/0\/0\)\)$/);
  });
});

describe('barrido de un regalo multifirma', () => {
  const gift = deriveMultisigGift(master, 3, 'en', signet, key);
  const wallet = multisigGiftWallet(openGiftWallet(gift.entropy, gift.passphraseWords, 'en', signet), gift.witnessScript);
  const script = wallet.script;
  const f1 = makeFundingTx([{ script, amount: 30_000n }], 7);
  const f2 = makeFundingTx([{ script, amount: 20_000n }], 8);
  const destination = parseDestination('tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx', signet);
  const plan = planSweep({ network: signet, utxos: [{ txid: f1.txid, vout: 0, rawTx: f1.rawTx }, { txid: f2.txid, vout: 0, rawTx: f2.rawTx }], giftScript: script, destination, feeRate: 2, witnessScript: gift.witnessScript });

  it('quien recibe firma con la clave del regalo; la firma verifica con un BIP143 independiente', () => {
    const signed = signSweep(plan, wallet);
    const prevouts = plan.inputs.map((i) => ({ script, amount: i.amount }));
    assert.ok(verifyP2WSHMultisigInputs(hex.decode(signed.hex), prevouts, wallet.publicKey));
    assert.ok(signed.weight <= plan.weight);
    assert.equal(plan.weight, sweepWeight(2, destination.script.length, true));
  });

  it('no arma el plan con un script que no es el de la dirección', () => {
    const other = deriveMultisigGift(master, 4, 'en', signet, key);
    assertCoreError(
      () => planSweep({ network: signet, utxos: [{ txid: f1.txid, vout: 0, rawTx: f1.rawTx }], giftScript: script, destination, feeRate: 2, witnessScript: other.witnessScript }),
      'SIGNING_FAILED',
    );
  });

  it('el que regala recupera con una PSBT que firma su billetera', () => {
    const rawTxs = new Map([[f1.txid, f1.rawTx], [f2.txid, f2.rawTx]]);
    const psbt = buildRecoveryPsbt({ plan, witnessScript: gift.witnessScript, rawTxs, key, index: 3, gift: { ...gift.account, publicKey: gift.publicKey } });
    // La billetera: lee la PSBT, encuentra su clave por la huella y la ruta, y firma.
    const tx = Transaction.fromPSBT(readPsbt(psbtToBase64(psbt)));
    const input = tx.getInput(0);
    const mine = input.bip32Derivation?.find(([, d]) => d.fingerprint === walletRoot.fingerprint);
    assert.ok(mine);
    const childKey = walletRoot.derive(`m/${mine[1].path.map((n) => (n >= 2 ** 31 ? `${n - 2 ** 31}'` : String(n))).join('/')}`);
    assert.equal(toHex(childKey.publicKey as Uint8Array), toHex(mine[0]));
    tx.sign(childKey.privateKey as Uint8Array);
    const signed = finalizeRecoveryPsbt(tx.toPSBT(), plan, gift.witnessScript);
    const prevouts = plan.inputs.map((i) => ({ script, amount: i.amount }));
    assert.ok(verifyP2WSHMultisigInputs(hex.decode(signed.hex), prevouts, childKey.publicKey as Uint8Array));
    assert.equal(signed.amount, plan.amount);
  });

  it('una PSBT sin firmar, o con otra salida, no se acepta', () => {
    const rawTxs = new Map([[f1.txid, f1.rawTx], [f2.txid, f2.rawTx]]);
    const psbt = buildRecoveryPsbt({ plan, witnessScript: gift.witnessScript, rawTxs, key, index: 3 });
    assert.equal((assertCoreError(() => finalizeRecoveryPsbt(psbt, plan, gift.witnessScript), 'SIGNING_FAILED').details as { reason: string }).reason, 'sin_firma');
    const other = planSweep({ ...plan, utxos: [{ txid: f1.txid, vout: 0, rawTx: f1.rawTx }, { txid: f2.txid, vout: 0, rawTx: f2.rawTx }], feeRate: 3 });
    const otherPsbt = buildRecoveryPsbt({ plan: other, witnessScript: gift.witnessScript, rawTxs, key, index: 3 });
    assert.equal((assertCoreError(() => finalizeRecoveryPsbt(otherPsbt, plan, gift.witnessScript), 'SIGNING_FAILED').details as { reason: string }).reason, 'otra_psbt');
  });

  it('con otra billetera de recupero no arma la PSBT', () => {
    const otherKey = parseRecoveryKey(recoveryKeyText(master, signet), signet);
    const rawTxs = new Map([[f1.txid, f1.rawTx]]);
    assert.equal(
      (assertCoreError(() => buildRecoveryPsbt({ plan, witnessScript: gift.witnessScript, rawTxs, key: otherKey, index: 3 }), 'SIGNING_FAILED').details as { reason: string }).reason,
      'otra_billetera',
    );
  });

  it('lee la PSBT en base64, hex o binario', () => {
    const psbt = buildRecoveryPsbt({ plan, witnessScript: gift.witnessScript, rawTxs: new Map(), key, index: 3 });
    assert.equal(toHex(readPsbt(psbtToBase64(psbt))), toHex(psbt));
    assert.equal(toHex(readPsbt(toHex(psbt))), toHex(psbt));
    assert.equal(toHex(readPsbt(psbt)), toHex(psbt));
    assert.equal(toHex(readPsbt(new TextEncoder().encode(psbtToBase64(psbt)))), toHex(psbt));
    assertCoreError(() => readPsbt('hola'), 'SIGNING_FAILED');
  });
});

describe('clave de recupero guardada cifrada', () => {
  it('se abre con la misma clave maestra y no con otra', async () => {
    const sealed = await sealRecoveryKey(master, key);
    assert.match(sealed, /^r1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+$/);
    assert.ok(!sealed.includes('tpub'));
    assert.equal((await openRecoveryKey(master, sealed, signet)).text, key.text);
    await assert.rejects(openRecoveryKey(masterRootFromMnemonic(WALLET), sealed, signet), (e: unknown) => isCoreError(e, 'INVALID_VAULT'));
  });
});

// Clave maestra "abandon … about", billetera propia "legal winner … yellow", regalo 0, signet.
// Verificado además contra sortedMultisig de @scure/btc-signer (ordena por su cuenta).
const VECTOR = {
  key: '[b8688df1/48h/1h/0h/2h]tpubDEfobrrtptRTbKf4gysDhoabneABDTAcdj3Vbn4XwPsLE2pmqpizSPRG6zHsbAMuiSgWmWPsYCLHTKTPpyrGJ5rAoTpKoQNZcxodiPf2tSJ',
  address: 'tb1q0ys5aacsl98s4sj5xpaeuxrras85v8kavdfytldr79yu22ywtp2q60867y',
  witnessScript:
    '512102afcb20e4ea1db9f70715346a94666739567b2cb4bfbd83e5491bf9fdb99674922103aa93b6a70ed21658af2fafcc7344ccc5bff0703cd872bd9d9f06825e02f2145c52ae',
};
