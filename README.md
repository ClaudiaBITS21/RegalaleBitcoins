# RegalaleBitcoins.com

Regalá bitcoin por una ocasión (cumpleaños, bautismo, casamiento) o armá una lista
para recibirlo, sin que la plataforma custodie nunca los fondos.

> **Estado:** en desarrollo. Todo corre en **signet/testnet**; mainnet está bloqueada
> por código hasta que se autorice. No uses esto con fondos reales.

## Principios

- **No custodio.** La plataforma nunca puede mover los fondos de un regalo. Las claves
  se generan y se usan en el navegador.
- **Solo bitcoin, solo on-chain** para los regalos.
- **Signet/testnet** para todo lo que mueve bitcoin, hasta autorización explícita.
- **Pocas dependencias criptográficas**, auditadas y con versión fija (familia
  @scure/@noble). Aleatoriedad solo con `crypto.getRandomValues`.
- **Cero scripts de terceros** (analytics, chats, píxeles) en el sitio.
- **Pagos verificados en el servidor**, nunca por aviso del navegador.

## Estructura

```
packages/core     Núcleo criptográfico aislado: clave maestra, BIP85, passphrase,
                  direcciones BIP84, link del regalo y barrido. Sin DOM ni red.
apps/             (próximas etapas) web y API
docs/             Arquitectura y esquema de derivación
```

## Desarrollo

Requiere Node ≥ 22.18 (producción: Node 24 LTS) y pnpm 10 (`corepack enable`).

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
```

Los tests del núcleo validan contra los vectores oficiales de BIP39, BIP32, BIP84,
BIP85, BIP143 y BIP350 (ver `packages/core/test/vectors/README.md`).

## Documentación

- [Arquitectura y decisiones](docs/arquitectura.md)
- [Esquema de derivación de un regalo](docs/derivacion.md): base técnica de la guía de recuperación.
