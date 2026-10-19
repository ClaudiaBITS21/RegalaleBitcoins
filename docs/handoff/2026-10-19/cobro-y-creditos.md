# Handoff 19/10/2026: modelo de cobro, créditos y pagos

Estado: PENDIENTE

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
