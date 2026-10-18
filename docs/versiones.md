# Versiones publicadas de regalalebitcoins.com

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
