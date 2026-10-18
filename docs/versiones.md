# Versiones publicadas de regalalebitcoin.com

Cada vez que se publica el sitio de mainnet, se anota acá su **huella**: el sha256 del listado de
todos los archivos publicados (en el formato de `sha256sum`), y la huella de la **herramienta sin
conexión**. La arma `apps/web/scripts/huella.mjs` al compilar con `pnpm build:mainnet`, que también
la deja en `/version.json` del sitio.

Para comprobar una versión sin confiar en nosotros:

```sh
git clone https://github.com/ClaudiaBITS21/RegalaleBitcoins
cd RegalaleBitcoins && git checkout <commit>
pnpm install --frozen-lockfile
pnpm build:mainnet        # imprime la huella; tiene que ser la de esta tabla y la del sitio
```

Las pruebas automáticas de GitHub (Actions) también corren `pnpm build:mainnet` en cada commit e
imprimen la huella en su registro: es un testigo que no depende de quien publica.

La página `/sin-custodia` explica todo esto para cualquier persona.

| Fecha | Commit | Huella del sitio | Herramienta sin conexión |
|---|---|---|---|
| 18/10/2026 | [`9e05660`](https://github.com/ClaudiaBITS21/RegalaleBitcoins/commit/9e05660646dba892c65322b7643ff56800778c01) | `00ffa4da54549ccb79e7a55eb1925035fcd97031a53eaaab429ded2e6b9ceb7f` | `aeb36ff270cf2a8f9c0fb4b9e168b71b55cd206f77980436275afe72e84e809e` |
| 18/10/2026 | [`5b4a509`](https://github.com/ClaudiaBITS21/RegalaleBitcoins/commit/5b4a509c0c482e55b5acb4b7d53f7d9ded85d9ce) | `5e663936a1d7cdf4450cef6fc275c76e23667df9a9784cd1d57561a8ef0037e8` | `aeb36ff270cf2a8f9c0fb4b9e168b71b55cd206f77980436275afe72e84e809e` |
| 18/10/2026 | [`3549f74`](https://github.com/ClaudiaBITS21/RegalaleBitcoins/commit/3549f749b00880a5d2ba0c4428ab3e279f935186) | `a2255f66d95725501a36c725dbc5060d4ca9cd1e3f7573542135cea1bb4d737f` | `aeb36ff270cf2a8f9c0fb4b9e168b71b55cd206f77980436275afe72e84e809e` |
