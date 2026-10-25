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
| 21/10/2026 | [`6a34d07`](https://github.com/ClaudiaBITS21/RegalaleBitcoins/commit/6a34d07f4ad317f62baf7f63f1895612ccc12cae) | `caadaaaac64985eb5ece504cda9dd9ca43f1b45d4f5268f8713d22e9bbb97f89` | `aeb36ff270cf2a8f9c0fb4b9e168b71b55cd206f77980436275afe72e84e809e` |
| 21/10/2026 | [`e21ee2e`](https://github.com/ClaudiaBITS21/RegalaleBitcoins/commit/e21ee2e4c7e3755f6e65545530d68573a744b446) | `e36da47e322c5053a88371295e8ab8dcbf1f33ea00862955f870ca55d4ba51d6` | `aeb36ff270cf2a8f9c0fb4b9e168b71b55cd206f77980436275afe72e84e809e` |
| 21/10/2026 | [`5e3197c`](https://github.com/ClaudiaBITS21/RegalaleBitcoins/commit/5e3197c3c616cae16d5ae54436770e084d548629) | `ad84113d739ad9ec606e7ccf862caf56c3b42b8a44921716a8e387c6fe34cb2d` | `aeb36ff270cf2a8f9c0fb4b9e168b71b55cd206f77980436275afe72e84e809e` |
| 21/10/2026 | [`939cb48`](https://github.com/ClaudiaBITS21/RegalaleBitcoins/commit/939cb48009705ca67d96863ae190746b525ef755) | `4a77b5700870f35e20b13a96aa0e94252510bc7b59ec2c59ac17875c9ace25a3` | `aeb36ff270cf2a8f9c0fb4b9e168b71b55cd206f77980436275afe72e84e809e` |
| 21/10/2026 | [`b5a6686`](https://github.com/ClaudiaBITS21/RegalaleBitcoins/commit/b5a6686a958d4b341b50d8ed9e3cec387857f609) | `49b65ddc9ac40dcdc6302b1bab2af2b9297e36b3d4c1cdf3abb3ae0d4a8a34c4` | `aeb36ff270cf2a8f9c0fb4b9e168b71b55cd206f77980436275afe72e84e809e` |
| 21/10/2026 | [`11ce09d`](https://github.com/ClaudiaBITS21/RegalaleBitcoins/commit/11ce09df3d6804b8fe844ed88f5998ee1ab2dd59) | `c752e8f4e5e4a00de07bba0311d0b1a17dfff0adc9dc3e23fc8acbd98a5fc418` | `aeb36ff270cf2a8f9c0fb4b9e168b71b55cd206f77980436275afe72e84e809e` |
| 21/10/2026 | [`0c0d506`](https://github.com/ClaudiaBITS21/RegalaleBitcoins/commit/0c0d5063e393573e848db19fddf240e4e12b6de1) | `16ae78f57713628abf218896208f43a8dee1ca2e75479e11d52976cb9fcd096b` | `aeb36ff270cf2a8f9c0fb4b9e168b71b55cd206f77980436275afe72e84e809e` |
| 21/10/2026 | [`6478fb6`](https://github.com/ClaudiaBITS21/RegalaleBitcoins/commit/6478fb6ad175fdcd25c670e05ad84c9cb1b242a0) | `6a35fefccf7143c10510547cee3bc25043dd6b7882848e5a8c8db388d22234f7` | `aeb36ff270cf2a8f9c0fb4b9e168b71b55cd206f77980436275afe72e84e809e` |
| 21/10/2026 | [`dc713eb`](https://github.com/ClaudiaBITS21/RegalaleBitcoins/commit/dc713eb673e4a2921e1e0b1b9c0689d518d81b39) | `ad40c63145793bd565c23a07cd9e4df9d19c3c4986a97a7f3f47c3b6e06569b3` | `aeb36ff270cf2a8f9c0fb4b9e168b71b55cd206f77980436275afe72e84e809e` |
| 21/10/2026 | [`2204a44`](https://github.com/ClaudiaBITS21/RegalaleBitcoins/commit/2204a44d91b4ec5c53c3e8a323ca23b2bc0f5038) | `2b9d647ea5b81a1c61640c90a6c3e37560cb6430c630aeeba0193637bf7a8d8f` | `aeb36ff270cf2a8f9c0fb4b9e168b71b55cd206f77980436275afe72e84e809e` |
| 22/10/2026 | [`4cc1d9a`](https://github.com/ClaudiaBITS21/RegalaleBitcoins/commit/4cc1d9a57fa0f2c976b0e9b1ff4149bc8ebc19db) | `1f18ebf1e885fdc1616613a4fc52e2659a4346946b280c55869818f5d07a1973` | `aeb36ff270cf2a8f9c0fb4b9e168b71b55cd206f77980436275afe72e84e809e` |
| 24/10/2026 | [`4f08e92`](https://github.com/ClaudiaBITS21/RegalaleBitcoins/commit/4f08e92d8a6a1f12b15c101ab88fd4373dcf8d6a) | `dc6babb38ef629eb0b1b527b7f50743126dd1669b2dce3984716163651c3dfa2` | `aeb36ff270cf2a8f9c0fb4b9e168b71b55cd206f77980436275afe72e84e809e` |
| 25/10/2026 | [`26ecc8c`](https://github.com/ClaudiaBITS21/RegalaleBitcoins/commit/26ecc8cdf190bf6933c855aff9695233ac3d231f) | `56905c9e8e3e1837d3b339ef953c43165457485f3d0aff80dc53b4d644d3d83e` | `aeb36ff270cf2a8f9c0fb4b9e168b71b55cd206f77980436275afe72e84e809e` |
| 25/10/2026 | [`89e2036`](https://github.com/ClaudiaBITS21/RegalaleBitcoins/commit/89e2036227aa10ba47371b9a16ce817b6d75d85e) | `d4b085ec68630412453460c0ff3da56290594cda10cbdceadb1d4bba531ff929` | `aeb36ff270cf2a8f9c0fb4b9e168b71b55cd206f77980436275afe72e84e809e` |
| 25/10/2026 | [`40620ce`](https://github.com/ClaudiaBITS21/RegalaleBitcoins/commit/40620ceedb470776dbb6cc89272a64422f2d1b01) | `b4d30c100774e4eafabb894f24837f7cbc297f747c5dde68b83b10e899219767` | `e46d40f7414c012d9a84216a8145c6f27575e0f5e6fb340d3ec18e28b8ccb3a1` |
| 25/10/2026 | [`bff5f83`](https://github.com/ClaudiaBITS21/RegalaleBitcoins/commit/bff5f834f184dec023d7811be1a31c4174316948) | `5acf3f1e2d6a74d14ae42ba47f729912eed36a24c96c7a8e34fff2f59c3adfbc` | `e46d40f7414c012d9a84216a8145c6f27575e0f5e6fb340d3ec18e28b8ccb3a1` |
