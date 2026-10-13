# Arquitectura

Especificación de producto: "RegalaleBitcoins.com — Especificación v0.1" (documento
aparte). Acá queda lo técnico.

## Stack

| Capa | Elección | Por qué |
|---|---|---|
| Monorepo | pnpm 10 con workspaces | No ejecuta scripts de instalación de dependencias. `minimumReleaseAge` evita versiones de menos de 7 días, `trustPolicy: no-downgrade` frena paquetes que pierden procedencia y `blockExoticSubdeps` bloquea dependencias desde git o URLs. |
| Núcleo cripto | `packages/core`, TypeScript sin DOM ni red | Se testea y se audita aislado. Tests con `node:test`, sin dependencias de test. |
| Frontend | Vite + Preact + TypeScript, estático | Poco código en las páginas con claves. Traducciones propias es/pt/en/it. |
| Backend | Node 24 LTS + Hono, driver `postgres` | Sin dependencias transitivas. Nunca toca claves. |
| Base de datos | PostgreSQL 16 | |
| Cadena | Cliente para la API Esplora | Desarrollo: mempool.space (signet). Antes de mainnet: nodo propio (bitcoind + electrs) y mempool.space como segunda fuente. |
| Hosting | Un VPS con Docker Compose: Caddy, web + API en el mismo origen, Postgres, bitcoind + electrs | Pocas cuentas con poder de alterar el JS servido. Ningún intermediario termina TLS delante de las páginas con claves. |
| Mail | Postmark o Resend, solo desde el servidor | |
| CI | GitHub Actions, con actions fijadas por commit | Typecheck y tests con vectores oficiales. Más adelante: build reproducible y hash publicado por versión. |

## Dependencias criptográficas

Siete paquetes, todos de Paul Miller, con versión exacta (más `qr` 0.7.2, del mismo autor y
sin dependencias, que dibuja el QR de pago; no es criptográfico pero muestra la dirección, así
que entra en la misma revisión):

- `@noble/curves` 2.4.0
- `@noble/hashes` 2.4.0
- `@scure/base` 2.4.0
- `@scure/bip32` 2.4.0
- `@scure/bip39` 2.4.0
- `@scure/btc-signer` 2.4.1
- `micro-packed` 0.11.1 (dependencia de btc-signer)

Los siete se publicaron con procedencia de npm desde el CI del repo de cada uno, en el
tag de su versión. Verificado el 11/10/2026 leyendo las atestaciones del registro.

**Auditorías.**
- `@noble/curves`: Trail of Bits, v2.3.0, agosto de 2026.
- `@noble/hashes`, `@scure/bip39` y `@scure/bip32`: Cure53, 2022, sobre las versiones 1.x.
- `@scure/btc-signer`: Cure53, 2023, v0.3.
- La línea 2.x de esas cuatro solo tiene revisiones del autor.

**Plan.** Revisar el diff en cada actualización e incluir estas librerías en la
auditoría externa previa a mainnet.

BIP85 no tiene implementación auditada en esta familia. Está implementado en
`packages/core/src/bip85.ts`, sobre bip32 y HMAC-SHA512, y validado con los vectores
oficiales.

## Qué vive dónde

- **Navegador:** genera la clave maestra, deriva regalos, passphrases y direcciones, y
  arma y firma barridos. Los secretos no se guardan en claro.
- **Servidor:**
  - Datos del regalo: ocasión, nombre, mensaje, idioma, dirección pública y montos.
  - Vigila direcciones y retransmite transacciones.
  - Guarda la bóveda cifrada sin poder abrirla y manda mails.
  - Solo recibe una semilla en el caso del link guardado que prevé la especificación.
- **Link:** `/r/<id>#<semilla>`; ver [derivacion.md](derivacion.md). La web lee la
  semilla una sola vez y la saca de la barra de direcciones: queda solo en memoria.

## API

| Método | Ruta | Qué hace |
|---|---|---|
| POST | `/api/gifts` | Regalar: registra el regalo antes del pago con la tarjeta, la dirección derivada en el navegador y los sats a mandar. El servidor pone la cotización, controla el techo (USD 100), el mínimo según comisiones y un límite por IP. Devuelve 409 `regalo_existente` si la dirección ya está: el navegador prueba el índice siguiente. |
| GET | `/api/precio` | Cotizaciones con su fuente: BTC/USD de mempool.space y BTC/ARS directo de exchanges argentinos (mediana del precio final de compra según CriptoYa, controlada con el par btc_ars de Bitso; si difieren más de 10 %, no hay cotización en pesos). |
| GET | `/api/gifts/:id` | Tarjeta, idioma, dirección pública, estado y montos (recibidos y esperados). El estado se calcula en el servidor desde la cadena: `esperando`, `en_la_red`, `activo`, `reclamo_programado`, `reclamado`, `recuperado`, `retirado`. `pagoTrabado` avisa si un pago en la mempool paga menos que la comisión económica. |
| GET | `/api/gifts/:id/utxos` | UTXO confirmados con su transacción completa. El navegador verifica los montos contra el txid. |
| GET | `/api/fees` | Comisiones recomendadas (sat/vB). |
| POST | `/api/gifts/:id/claim` | `{hex, modo: 'ahora' \| 'esperar'}`. Ver abajo. |

