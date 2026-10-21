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
| 18/10/2026 | [`013df51`](https://github.com/ClaudiaBITS21/RegalaleBitcoins/commit/013df5149f877ac9b240ee5e16bdb65045f63eaf) | `27a56c1e23990a024ef702e0b0e4b2db3e03d7064819eb2bde73bd23172f4862` | `aeb36ff270cf2a8f9c0fb4b9e168b71b55cd206f77980436275afe72e84e809e` |
| 18/10/2026 | [`5071734`](https://github.com/ClaudiaBITS21/RegalaleBitcoins/commit/50717343560488751f6a81aa4571eb2a020f85c3) | `97c335dbb4a6a5c60b012481c83c59f24288829551346218748885ad9ca754e3` | `aeb36ff270cf2a8f9c0fb4b9e168b71b55cd206f77980436275afe72e84e809e` |
| 19/10/2026 | [`516f384`](https://github.com/ClaudiaBITS21/RegalaleBitcoins/commit/516f384245ad4e3367d83ddbd6374366bba0273b) | `cab3eac31e6bdeafb2c130cac518ee2230f832a74875de7cbcd74f09ff2bc024` | `aeb36ff270cf2a8f9c0fb4b9e168b71b55cd206f77980436275afe72e84e809e` |
| 19/10/2026 | [`bffd28d`](https://github.com/ClaudiaBITS21/RegalaleBitcoins/commit/bffd28d5572313a653d5378ec2980c65d9a6a79a) | `61d74a57300650cf72754c581b889a4ea8a538bd0445c6e745e1b795e2d10e40` | `aeb36ff270cf2a8f9c0fb4b9e168b71b55cd206f77980436275afe72e84e809e` |
| 19/10/2026 | [`53114a3`](https://github.com/ClaudiaBITS21/RegalaleBitcoins/commit/53114a3548d294bedcf316132622f74b3668773f) | `6aec6445906fdfbe8aee4af49e3299663453caa05d4b72c3cd5be6cff4fb3c3d` | `aeb36ff270cf2a8f9c0fb4b9e168b71b55cd206f77980436275afe72e84e809e` |
| 19/10/2026 | [`37da95a`](https://github.com/ClaudiaBITS21/RegalaleBitcoins/commit/37da95a25cd1909b7f4fbf218578b9f2910797fc) | `65be62bd24c27214b038636f048f11929d15fb5bc343114a24c91d2cefff3a0b` | `aeb36ff270cf2a8f9c0fb4b9e168b71b55cd206f77980436275afe72e84e809e` |
| 20/10/2026 | [`f83a31c`](https://github.com/ClaudiaBITS21/RegalaleBitcoins/commit/f83a31c67a116908502267427d60275bb9d9b10b) | `d8147d208620024ea25caa0f713db32cf4c1038b81f042ff6e0fbdc86689fa19` | `aeb36ff270cf2a8f9c0fb4b9e168b71b55cd206f77980436275afe72e84e809e` |
| 20/10/2026 | [`e0922eb`](https://github.com/ClaudiaBITS21/RegalaleBitcoins/commit/e0922eb2741dcdc8f2c4319e39b485d7ac924527) | `cc3c577adfd47e036da77628061d3c64e4e0459c3bb6b90804d37b4da936fd6f` | `aeb36ff270cf2a8f9c0fb4b9e168b71b55cd206f77980436275afe72e84e809e` |
| 21/10/2026 | [`cb85166`](https://github.com/ClaudiaBITS21/RegalaleBitcoins/commit/cb851660f25876a3fe6a270589410a967730413f) | `9b85fc79aabe9d5ddae0318dee382d8abeab0a70df63d8c66b27c10d0f627613` | `aeb36ff270cf2a8f9c0fb4b9e168b71b55cd206f77980436275afe72e84e809e` |
| 21/10/2026 | [`64e6efe`](https://github.com/ClaudiaBITS21/RegalaleBitcoins/commit/64e6efe810fb7226a3151676a37a870527eaeda1) | `8d299199c32660179020faf6a0f19f242c3d1d0ae8dd1b83afb1ea8b200b9376` | `aeb36ff270cf2a8f9c0fb4b9e168b71b55cd206f77980436275afe72e84e809e` |
| 21/10/2026 | [`5e0d62e`](https://github.com/ClaudiaBITS21/RegalaleBitcoins/commit/5e0d62e2f896acd433fa9959970c38860c96c7db) | `9afcfe601510cea798a09816680452d4ff9c747cfde8e75ea1743b297aa19208` | `aeb36ff270cf2a8f9c0fb4b9e168b71b55cd206f77980436275afe72e84e809e` |
