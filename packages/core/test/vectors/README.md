# Vectores de prueba

Los JSON de esta carpeta salen de las fuentes oficiales, fijadas por commit. Los
genera `packages/core/scripts/fetch-vectors.ts`; los tests no usan la red.

| Archivo | Fuente |
|---|---|
| `bip32.json` | `bitcoin/bips` `bip-0032.mediawiki`, vectores 1 a 5 |
| `bip39-trezor.json` | `trezor/python-mnemonic` `vectors.json` (referenciado por BIP39) |
| `bip39-japanese.json` | `bip32JP/bip32JP.github.io` `test_JP_BIP39.json` (referenciado por BIP39) |
| `bip84.json` | `bitcoin/bips` `bip-0084.mediawiki` |
| `bip85.json` | `bitcoin/bips` `bip-0085.mediawiki` (versión 2.1.0) |
| `bip143-p2wpkh.json` | `bitcoin/bips` `bip-0143.mediawiki`, ejemplo "Native P2WPKH" |
| `bip350-addresses.json` | `bitcoin/bips` `bip-0350.mediawiki` |
| `wordlists.json` | SHA-256 de `bitcoin/bips` `bip-0039/{english,spanish,portuguese,italian}.txt` |

Commits usados:

- `bitcoin/bips`: `927b6de9915c9262615a6399de51b200f81e5aa4`
- `trezor/python-mnemonic`: `b57a5ad77a981e743f4167ab2f7927a55c1e82a8`
- `bip32JP/bip32JP.github.io`: `5a43706289c55473c120e552244f6de348d0035b`

Para regenerar:

```sh
node packages/core/scripts/fetch-vectors.ts
git diff packages/core/test/vectors   # no debería cambiar nada
```

Además de los oficiales, `gift.test.ts` y `link.test.ts` tienen vectores de
**regresión propios**, marcados como tales. Fijan el esquema de derivación para que
ningún cambio altere en silencio cómo se abren los regalos ya creados.
