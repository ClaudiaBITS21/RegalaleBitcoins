# Handoff 17/10/2026: cómo operamos (sin custodia, no PSAV)

Decisión de Rodolfo, 17/10/2026: **"Estas limitaciones y observaciones son cosas con las que
estoy de acuerdo. Que quede claro que así operamos."**

Este documento fija las reglas de operación de RegalaleBitcoins frente al régimen de
Proveedores de Servicios de Activos Virtuales (Ley 27.739, RG CNV 1172/2026, vigente desde el
16/10/2026). La plataforma **no intercambia, no transfiere y no custodia** activos virtuales de
terceros: da software de autocustodia y un servicio de presentación del regalo. Para que eso
sea cierto, la arquitectura tiene que poder demostrarlo. Estas reglas son de
cumplimiento obligatorio. Cambiar cualquiera requiere una decisión explícita de Rodolfo,
anotada acá.

**Pedido a Code:** mover este texto a `docs/operacion.md`, enlazarlo desde `docs/arquitectura.md`
y `CLAUDE.md`, y aplicar las tareas de la sección final.

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

## Tareas para Code

1. Crear `docs/operacion.md` con este contenido y enlazarlo desde `docs/arquitectura.md` y
   `CLAUDE.md` ("antes de cambiar flujos de fondos, leer docs/operacion.md").
2. `docs/arquitectura.md`, decisión pendiente 4 (link guardado): reemplazar "cifrado en la base"
   por la regla 4.
3. `docs/arquitectura.md`, etapa 7 y `docs/contenido.md` punto 5: reemplazar "alias bancario con
   conversión por tandas" por "alias bancario del dueño de la lista; la web informa las tandas
   y el dueño convierte y deposita por su cuenta".
4. Agregar un test de regresión que documente la regla 3: el endpoint de reclamo rechaza barridos
   con más de una salida (si ya existe, nombrarlo como test de la regla).
5. Revisar textos de la web: "comisión" solo para la de red; el cobro de la plataforma es
   "costo por servicio".
6. Cuando se haga el cobro: pago aparte (regla 6). No implementar sin confirmar el monto con
   Rodolfo.

## Pendiente fuera del código
- Opinión de abogado especializado sobre la RG 1172/2026 (criterio de "control o influencia
  suficiente") antes de la etapa 6.
- Facturación del costo por servicio: contador.
