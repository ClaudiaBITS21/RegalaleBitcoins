# Arquitectura

Especificación de producto: "RegalaleBitcoin.com — Especificación v0.1" (documento
aparte). Acá queda lo técnico.

Reglas de operación (sin custodia, no PSAV): `docs/operacion.md`.

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
| POST | `/api/cuenta/desafio` | Desafío WebAuthn de un solo uso (`registro` o `ingreso`), 5 min. |
| POST | `/api/cuenta/registro` | `{email, idioma, boveda, credencial}`: crea la cuenta con su passkey y la bóveda cifrada (o `null` sin PRF). Abre sesión. 409 `cuenta_existente`. |
| POST | `/api/cuenta/ingreso` | `{credencial}`: verifica la firma de la passkey (origen, rpId, UP+UV, contador) y devuelve la bóveda de esa credencial. |
| POST | `/api/cuenta/link` | Manda un link de acceso por mail (`/panel#acceso=…`, 20 min). Siempre 202, exista o no la cuenta. |
| POST | `/api/cuenta/link/canje` | Canjea el token del link (una vez) y abre sesión. |
| GET | `/api/cuenta` | Mail, credenciales, próximo índice y regalos de la cuenta con su estado. |
| POST | `/api/cuenta/salir` | Cierra la sesión. |

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
3. **Guardar antes de pagar.** Mail y passkey: el navegador genera la clave maestra, la
   cifra con la salida PRF de la passkey (bóveda, ver [derivacion.md](derivacion.md#9-bóveda))
   y el servidor guarda solo el sobre cerrado. Quien ya tiene cuenta entra con su passkey y
   sigue con el índice libre siguiente. Sin passkey o sin PRF: la clave maestra se muestra como
   código de 12 palabras y se verifica con 3 al azar.
4. Pago: dirección del regalo `i` (`deriveGift`), QR BIP21 dibujado como SVG y consulta del
   estado cada 5 s. Pago completo en la mempool: pasa a mandar. Llega menos: avisa y deja seguir.
   Pago reemplazado (RBF) o caído: vuelve a esperar y avisa. Comisión baja: sugiere acelerarlo.
5. Mandar: link por WhatsApp, mail o copiado; las 4 palabras por otro canal (el mismo canal
   queda deshabilitado) o en persona. Los mensajes van en el idioma de quien recibe y salen del
   navegador: el servidor no ve el link.

La clave maestra, la semilla y las palabras viven solo en la memoria de la página. Sin bóveda,
cada visita sin código arma una clave maestra nueva.

## Cuenta y panel

- La cuenta es mail + passkey. La sesión va en la cookie `__session` (HttpOnly, Secure,
  SameSite=Strict, 30 días; la única que pasa Firebase Hosting) y los POST controlan `Origin`.
- `/panel` lista los regalos con su estado. "Ver link y palabras" pide la passkey, abre la
  bóveda en el navegador y deriva link y palabras del índice guardado: el servidor nunca los ve.
- El link por mail solo abre sesión para ver la lista; para ver link y palabras hace falta la
  passkey. Los mails nunca llevan link de regalo ni palabras.
- Cuando un regalo con cuenta recibe el pago confirmado, la tarea programada manda un aviso
  "listo para mandar" con link de acceso al panel (3 días).
- Las passkeys quedan atadas al dominio (rpId): las creadas en `regalalebitcoins.web.app` no
  sirven en `regalalebitcoin.com`. Al mudar de dominio, entrar por mail y crear otra.
- **Passkeys huérfanas** (bug del 17/10/2026, `docs/handoff/2026-10-17/bug-login-passkey.md`):
  el desafío de registro lleva el mail y el servidor responde `409 cuenta_existente` *antes* de
  que el navegador cree la passkey. Una passkey que el servidor no conoce da
  `passkey_desconocida` y la web le pide al llavero que la borre (`signalUnknownCredential`,
  donde exista). Los rechazos de `/api/cuenta/*` van al log con su motivo (sin mail) y el
  navegador informa el nombre del error de WebAuthn a `/api/cuenta/diagnostico` (lista cerrada
  de nombres). Si la passkey falla, la salida es "Entrar con mis 12 palabras"; crear una cuenta
  nueva pide confirmar que no recupera los regalos de la anterior.

## Mensajes de ejemplo y tarjeta imprimible (handoff 17/10/2026)

- El mensaje de la tarjeta llega cargado con un ejemplo real de la ocasión, al azar
  (`crypto.getRandomValues`), en el idioma de quien recibe: `apps/web/src/content/mensajes/<idioma>.json`
  (sets del handoff de Rodolfo; los que escribimos nosotros figuran en `_revisar`). Se edita en el
  lugar; "Otra idea" cambia el ejemplo y ofrece deshacer si ya lo había tocado; si lo manda sin
  tocar, aparece "¿Le agregás algo tuyo?" sin trabar nada. Ocasión libre o sin set: `porque`.
- Listas: quien arma la lista dice para quién es y si es de una persona o de varias. Cada invitado
  recibe el siguiente ejemplo del mazo de la lista: el servidor solo reparte el turno
  (`POST /api/listas/:id/ejemplo`, columna `mazo`, migración 008) y el navegador mezcla con el id.
- Tarjeta para dar en mano, en el paso "Mandá el regalo": una hoja A4 de un solo lado que, doblada en
  cuatro, queda en A6 (arriba girados 180°: tapa y contratapa; abajo: mensaje y "Abrí tu regalo"
  con el QR del link). **Las 4 palabras no se imprimen**: hay renglones para escribirlas a mano.
  La contratapa lleva la frase de remate (ejemplo al azar, editable, 60 caracteres, sin nada con
  forma de link o dominio) y "Hecho con regalalebitcoin.com". Se arma e imprime en el navegador.

## Listas de regalos (etapa 7)

- Quien arma la lista (con cuenta) pega la **zpub** de su billetera (vpub en pruebas; solo
  BIP84, se rechazan claves privadas y xpub genéricas) y confirma que su billetera muestra la
  misma primera dirección, calculada en su navegador. La llave solo permite generar direcciones.
- Cada invitado que confirma un aporte recibe la próxima dirección `m/0/i` de esa llave; la
  plata va directo a la billetera de quien armó la lista. Tope por aporte: ninguno si la lista usa billetera propia (cold wallet); USD 100 en mainnet si se armó con "Semilla nueva".
- El invitado ve solo su aporte, con un link privado `/aporte#<token>` (se guarda el hash).
- Una dirección sin pagar a las 72 h se recicla si nunca recibió nada; una con movimientos
  previos se saltea. Así no se abren huecos grandes (las billeteras miran ~20 sin usar).
- El panel de quien armó la lista muestra todos los aportes y **vuelve a derivar cada dirección
  en el navegador**: si el servidor mostrara una que no sale de la llave, avisa en rojo.
- **Dónde llegan los regalos** (17/10/2026): dos botones. "Mi cold wallet" (recomendado): pega la
  zpub, como siempre. "Semilla nueva": el navegador genera 12 palabras (`crypto.getRandomValues`),
  la persona las anota y las verifica, y de ahí sale la zpub (BIP84 `m/84'/0'/0'`, la que lee
  cualquier billetera al importarlas). Las palabras no se guardan en ningún lado (ni bóveda ni
  servidor) y se borran de la página apenas sale la llave pública: la billetera es solo de ella.
- Publicar listas es gratis en la beta.
- **Transferencias por país** (excepción aprobada el 17/10/2026, solo en listas; por país desde
  el 21/10, `docs/handoff/2026-10-21/listas-por-pais.md`, regla 5 de `docs/operacion.md`): quien
  arma la lista elige el país de su cuenta y carga el dato y el titular, con el compromiso de
  convertir a bitcoin. Argentina: alias o CBU/CVU (con dígitos verificadores), en pesos. Brasil:
  llave PIX (correo, celular o aleatoria; nunca CPF/CNPJ), en reales. Colombia: llave Bre-B
  (celular, correo o alfanumérica; nunca cédula), en pesos colombianos. Zona euro: IBAN (mod 97),
  en euros. Otro: texto libre de hasta 120 caracteres, en la moneda que elija (ISO 4217). Todo se
  valida en su navegador (`apps/web/src/lists/medios.ts`). El invitado elige "Transferir a su
  cuenta", escribe el monto (sin tope) y recibe el dato y un código `RB-XXXX` único para el
  concepto, más su link privado. La plataforma no recibe ni ve la plata ni el dato: quien armó la
  lista marca anunciada → recibida → convertida y el invitado ve ese estado. Montos en la unidad
  menor de la moneda de la lista (`transferencias.monto`, migración 025). No se suben comprobantes.
- **Dato de cobro cifrado** (`apps/web/src/lists/cobro.ts`): el navegador del dueño genera una
  clave de 32 bytes (`crypto.getRandomValues`) y cifra `{ medio, dato, titular }` (JSON) con
  AES-256-GCM, IV de 12 bytes al azar y el **id de la lista como dato asociado** (AAD), así un
  cifrado copiado a otra lista no se abre. Texto guardado: `v1.<iv base64url>.<cifrado+tag
  base64url>`. El servidor guarda solo eso (`listas.cobro`) y, en claro, país y moneda. La clave
  viaja en el fragmento del link: `regalalebitcoin.com/l/<id>#<clave base64url>`; el link privado
  del aporte la suma (`/aporte#<token>.<clave>`). El servidor entrega el cifrado solo al anunciar
  una transferencia y al consultar el propio aporte; los mails nunca llevan el dato. Si la cuenta
  tiene bóveda, la clave se guarda además envuelta (`listas.clave_cifrada`) con AES-256-GCM y una
  llave HKDF-SHA-256 de la clave privada raíz BIP32 de la clave maestra (sal `regalale`, info
  `regalale-listas-clave-v1`, AAD `clave:<id>`): «Mis listas» la abre con la passkey en cualquier
  dispositivo. Sin bóveda, queda en el navegador donde se creó, o se pega el link completo. Volver
  a cargar el dato genera clave y link nuevos (el link viejo sigue sirviendo para bitcoin) y borra
  el alias en claro de las listas viejas (migración 007). Soporte y admin no ven el dato.
  Vector de prueba (`apps/web/test/cobro.test.ts`): clave = bytes 0..31
  (`AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8`), IV = bytes 0..11, lista
  `AbCdEfGhIjKlMnOpQrStUv`, contenido `{"medio":"iban","dato":"DE89370400440532013000","titular":"Erika Mustermann"}` →
  `v1.AAECAwQFBgcICQoL.PCC7fqGMrTm3Y_7p0IdaQaGy5kCfWWVefCLdvC5eMIYxIJrIn_QhqkSVTN24twoUzC0J-S-6wqgdrQhcaoqej9BxswmntFQMfTrETJKRVrmKjn2lXbl2bTuuSrd5`.
- **Compra en tanda** (17/10/2026): cuando quiere, quien armó la lista elige varias transferencias
  recibidas, carga los sats que compró con ellas y se reparten en proporción al monto de cada una (en la unidad menor de la moneda de la lista; una tanda nunca mezcla monedas)
  (bigint; lo que sobra del redondeo va a las de mayor resto, la suma da exacto). Cada invitado ve su
  parte y el total de la compra (`POST /api/cuenta/listas/:id/tanda`, migración 010).

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
   mandar el link. Implementado: passkey con PRF o, si no hay, código obligatorio y verificado.
3. **Sin verificar palabras de la billetera del que recibe** en la guía de BlueWallet:
   solo el checkbox. Pedir palabras contradice "Nunca te vamos a pedir las palabras de
   tu billetera". Implementado en la etapa 3.
4. **Link guardado** (envío programado o reclamo desde el panel) solo si se pide
   explícitamente y nunca al alcance del servidor (regla 4 de `docs/operacion.md`): la
   semilla va cifrada con una clave que el servidor no tiene; si no se encuentra cómo, la
   función no entra. Etapa 6.

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
7. Listas de regalos: solo BTC con zpub, hecho. Alias bancario, después del lanzamiento.
