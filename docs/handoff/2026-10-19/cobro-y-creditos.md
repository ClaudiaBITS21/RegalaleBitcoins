# Handoff 19/10/2026: modelo de cobro, créditos y pagos

Estado: EN CURSO (página de precios publicada; cobro, créditos y admin, pendientes)

Decidido por Rodolfo en chat, 19/10/2026. Copiado de la carpeta de Drive «RegalaleBitcoin -
handoffs» (`2026-10-19 - cobro y créditos.md`).

**Antes de activar cobros en mainnet hace falta autorización explícita de Rodolfo** (ver CLAUDE.md y docs/operacion.md, regla 6). Todo esto se desarrolla y prueba primero en testnet.

## Principios (no negociables)

- Es un **costo por servicio**, no una comisión: se paga **aparte**, a una dirección de la plataforma, y **nunca** sale de la dirección de un regalo ni de los aportes de una lista (docs/operacion.md, regla 6). En la web no se usa la palabra "comisión" para este cobro.
- El servidor **nunca** tiene claves: cobra a una **xpub de solo lectura** cuyas claves están en la billetera de hardware de Rodolfo. Ni el servidor, ni Cowork, ni Code tocan esas claves.
- Precios en **USD**, con su valor actual en **sats** debajo.

## Productos y precios (editables desde el admin, no hardcodeados)

| Código | Precio | Otorga |
|---|---|---|
| `bienvenida` | gratis | 5 regalos **en total** por cuenta (no por año). Tarjeta imprimible **básica**, con una vista previa de cómo quedaría la completa. |
| `pack10` | USD 10,5 | 10 regalos + tarjetas con diseño completo |
| `pack10_lista` | USD 21 | 10 regalos + tarjetas + 1 lista de **cualquier** ocasión |
| `anual` | USD 42 | Regalos y listas libres durante 365 días |
| `fundador` | USD 210 | Regalos libres para siempre + hasta 10 listas por año. **Solo los primeros 100** (contador atómico). |
| `lista_cumple` | USD 10,5 | 1 lista de cumpleaños (solo diseños de cumpleaños) |
| `lista_otras` | USD 21 | 1 lista de cualquier otra ocasión |

- **Pantalla de compra:** `lista_otras` no se muestra sola; en su lugar va el pack: "Lista para cualquier ocasión — USD 21. Por el mismo precio, sumá 10 regalos". `lista_cumple` sí se muestra suelta. `lista_otras` existe igual en la tabla (para upgrades y códigos).
- **Lista de cumpleaños:** la tarjeta y la página de la lista llevan siempre un título fijo no editable ("¡Feliz cumpleaños, <nombre>!") superpuesto a la imagen, también si la imagen la hizo con su IA.
- **Upgrade** de `lista_cumple` a otra ocasión: paga la diferencia (USD 10,5). Al revés no hay devolución.
- **Los créditos no vencen.**
- **Plan anual vencido:** los regalos y listas creados durante el plan siguen funcionando. Avisar antes del vencimiento para renovar; al entrar con el plan vencido, invitar a elegir un plan. Renovación manual (no hay débito automático).

## Modelo de datos

La identidad es la **cuenta que ya existe** (mail + passkey). Los créditos se atan al id de cuenta.

- `productos`: código, precio USD, qué otorga, activo/inactivo.
- `movimientos` (**solo se agregan, nunca se editan ni borran**): cuenta, tipo (`otorgamiento` | `compra` | `consumo` | `devolucion` | `ajuste`), unidad (`regalo` | `lista_cumple` | `lista_otras`), cantidad (+/−), origen (`bienvenida` | `pago` | `codigo` | `campana` | `admin`), referencia (regalo, lista, pago o código), fecha.
- `planes`: cuenta, tipo (`anual` | `fundador`), desde, hasta (null en fundador), listas usadas en el año (fundador).
- `pagos`: cuenta, producto, precio USD, sats cotizados, cotización, dirección, índice de derivación, estado (`pendiente` | `visto` | `confirmado` | `incompleto` | `vencido` | `devuelto`), txid(s), sats recibidos, vence_cotizacion.
- `codigos`: código, qué otorga, cupo, usos, vence.

**Saldo = suma de movimientos.** Los errores se corrigen con un `ajuste`, nunca editando.

## Consumo

- **Al crear la cuenta:** `otorgamiento` +5 regalos, origen `bienvenida`.
- **Crear un regalo no consume.** El crédito se consume cuando se detecta el **primer depósito** en la dirección del regalo.
  - Varios depósitos en el mismo regalo (regalar entre varios): consume **una sola vez**.
  - Orden: plan vigente (no descuenta; se registra el uso) → créditos de bienvenida → créditos pagos.
  - Sin saldo ni plan: antes de mostrar la dirección del regalo, ofrecer los packs.
