# Cómo operamos (sin custodia, no PSAV)

Reglas de operación de RegalaleBitcoin frente al régimen de Proveedores de Servicios de Activos
Virtuales (Ley 27.739, RG CNV 1172/2026, vigente desde el 16/10/2026). La plataforma **no
intercambia, no transfiere y no custodia** activos virtuales de terceros: da software de
autocustodia y un servicio de presentación del regalo. La arquitectura tiene que poder
demostrarlo.

Decisión de Rodolfo, 17/10/2026 (`docs/handoff/2026-10-17/HANDOFF.md`): **"Estas limitaciones y
observaciones son cosas con las que estoy de acuerdo. Que quede claro que así operamos."** Estas
reglas son de cumplimiento obligatorio. Cambiar cualquiera requiere una decisión explícita de la
responsable, anotada acá con su fecha.

Operador del servicio: **Bull&Bear International, LLC** (Delaware, EE.UU., registro n.º 6687084;
domicilio registrado: 1013 Centre Road, Suite 403-B, Wilmington, DE 19805, agente registrado
Vcorp Services, LLC; certificado de constitución del 29/12/2017), desde el 24/10/2026; antes
Apptivalo S.R.L. (`docs/handoff/2026-10-24/empresa-bull-and-bear.md`).

## Reglas

### 1. El servidor nunca puede mover fondos
- Ningún flujo, presente o futuro, le da al servidor la capacidad de firmar ni de reconstruir
  una clave: ni en claro, ni cifrada con una clave que el servidor tenga, ni en partes.
- Clave maestra, semilla del regalo, passphrase y firma del barrido: solo en el navegador.
- La bóveda solo se guarda cifrada con una clave que el servidor no tiene (PRF de la passkey).
- Estado verificado al 17/10 en `etapa-4-regalar`: **se cumple.**

### 2. Recuperar un regalo es cosa del que regala
- La cancelación/recupero la firma el navegador del que regala con su clave maestra (passkey
  o código de 12 palabras). Nunca existe un "te lo devolvemos" ejecutado por la web.
- Estado: **se cumple.**

### 3. Las transferencias las ejecuta el usuario
- El servidor solo retransmite transacciones ya firmadas, después de validar que el barrido
  gaste todos los UTXO confirmados del regalo, tenga **una sola salida** y una comisión en rango
  (`apps/api/src/app.ts`, `packages/core/src/sweep.ts`).
- Con `modo: 'esperar'` el servidor solo decide cuándo difundir; no puede cambiar la transacción.
- **El barrido sigue teniendo una sola salida.** No se agrega una salida para la plataforma
  ni para nadie más.
- Estado: **se cumple.**

### 4. Link guardado (etapa 6): nunca al alcance del servidor
- La especificación prevé guardar la semilla del regalo "cifrada en la base" para envío
  programado o reclamo desde el panel. **Así no.** Con la semilla y la dirección conocida, la
  passphrase (44 bits) se puede probar por fuerza bruta: eso es "control suficiente".
- Si se implementa, la semilla va cifrada con una clave que el servidor no tiene (por ejemplo,
  derivada de la bóveda del que regala o de la passkey de quien recibe). Si no se encuentra
  cómo, la función no entra.

### 5. Pesos: nunca pasan por la plataforma
- No cobramos pesos por regalos ni convertimos para terceros. Quien quiere pagar con pesos
  compra BTC en su exchange (o, más adelante, en un PSAV registrado que manda directo a la
  dirección del regalo) y deposita.
- **Listas con alias bancario (después del lanzamiento):** el alias es **del dueño de la lista**.
  Los invitados le transfieren a él; **él compra los BTC y los deposita.** Las "tandas" son
  información para el dueño, no una conversión que haga la web.
- La web muestra los aportes en pesos como "aportaste $X". **Nunca muestra sats por un aporte
  en pesos**: sería prometer una conversión que no controlamos. Los sats se ven cuando llegan
  a la cadena.
- **Cambio del 17/10/2026 (Claudia = Rodolfo):** las listas con alias van desde ya, no después
  del lanzamiento. Y sí se muestran los sats de una transferencia convertida: "Es una división
  entre los sats comprados entre todos los aportes marcados como usados para esa compra. No es
  una promesa de nada." Ver `docs/mainnet.md`.
- La guía del dueño de la lista avisa que muchas transferencias de terceros a una cuenta
  personal pueden llamar la atención del banco, y que el resguardo es suyo.
- **Cambio del 21/10/2026 (Rodolfo, `docs/handoff/2026-10-21/listas-por-pais.md`):** la moneda y
  el medio dependen del país que elige el dueño (Argentina: alias o CBU/CVU en pesos; Brasil: PIX
  en reales; Colombia: Bre-B en pesos colombianos; zona euro: SEPA en euros; otro: texto libre en
  la moneda que elija). El dato de cobro se guarda **cifrado en el navegador del dueño** con una
  clave que viaja en el fragmento del link de la lista: la plataforma no lo puede ver, ni soporte
  ni admin. Las transferencias van de persona a persona y no pasan por la plataforma. No se suben
  comprobantes. Los sats de un aporte se muestran como declaración del dueño.

### 6. Costo por servicio (no comisión)
- Se llama **costo por servicio**: monto fijo por lista según el tipo de evento (y, si se
  define para regalos sueltos, también fijo o informado antes).
- Lo paga el que contrata el servicio, **aparte**: on-chain o Lightning, a una dirección de la
  plataforma. Nunca se descuenta de la dirección de un regalo ni de los aportes de invitados.
- No se usa la palabra "comisión" en la web ni en la documentación para este cobro (sí para la
  comisión de red).
- Es un ingreso facturable: antes de activarlo en mainnet, Rodolfo lo ve con su contador.

### 7. Qué sí se confía
- Quien controla el JavaScript servido podría cambiarlo. Es un riesgo de seguridad, no de
  custodia; se mitiga con cero scripts de terceros, CSP estricta y, más adelante, build
  reproducible con hash publicado. La página "Sin custodia" lo explica.

## Pendiente fuera del código

- Opinión de abogado especializado sobre la RG 1172/2026 (criterio de "control o influencia
  suficiente") antes de la etapa 6, con Bull&Bear International, LLC como operador; y Ley 25.326 (responsable
  extranjero, transferencia internacional de datos).
- Facturación del costo por servicio desde la LLC: contador.
- Términos y condiciones con el texto legal de las listas (transferencias de persona a persona,
  sin responsabilidad de la plataforma): revisión del abogado.