**Qué verifica el servidor antes de difundir:**
- que el barrido gaste exactamente todos los UTXO confirmados del regalo, y nada más;
- que tenga una sola salida;
- que la comisión esté en rango.

Con `esperar`, si la red todavía no acepta esa comisión, guarda la transacción firmada
y la difunde cuando baje. El servidor no puede cambiarla: solo decide cuándo mandarla.

## Regalar (etapa 4)

`/regalar`, en el navegador:

1. Ocasión, tarjeta (nombre hasta 30 caracteres, mensaje hasta 280), imagen e idioma de quien
   recibe.
2. Monto: USD 25, 50, 100 u otro en dólares, pesos o sats, leído con los separadores del
   idioma (`parseAmount`). Mínimo según las comisiones del momento; máximo USD 100. Toda
   conversión muestra en letra chica la fuente, la cotización y la cuenta. Los pesos salen de
   BTC/ARS de exchanges locales, nunca de pasar por el dólar oficial.
3. **Código de recuperación antes de pagar.** Mientras no exista la bóveda con passkey
   (etapa 5), la clave maestra se muestra como código de 12 palabras y se verifica con 3 al
   azar. Quien ya tiene un código lo escribe y sigue con el índice libre siguiente.
4. Pago: dirección del regalo `i` (`deriveGift`), QR BIP21 dibujado como SVG y consulta del
   estado cada 5 s. Pago completo en la mempool: pasa a mandar. Llega menos: avisa y deja seguir.
   Pago reemplazado (RBF) o caído: vuelve a esperar y avisa. Comisión baja: sugiere acelerarlo.
5. Mandar: link por WhatsApp, mail o copiado; las 4 palabras por otro canal (el mismo canal
   queda deshabilitado) o en persona. Los mensajes van en el idioma de quien recibe y salen del
   navegador: el servidor no ve el link.

La clave maestra, la semilla y las palabras viven solo en la memoria de la página. Sin bóveda,
cada visita sin código arma una clave maestra nueva.

## Seguridad web

- **Cero scripts de terceros en todo el origen.** Las páginas del mismo origen
  comparten almacenamiento, así que no alcanza con limpiar solo las páginas con
  claves.
- **Fuentes autoalojadas:** el prototipo carga Google Fonts.
- **Cabeceras:** CSP estricta sin scripts inline, `Referrer-Policy: no-referrer`,
  `frame-ancestors 'none'`, HSTS.
- **Mainnet bloqueada por código:** `getNetwork('mainnet')` falla salvo
  `{ allowMainnet: true }`. Las funciones del núcleo solo aceptan redes entregadas
  por `getNetwork`.

## Decisiones pendientes de confirmación

Se tomaron con la recomendación técnica. Están implementadas o previstas así, salvo
que se decida otra cosa:

1. **Passphrase derivada de la clave maestra** (BIP85 HEX), para que el código de
   recuperación alcance para recuperar regalos. Implementado.
2. **Clave maestra asegurada antes de mostrar la dirección de pago:** passkey o, sin
   PRF, el código anotado. Evita perder fondos si se cierra la pestaña entre pagar y
   mandar el link. En la etapa 4, código obligatorio y verificado; la passkey llega en la 5.
3. **Sin verificar palabras de la billetera del que recibe** en la guía de BlueWallet:
   solo el checkbox. Pedir palabras contradice "Nunca te vamos a pedir las palabras de
   tu billetera". Implementado en la etapa 3.
4. **Link guardado** (envío programado o reclamo desde el panel) solo si se pide
   explícitamente: cifrado en la base, borrado al reclamarse o recuperarse, y aviso si
   el monto supera el techo. Etapa 6.

## Etapas

1. Stack y arquitectura. Hecho.
2. Núcleo criptográfico con tests. Hecho.
3. Reclamo en signet. Código hecho y publicado en regalalebitcoins.web.app. Falta la prueba
   con el regalo de prueba fondeado desde un faucet de signet.
4. Regalar en 5 pasos, con detección de pago (mempool, 1 confirmación, RBF). Hecho, con
   prueba en navegador contra la cadena simulada. Queda para después: tarjeta imprimible (espera el diseño), envío programado y
   aviso por mail si se cierra la página (etapa 6). Los mensajes sugeridos por ocasión son
   provisorios hasta que los defina el equipo de contenido.
5. Bóveda con passkey y código de recuperación.
6. Paneles, estados y notificaciones.
7. Listas de regalos (xpub + alias bancario).