- **Cancelar un regalo que nunca se abrió:** `devolucion` del crédito, al mismo origen. Un depósito que llega después de cancelar no vuelve a consumir.
- **Listas:** se pagan (o consumen el crédito de lista del pack) **antes de publicarlas**.
  - Al crearla, el dueño carga la **fecha del evento** (obligatoria).
  - Queda abierta hasta **1 mes después de la fecha del evento**, salvo que el dueño la cierre antes.
  - Cerrada: la web deja de mostrar dirección y QR, y muestra "Esta lista ya no acepta ni registra nuevos aportes". Si alguien deposita igual, los sats le llegan al dueño (no se puede impedir on-chain), pero no se registran como aporte.
- **UI:** antes de crear un regalo, "Te quedan 3 de tus 5 regalos de bienvenida" o "Usás 1 de tus 7 créditos". **No** prometer que vienen más gratis.
- Panel "Mi plan": saldo por tipo, plan y vencimiento, historial (sale de `movimientos`).

## Pago (solo on-chain por ahora; Lightning más adelante)

1. Elige producto → el servidor cotiza en sats (API de precios de mempool.space). La cotización vale **30 minutos**.
2. Dirección nueva derivada de la xpub (descriptor), índice incremental atómico. Una dirección por pago.
3. Vigilancia con mempool.space:
   - 0 confirmaciones si la transacción **no** señala RBF; si la señala, 1 confirmación.
   - Tolerancia: se acepta con hasta **2% menos**. Si falta más → `incompleto` (puede completar en la misma dirección). Si sobra → se acredita igual, sin devolución.
   - Pago después de vencida la cotización: se acredita si los sats alcanzan al precio actual; si no, `incompleto`.
4. Confirmado → `compra` en movimientos (o alta en `planes`).
5. Nota para Rodolfo: la billetera de hardware necesita un *gap limit* alto (200+) para ver todos los pagos.

## Admin

- Sumar `claudia@rodo.es` a `ADMIN_EMAILS` (Cloud Run). Rodolfo crea la cuenta con ese mail por el flujo normal (paso "Guardá tu regalo") y entra a `/admin` con su passkey.
- **xpub:**
  - Se carga como **descriptor** (ej. `wpkh([huella/84'/0'/0']xpub…)`). Al cargarla, mostrar las **3 primeras direcciones** para comparar con la billetera antes de confirmar.
  - Cambiarla **exige passkey** (no alcanza una sesión iniciada con link por mail), manda aviso a claudia@ y entra en vigor a las **24 h**. Todo queda en un log.
  - xpub de testnet y de mainnet separadas.
  - La xpub **nunca** va al navegador ni a los logs.
- **Precios:** editables por producto.
- **Ajustes manuales:** otorgar o quitar créditos, con motivo.
- **Códigos promocionales:** otorgan créditos o plan, con cupo y vencimiento. Primer uso: cupón de Navidad (posiblemente entregado en LABITCONF).
- **Campañas:** otorgamiento masivo por segmento (ej. "+5 regalos a las cuentas que usaron los 5 y no compraron"), registrado como campaña para medir.
- **Métricas:**
  - Cuentas que usaron los 5 de bienvenida.
  - Conversión a pago y tiempo hasta la compra.
  - Ventas por producto.
  - Cuentas nuevas creadas justo después de que otra se quedó sin gratis (señal de abuso).

## Arrepentimiento (10 días)

- Link visible "Botón de arrepentimiento" (pie de página). Formulario: pago + dirección de devolución. Se le da un código de trámite.
- Procede solo si **no usó ningún crédito** del pack y, en listas, si **no recibió aportes**.
- Se devuelven **los mismos sats pagados** (no el equivalente en USD). La devolución la manda **Rodolfo a mano** desde su billetera; el admin solo marca el pago como `devuelto` y registra el `ajuste`.

## ABIERTO

- Fundador y anual: definir si "regalos libres" tiene un tope de uso razonable (el fundador ya tiene 10 listas/año).
- Lightning: para una etapa posterior.
- Facturación por **Apptivalo SRL**: ver con el contador antes de mainnet.
- Términos y condiciones y política de privacidad: se redactan aparte a partir de lo que hace el código; revisión del abogado antes de cobrar.
- Inscripción de la base de datos (mails) ante la AAIP: lo ve Rodolfo con el abogado.
- Envío de mails: verificar el dominio en Resend y `MAIL_FROM=Regalale Bitcoin <hola@regalalebitcoin.com>`. Sin esto no llegan los links de acceso ni los avisos.

## Decisiones de Rodolfo (19/10/2026)

- **Precios se publica ya** y se integra al recorrido de regalar («Precios ya lo publicamos y lo
  integramos al flow»).
