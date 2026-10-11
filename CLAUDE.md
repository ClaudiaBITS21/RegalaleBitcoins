# RegalaleBitcoins.com

Web para regalar bitcoin por una ocasión o armar una lista para recibirlo, sin custodia.
Especificación de producto: "RegalaleBitcoins.com — Especificación v0.1" (doc aparte).
Técnico: `docs/arquitectura.md` y `docs/derivacion.md`.

## Principios no negociables

- No custodio: la plataforma nunca puede mover fondos de un regalo. Claves generadas en el navegador.
- Solo bitcoin, solo on-chain para los regalos.
- Todo en signet/testnet. **Nada en mainnet sin autorización explícita del responsable.**
- Pocas dependencias criptográficas (familia @scure/@noble), con versión exacta. No agregar
  ninguna dependencia criptográfica sin aprobación. Aleatoriedad solo con `crypto.getRandomValues`.
- Cero scripts de terceros (analytics, chats, píxeles) en el sitio.
- Verificación de pagos siempre en el servidor.
- El esquema de `docs/derivacion.md` no cambia en silencio: los vectores de regresión de
  `packages/core/test` lo fijan.

## Forma de trabajo

- Antes de cada etapa, decir qué se va a hacer; al terminarla, qué quedó y qué falta.
- Si algo de la especificación es inconsistente o inseguro, frenar y preguntar.
- Textos de la interfaz en castellano rioplatense (voseo), con traducciones pt/en/it.
  Comentarios de código en castellano.

## Comandos

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test                 # núcleo, API (Postgres local, base regalale_test) y web
pnpm build                # web
pnpm e2e:simulado         # reclamo completo en Chromium contra cadena simulada
node packages/core/scripts/fetch-vectors.ts   # regenera vectores oficiales (usa red)
```

Postgres local: `pg_ctlcluster 16 main start`; detalles en `docs/desarrollo.md`.
Secretos de desarrollo (signet) en `.dev/`, nunca al repo.

## Dependencias

`pnpm-workspace.yaml` tiene `minimumReleaseAge` (7 días), `trustPolicy: no-downgrade` y
ningún paquete autorizado a correr scripts de instalación. Si una instalación falla por
esas reglas, investigar antes de abrir una excepción.
