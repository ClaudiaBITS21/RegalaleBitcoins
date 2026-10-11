import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { HDKey } from '@scure/bip32';
import { mnemonicToSeedSync } from '@scure/bip39';
import { p2wpkh, TEST_NETWORK } from '@scure/btc-signer';
import {
  bip85Hex,
  deriveGiftSecrets,
  generateMasterMnemonic,
  getNetwork,
  giftMnemonicPath,
  giftPassphrasePath,
  isValidMasterMnemonic,
  LANGS,
  masterRootFromMnemonic,
  type Network,
  normalizeMnemonic,
  openGiftWallet,
  passphraseWordsFromEntropy,
} from '../src/index.ts';
import { assertCoreError, loadVector, toHex } from './helpers.ts';

const bip85 = loadVector<{ master: string; bip39: Array<{ entropy: string; mnemonic: string }> }>('bip85.json');
const root = HDKey.fromExtendedKey(bip85.master);
const signet = getNetwork('signet');

describe('Clave maestra', () => {
  it('genera 12 palabras válidas en inglés con crypto.getRandomValues', () => {
    const a = generateMasterMnemonic();
    const b = generateMasterMnemonic();
    assert.equal(a.split(' ').length, 12);
    assert.ok(isValidMasterMnemonic(a));
    assert.notEqual(a, b);
  });

  it('usa la fuente aleatoria que se le pasa (para tests)', () => {
    assert.equal(
      generateMasterMnemonic(() => new Uint8Array(16)),
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
    );
  });

  it('acepta el código escrito con mayúsculas y espacios de más', () => {
    const typed = '  Abandon abandon ABANDON abandon\nabandon abandon abandon abandon abandon abandon abandon   about ';
    assert.equal(normalizeMnemonic(typed), 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');
    assert.equal(masterRootFromMnemonic(typed).depth, 0);
  });

  it('rechaza otro largo, checksum inválido u otro idioma', () => {
    assertCoreError(() => masterRootFromMnemonic(bip85.bip39[2]?.mnemonic ?? ''), 'INVALID_MNEMONIC'); // 24 palabras
    assertCoreError(() => masterRootFromMnemonic('abandon '.repeat(12).trim()), 'INVALID_MNEMONIC');
    assertCoreError(() => masterRootFromMnemonic('ábaco '.repeat(11) + 'abierto'), 'INVALID_MNEMONIC');
    assertCoreError(() => masterRootFromMnemonic(''), 'INVALID_MNEMONIC');
  });
});

describe('Derivación del regalo', () => {
  it('paths documentados', () => {
    assert.equal(giftMnemonicPath(5), "m/83696968'/39'/0'/12'/5'");
    assert.equal(giftPassphrasePath(5), "m/83696968'/128169'/16'/5'");
  });

  it('la semilla del regalo 0 es el vector oficial BIP85 de 12 palabras', () => {
    const gift = deriveGiftSecrets(root, 0, 'es');
    assert.equal(toHex(gift.entropy), bip85.bip39[0]?.entropy);
    assert.equal(gift.mnemonic, bip85.bip39[0]?.mnemonic);
  });

  it('la passphrase sale de la aplicación HEX de 16 bytes con el mismo índice', () => {
    for (const lang of LANGS) {
      const gift = deriveGiftSecrets(root, 3, lang);
      assert.deepEqual(gift.passphraseWords, passphraseWordsFromEntropy(bip85Hex(root, 16, 3), lang));
    }
  });

  // Vectores de regresión propios (no oficiales): fijan el esquema para que ningún
  // cambio futuro altere en silencio cómo se derivan los regalos ya creados.
  it('regresión: regalo 0 desde la clave de prueba de BIP85, en los 4 idiomas', () => {
    const expected = {
      es: ['cuerda cuento nuez cuento', 'tb1qy9nq3wd36d6gd06y7sx8s07dz2fc3wuaf3jehy'],
      pt: ['colono colmeia mesclar colmeia', 'tb1qyru6njz2apxcvh2djpdqgrhucn2zdp5y0pmnsy'],
      en: ['detect detail outside detail', 'tb1qljtn76nmu5nspy998qc8r676nwx36h76npqd60'],
      it: ['dipinto dinnanzi periodo dinnanzi', 'tb1qqg83zxwvst72j297jwslwex3pzzjsnj3xp9teg'],
    } as const;
    for (const lang of LANGS) {
      const gift = deriveGiftSecrets(root, 0, lang);
      assert.equal(gift.passphraseWords.join(' '), expected[lang][0]);
      assert.equal(openGiftWallet(gift.entropy, gift.passphraseWords, lang, signet).address, expected[lang][1]);
    }
  });

  it('índices distintos dan regalos independientes', () => {
    const a = deriveGiftSecrets(root, 0, 'en');
    const b = deriveGiftSecrets(root, 1, 'en');
    assert.notEqual(toHex(a.entropy), toHex(b.entropy));
    assert.notDeepEqual(a.passphraseWords, b.passphraseWords);
  });

  it('la passphrase nunca son las primeras palabras de la semilla (paths separados)', () => {
    for (let i = 0; i < 25; i++) {
      const gift = deriveGiftSecrets(root, i, 'en');
      assert.notEqual(gift.passphraseWords.join(' '), gift.mnemonic.split(' ').slice(0, 4).join(' '));
    }
  });

  it('cualquier billetera estándar recupera el regalo: BIP39 + passphrase + BIP84', () => {
    for (const lang of LANGS) {
      const gift = deriveGiftSecrets(root, 7, lang);
      const wallet = openGiftWallet(gift.entropy, gift.passphraseWords, lang, signet);
      // Lo mismo, hecho "a mano" como lo haría Sparrow o Electrum en testnet/signet.
      const seed = mnemonicToSeedSync(gift.mnemonic, gift.passphraseWords.join(' '));
      const key = HDKey.fromMasterSeed(seed).derive("m/84'/1'/0'/0/0");
      assert.equal(wallet.address, p2wpkh(key.publicKey as Uint8Array, TEST_NETWORK).address);
      assert.equal(wallet.path, "m/84'/1'/0'/0/0");
    }
  });
});

describe('Billetera del regalo (lado del que recibe)', () => {
  const gift = deriveGiftSecrets(root, 2, 'es');

  it('acepta las palabras con tilde o en mayúsculas', () => {
    const typed = gift.passphraseWords.map((w) => w.toUpperCase());
    const a = openGiftWallet(gift.entropy, gift.passphraseWords, 'es', signet);
    const b = openGiftWallet(gift.entropy, typed, 'es', signet);
    assert.equal(a.address, b.address);
  });

  it('palabras equivocadas abren otra billetera, sin error', () => {
    const wrong = [...gift.passphraseWords];
    wrong[0] = wrong[0] === 'abaco' ? 'abeja' : 'abaco';
    const right = openGiftWallet(gift.entropy, gift.passphraseWords, 'es', signet);
    const other = openGiftWallet(gift.entropy, wrong, 'es', signet);
    assert.notEqual(right.address, other.address);
  });

  it('valida semilla, palabras y red', () => {
    assertCoreError(() => openGiftWallet(new Uint8Array(15), gift.passphraseWords, 'es', signet), 'INVALID_ENTROPY');
    assertCoreError(() => openGiftWallet(gift.entropy, ['abaco', 'abeja', 'nope', 'abeja'], 'es', signet), 'INVALID_WORD');
    const fake = { ...signet } as Network;
    assertCoreError(() => openGiftWallet(gift.entropy, gift.passphraseWords, 'es', fake), 'INVALID_NETWORK');
  });

  it('wipe() borra la clave privada', () => {
    const wallet = openGiftWallet(gift.entropy, gift.passphraseWords, 'es', signet);
    assert.ok(wallet.privateKey.some((b) => b !== 0));
    wallet.wipe();
    assert.ok(wallet.privateKey.every((b) => b === 0));
  });
});
