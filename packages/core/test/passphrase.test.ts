import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mnemonicToSeedSync } from '@scure/bip39';
import {
  foldWord,
  LANGS,
  normalizeWord,
  passphraseFromWords,
  passphraseWordsFromEntropy,
  suggestWords,
  WORDLISTS,
} from '../src/index.ts';
import { assertCoreError, toHex } from './helpers.ts';

/** Arma 6 bytes cuyos primeros 44 bits son los 4 índices dados. */
function entropyFor(indices: [number, number, number, number]): Uint8Array {
  let v = 0n;
  for (const i of indices) v = (v << 11n) | BigInt(i);
  v <<= 4n;
  const out = new Uint8Array(6);
  for (let i = 5; i >= 0; i--) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

describe('Passphrase: 44 bits → 4 palabras', () => {
  for (const lang of LANGS) {
    const list = WORDLISTS[lang].map(foldWord);
    it(`${lang}: extremos y patrón conocido`, () => {
      assert.deepEqual(passphraseWordsFromEntropy(new Uint8Array(6), lang), [list[0], list[0], list[0], list[0]]);
      assert.deepEqual(passphraseWordsFromEntropy(new Uint8Array(6).fill(0xff), lang), [list[2047], list[2047], list[2047], list[2047]]);
      assert.deepEqual(passphraseWordsFromEntropy(entropyFor([1, 2, 1024, 2046]), lang), [list[1], list[2], list[1024], list[2046]]);
    });
  }

  it('ignora los bits que sobran (solo usa los primeros 44)', () => {
    const base = entropyFor([5, 6, 7, 8]);
    const longer = new Uint8Array(16).fill(0xff);
    longer.set(base);
    longer[5] = (longer[5] as number) | 0x0f; // los últimos 4 bits del byte 6 no cuentan
    assert.deepEqual(passphraseWordsFromEntropy(longer, 'en'), passphraseWordsFromEntropy(base, 'en'));
  });

  it('con menos de 6 bytes falla', () => {
    assertCoreError(() => passphraseWordsFromEntropy(new Uint8Array(5), 'es'), 'INVALID_ENTROPY');
  });

  it('el mismo azar da los mismos índices en todos los idiomas', () => {
    const e = entropyFor([100, 200, 300, 400]);
    for (const lang of LANGS) {
      const words = passphraseWordsFromEntropy(e, lang);
      assert.deepEqual(
        words.map((w) => WORDLISTS[lang].map(foldWord).indexOf(w)),
        [100, 200, 300, 400],
      );
    }
  });
});

describe('Passphrase: lo que escribe el que recibe', () => {
  it('la forma canónica va sin tildes; acepta tildes, mayúsculas y espacios', () => {
    assert.equal(normalizeWord('abaco', 'es'), 'abaco');
    assert.equal(normalizeWord('  ÁBACO ', 'es'), 'abaco');
    assert.equal(normalizeWord('ábaco'.normalize('NFKD'), 'es'), 'abaco');
    assert.equal(normalizeWord('acción', 'es'), 'accion');
    assert.equal(normalizeWord('ACCION', 'es'), 'accion');
    const conEnie = WORDLISTS.es.map((w) => w.normalize('NFC')).find((w) => w.includes('ñ'));
    assert.ok(conEnie);
    assert.equal(normalizeWord(conEnie.toUpperCase(), 'es'), conEnie.replace('ñ', 'n'));
    assert.equal(normalizeWord('abeja', 'es'), 'abeja');
    assert.equal(normalizeWord('abacate', 'pt'), 'abacate');
    assert.equal(normalizeWord('abaco', 'it'), 'abaco');
    assert.equal(normalizeWord('ABANDON', 'en'), 'abandon');
  });

  it('devuelve null si la palabra no está en la lista', () => {
    assert.equal(normalizeWord('bitcoin', 'es'), null);
    assert.equal(normalizeWord('', 'es'), null);
    assert.equal(normalizeWord('abandon', 'es'), null);
  });

  it('autocompleta por prefijo, sin importar tildes', () => {
    assert.ok(suggestWords('aba', 'es').includes('abaco'));
    assert.ok(suggestWords('ÁBA', 'es').includes('abaco'));
    assert.deepEqual(suggestWords('', 'es'), []);
    assert.equal(suggestWords('a', 'en', 3).length, 3);
    assert.deepEqual(suggestWords('zzzz', 'it'), []);
  });

  it('arma la passphrase canónica y valida las 4 palabras', () => {
    assert.equal(passphraseFromWords(['ábaco', 'ABEJA', 'Abdomen', 'abeja'], 'es'), 'abaco abeja abdomen abeja');
    assertCoreError(() => passphraseFromWords(['ábaco', 'abeja', 'abdomen'], 'es'), 'INVALID_WORD');
    const error = assertCoreError(() => passphraseFromWords(['ábaco', 'abeja', 'secreta', 'abeja'], 'es'), 'INVALID_WORD');
    assert.equal(error.details?.position, 2);
    // El error no repite la palabra: puede ir a un log.
    assert.ok(!JSON.stringify(error.details).includes('secreta'));
    assert.ok(!error.message.includes('secreta'));
  });

  it('todas las passphrases posibles son ASCII puro, en los 4 idiomas', () => {
    for (const lang of LANGS) {
      for (const word of WORDLISTS[lang]) assert.match(foldWord(word), /^[a-z]+$/);
    }
  });

  it('NFC o NFKD dan la misma semilla (BIP39 normaliza la passphrase)', () => {
    const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    const nfc = 'ábaco ñandú camión pingüino'.normalize('NFC');
    const nfkd = nfc.normalize('NFKD');
    assert.notEqual(nfc, nfkd);
    assert.equal(toHex(mnemonicToSeedSync(mnemonic, nfc)), toHex(mnemonicToSeedSync(mnemonic, nfkd)));
  });
});
