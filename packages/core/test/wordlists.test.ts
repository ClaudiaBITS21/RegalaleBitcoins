import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { sha256 } from '@noble/hashes/sha2.js';
import { utf8ToBytes } from '@noble/hashes/utils.js';
import { foldWord, LANGS, normalizeWord, WORDLISTS } from '../src/index.ts';
import { loadVector, toHex } from './helpers.ts';

const official = loadVector<{ sha256: Record<string, string> }>('wordlists.json');

describe('Listas BIP39 (es, pt, en, it)', () => {
  for (const lang of LANGS) {
    it(`${lang}: idéntica byte a byte al archivo oficial de bitcoin/bips`, () => {
      const list = WORDLISTS[lang];
      assert.equal(list.length, 2048);
      assert.equal(toHex(sha256(utf8ToBytes(list.join('\n') + '\n'))), official.sha256[lang]);
    });

    it(`${lang}: sin ambigüedad al ignorar tildes y mayúsculas`, () => {
      const folded = new Set(WORDLISTS[lang].map(foldWord));
      assert.equal(folded.size, 2048);
      for (const word of WORDLISTS[lang]) {
        assert.equal(normalizeWord(word.toUpperCase(), lang), foldWord(word));
      }
    });
  }

  it('las listas no se pueden modificar en tiempo de ejecución', () => {
    assert.throws(() => {
      (WORDLISTS.es as string[])[0] = 'hackeada';
    }, TypeError);
  });
});
