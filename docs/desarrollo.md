# Desarrollo local

Todo corre en **signet**. Mainnet está bloqueada en la API (`ALLOW_MAINNET`) y en la web
(`apps/web/src/config.ts`).

## Requisitos

- Node ≥ 22.18 (producción: 24 LTS) y pnpm 10 (`corepack enable`).
- PostgreSQL 16 con un usuario `regalale` y dos bases: `regalale` y `regalale_test`.

```sh
pnpm install --frozen-lockfile
```

## Piezas

| Paquete | Qué es |
|---|---|
| `packages/core` | Núcleo criptográfico (ver `docs/derivacion.md`). |
| `apps/api` | API (Hono + Postgres). Consulta la cadena por la API Esplora y difunde barridos verificados. Sirve también la web compilada, en el mismo origen y con la CSP estricta. |
| `apps/web` | Web (Vite + Preact). Por ahora: inicio y reclamo. |
| `apps/e2e` | Pruebas de punta a punta en Chromium. |

## Correr la API y la web

```sh
# API en :8787. Aplica las migraciones al arrancar.
DATABASE_URL=postgres://regalale:regalale@127.0.0.1:5432/regalale pnpm --filter @regalale/api dev

# Web en :5173. Le pasa /api a la API.
pnpm --filter @regalale/web dev
```

Variables de la API:
- `NETWORK` (por defecto `signet`).
- `ESPLORA_URL` (por defecto `https://mempool.space/signet/api`).
- `PRICE_URL`, `PORT`, `DATABASE_URL`.
- `WEB_DIST`: carpeta con la web compilada, para servirla desde la API.

## Regalo de prueba en signet

```sh
node apps/api/scripts/dev-gift.ts            # crea la clave maestra de prueba y el regalo, y muestra la dirección
node apps/api/scripts/dev-seed.ts            # lo registra en la base y muestra el link de reclamo
```

- Los secretos quedan en `.dev/dev-gifts.json`, que está en `.gitignore` y nunca va al repo.
- Para fondear la dirección: un faucet de signet (https://signetfaucet.com, https://alt.signetfaucet.com).

## Pruebas

```sh
pnpm typecheck
pnpm test                       # núcleo, API (usa regalo_test) y web
pnpm build                      # compila la web
pnpm e2e:simulado               # reclamo completo en Chromium contra una cadena SIMULADA
pnpm --filter @regalale/e2e signet   # reclamo completo en signet REAL (necesita red y el regalo fondeado)
```

**Prueba simulada.**
- Levanta un servidor local que imita a mempool.space.
- Crea un regalo efímero y lo reclama desde el navegador. En el camino prueba palabras
  equivocadas, la guía de billetera y direcciones de otra red.
- Verifica la firma del barrido con una implementación independiente de BIP143.
- Confirma que no haya errores de consola, incluidas las violaciones de CSP.
- Deja capturas en `apps/e2e/capturas/`.

No reemplaza la prueba en signet.
