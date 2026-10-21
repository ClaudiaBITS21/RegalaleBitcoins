# RegalaleBitcoin.com

Web para regalar bitcoin por una ocasión o armar una lista para recibirlo, sin custodia.
Especificación de producto: "RegalaleBitcoin.com — Especificación v0.1" (doc aparte).
Técnico: `docs/arquitectura.md` y `docs/derivacion.md`. Antes de cambiar flujos de fondos, leer
`docs/operacion.md` (reglas de operación: sin custodia, no PSAV).

## Principios no negociables

- No custodio: la plataforma nunca puede mover fondos de un regalo. Claves generadas en el navegador.
- Solo bitcoin, solo on-chain para los regalos. **Excepción aprobada (17/10/2026), solo en listas:**
  quien arma una lista puede aceptar transferencias en pesos a su alias y se compromete a
  convertirlas a bitcoin. Van de persona a persona: la plataforma solo muestra el alias y un código
  de referencia, nunca recibe ni convierte pesos.
- Desarrollo y pruebas en signet/testnet. **Mainnet autorizado el 17/10/2026 con tope de USD 100
  por regalo** (subido de 20 el mismo día); en listas, sin tope por aporte si usan billetera propia
  y USD 100 si se armaron con "Semilla nueva" (`docs/mainnet.md`); cualquier cambio de tope o de alcance en mainnet necesita una
  nueva autorización explícita de la responsable.
- Pocas dependencias criptográficas (familia @scure/@noble), con versión exacta. No agregar
  ninguna dependencia criptográfica sin aprobación. Aleatoriedad solo con `crypto.getRandomValues`.
- Cero scripts de terceros (analytics, chats, píxeles) en el sitio.
- Verificación de pagos siempre en el servidor. La única excepción son las transferencias en pesos
  de las listas, que no podemos ver: las confirma quien armó la lista y se muestran como tales.
- El esquema de `docs/derivacion.md` no cambia en silencio: los vectores de regresión de
  `packages/core/test` lo fijan.

## Forma de trabajo

- La responsable es Claudia. Rodolfo es la misma persona (su alter ego): lo que dicen los
  handoffs "de Rodolfo" son decisiones de la responsable, no de un tercero.

- **Bloqueante del lanzamiento (pedido de la responsable):** no se publica la nueva landing ni
  se lanza en `regalalebitcoin.com` hasta que la responsable confirme, con sus palabras, la
  verificación en dos pasos en Google (toda cuenta con acceso al proyecto), GitHub, el DNS
  (Metaregistrar/AWS), Resend y su mail. Ver `docs/mainnet.md`. Este punto va **siempre** en cada
  listado de pendientes hasta que esté confirmado. **Confirmado por la responsable el 18/10/2026**
  (AWS quedó fuera por decisión suya).

- Antes de cada etapa, decir qué se va a hacer; al terminarla, qué quedó y qué falta.
- **PRs (pedido de la responsable, 19/10/2026):** si las pruebas (CI) pasan, se mergean sin
  preguntarle. El deploy de mainnet es aparte: workflow «Deploy web mainnet» (`docs/deploy.md`).
- Si algo de la especificación es inconsistente o inseguro, frenar y preguntar.
- En todo texto (web, mails, PDFs, materiales) la dirección del sitio es siempre
  `regalalebitcoin.com`, aunque hoy funcione en `regalalebitcoins.web.app`.
- Textos de la interfaz en castellano rioplatense (voseo), con traducciones pt/en/it.
  Comentarios de código en castellano.
- **Castellano con vos y con tú (pedido de la responsable, 18/10/2026):** siempre las dos
  versiones. `apps/web/src/i18n/es.ts` es el voseo (fuente); `tu.ts` trae solo las claves que
  cambian con tú (también `content/razones-tu.ts` y `content/mensajes/es-tu.json`). Se elige
  sola según dónde dice el dispositivo que está la persona (`i18n/trato.ts`: zona horaria y, si
  no alcanza, región del idioma): vos en Argentina, Uruguay y Paraguay; tú en el resto. El
  selector ofrece «ES (vos)» y «ES (tú)». Todo texto nuevo en castellano va en las dos
  versiones; un test controla que con tú no quede voseo. El idioma del regalo (`lang` en
  `docs/derivacion.md`) sigue siendo `es`: el trato no entra en la derivación.
- Números según el idioma de quien lee: es/pt/it `1.234,56`, en `1,234.56`. Mostrar siempre con
  `Intl.NumberFormat` (ver `apps/web/src/format.ts`), nunca concatenando. Los montos que escribe
  la persona se leen con el separador de su idioma (en es, `1.234` son mil doscientos treinta y
  cuatro y `0,5` es medio), con confirmación del monto interpretado antes de pagar. Montos internos
  siempre en sats enteros (bigint); nada de `parseFloat` sobre lo que tipea el usuario.

## Handoffs

Al arrancar cada sesión, revisá docs/handoff/. Integrá los handoffs con "Estado: PENDIENTE" y cuando termines cambialos a "Estado: INTEGRADO (commit xxxx)". Si algo está marcado ABIERTO, no lo implementes: preguntale a Rodolfo.

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