- La cuenta se crea sola al regalar, con el mail de quien regala (es obligatoria).
- **Sin pasar por testnet** («voy directo al cobro»): el cobro se activa directo en mainnet. Code
  lo prueba igual contra la cadena simulada (tests y e2e), y antes de anunciarlo Rodolfo hace una
  compra chica real para verificar que el pago llega a su billetera y se acreditan los créditos.
  Esto cuenta como la autorización explícita para activar el cobro en mainnet.
- Mientras tanto, una franja negra arriba de todas las páginas: «Esta página se encuentra en
  desarrollo, no utilizar para operaciones reales», hasta que Rodolfo diga sacarla.
- Cambiar el mail de la cuenta: con la passkey o con las 12 palabras (a confirmar por Rodolfo).
  Necesita sumar una «llave de cuenta» a `docs/derivacion.md`.

## Qué quedó (código)

- Página `/precios` (`apps/web/src/precios.tsx`): los productos de la tabla, en dólares y con su
  valor de hoy en sats (cotización de `/api/precio`). `lista_otras` no se muestra suelta: va como
  «Lista para cualquier ocasión», con 10 regalos por el mismo precio. «Precios» como link directo
  en el menú (compu y celular) y en el pie.
- Mientras el cobro no esté activo (`COBRO_ACTIVO` en `precios.tsx`), la página avisa: «Mientras
  lanzamos, regalar es gratis. Estos precios rigen cuando activemos el cobro, y te vamos a avisar
  antes.»
- Los precios están en el código hasta que exista el admin; después salen de la API.

- Créditos (migración `012_creditos.sql`, `apps/api/src/credits.ts`):
  - tablas `ajustes`, `productos` (con los precios de la tabla), `movimientos` (un trigger
    rechaza los UPDATE) y `planes`;
  - 5 regalos de bienvenida al crear la cuenta; las cuentas que ya existían también los reciben;
  - el consumo lo hace la tarea programada al ver el primer depósito, una sola vez (plan →
    bienvenida → pagos); cancelar (recupero) devuelve el crédito a su origen;
  - el cobro se activa con `ajustes.cobro_activo = 'si'` (lo hará el admin). Mientras esté
    apagado, el regalo queda resuelto sin consumir: nadie pierde créditos en el período gratis;
  - los regalos que ya existían no consumen nunca;
  - `GET /api/cuenta/creditos`: saldo, plan, si puede regalar y los últimos movimientos.

- Pagos (migración `013_pagos.sql`, `apps/api/src/payments.ts`, PR #35):
  - la llave de cobro se lee como descriptor `wpkh([huella/84h/0h/0h]xpub…)` (checksum BIP 380
    verificado) o como zpub;
  - cotización de 30 minutos y una dirección por pago con índice atómico;
  - 0 confirmaciones sin RBF, 1 con RBF; 2 % de tolerancia; «incompleto» se completa en la misma
    dirección; con la cotización vencida se compara con el precio del momento;
  - al confirmar acredita los créditos o el plan; fundadores, 100;
  - se puede comprar en cuanto hay llave cargada, aunque el cobro no esté activo (para la compra
    de prueba).
- Admin del cobro (migración `014_admin_cobro.sql`, `apps/api/src/adminCobro.ts`, sección «Cobro»
  en `/admin`):
  - la llave se pega, se ven las 3 primeras direcciones para compararlas con la billetera y
    recién ahí se confirma. La primera carga queda vigente enseguida; un cambio, a las 24 h;
  - cargar o cambiar la llave, activar o apagar el cobro, cambiar precios y hacer ajustes exige
    una sesión abierta con passkey (no alcanza el link por mail);
  - cada acción avisa por mail a los admins y queda en `registro_admin`. La llave nunca vuelve al
    navegador ni va al registro: solo su huella;
  - también muestra los pagos y los totales.

- Web (parte 4):
  - `/precios` muestra los precios vigentes (de la API) y, si hay llave de cobro, «Comprar»;
  - `/comprar?producto=…` cotiza, muestra QR y dirección, mira el pago solo y al confirmar lleva
    a «Mi plan»;
  - «Mi plan» en el panel: bienvenida que queda, regalos comprados, listas, plan;
  - al regalar, «Te quedan…» en la pantalla de pago (con el cobro activo);
  - sin créditos ni plan, el servidor rechaza el regalo (`sin_creditos`) y la web ofrece los packs
    antes de mostrar la dirección.

## Qué falta

- Admin: códigos promocionales, campañas y las métricas del handoff (uso de la bienvenida,
  conversión, ventas por producto, cuentas nuevas sospechosas).
- **Antes de activar el cobro:** quien regala sin passkey (solo con el código de 12 palabras) hoy no
  tiene cuenta, y esos regalos no consumen créditos. Hace falta la cuenta obligatoria con el mail
  de quien regala (decisión del 19/10), también sin passkey.
- Listas: pagar o consumir el crédito de lista antes de publicarla; fecha del evento y cierre.
- Botón de arrepentimiento.
