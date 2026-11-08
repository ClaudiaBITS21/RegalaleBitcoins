# Handoff 08/11/2026: canal empresas y exchanges (B2B) — v2

> Reemplaza a "2026-11-08 - empresas y exchanges (B2B).md" (v1). Cambios: tope de USD 250 para todo; cobro a empresas se define con el contador de USA; el cifrado con passkey ya está en curso por tu lado.

**Estado: DISEÑO.** Pedido a Code: leer, revisar factibilidad contra el código actual y devolver un plan por etapas con estimación y riesgos. **No implementar en mainnet sin OK de Rodolfo.** Lo marcado **ABIERTO** se consulta antes de tocarlo.

## Cambio inmediato (fuera del B2B)
- **Tope por regalo: USD 250 para todo el producto** (reemplaza los USD 500 del 21/10). Aplica a regalos nuevos; los ya creados no se tocan. Actualizar el límite y los textos que lo mencionen. Es la única excepción a "no tocar lo existente" de este handoff.

## Principio rector
- **El B2B es un canal paralelo.** No cambia nada de lo que ya funciona (regalo individual, listas, precios, cupones, reclamo). Si algo obliga a tocar un flujo existente, frenar y consultar.
- Rige `docs/operacion.md` completo: el servidor nunca firma ni reconstruye claves, el recupero lo firma el navegador de quien regala, el barrido tiene una sola salida, los pesos nunca pasan por la plataforma.

## Clientes
1. **Exchanges:** regalos internos y a clientes, y canal hacia sus cuentas corporativas.
2. **Empresas bitcoiners:** autoservicio, fondean desde su billetera.
3. **Empresas no bitcoiners:** compran los BTC en el exchange socio, que retira directo a las direcciones del lote. La empresa contrata con el exchange; nosotros no coordinamos pesos.

## Funciones

### 1. Envío masivo (lote)
- La empresa sube un **CSV** (identificador, nombre, monto, ocasión, mensaje). El navegador genera N regalos con la clave maestra de la cuenta.
- Fondeo: **una sola transacción con N salidas** desde la billetera de la empresa (o retiro del exchange a las N direcciones). La regla de una salida aplica al barrido, no al fondeo.
- **No mandamos nada a los destinatarios.** Se devuelve un CSV con los links para que la empresa los distribuya por sus canales.
- Tope: USD 250 por regalo, como en todo el producto. **ABIERTO:** tope por lote o por cuenta.

### 2. Vencimiento, recordatorios y recupero
- Plazo por defecto configurable por la cuenta (exchange o empresa).
- **Los recordatorios van solo a la cuenta que armó el lote**, nunca a destinatarios. Solo cantidades: "12 de 200 regalos del lote X siguen sin abrir y vencen en N días". Propuesta: aviso a mitad de plazo y unos días antes del vencimiento, configurables.
- Acciones del panel: extender plazo, recuperar no reclamados, exportar pendientes.
- **Recupero en lote:** una transacción que gasta todos los no reclamados (muchas entradas, una salida a la dirección de la empresa), firmada en el navegador. Requiere confirmaciones, igual que el recupero individual.
- **Al vencer no se mueve nada solo.** El regalo sigue reclamable hasta que la empresa recupere. El panel lo tiene que decir claro.

### 3. Link y página con marca (co-branding)
- URL tipo `/x/<slug>` con logo, colores y links del socio.
- "Cómo comprar" y "cómo pasarlo a pesos o sumar más" apuntan al socio.
- Texto según quién financió: "Este regalo te llega gracias a X" solo si X fondeó; si X es solo el canal, "Te lo acerca X".
- **Reclamo: la billetera propia es la opción principal.** El exchange va como alternativa en segundo plano ("¿Preferís tenerlo en X? También podés") y aparece fuerte después de reclamar ("Ya es tuyo. Si algún día lo querés pasar a pesos o sumar más, X te ayuda"). No se negocia por socio.
- Botón "Fondear desde X" (deep link a retiro con dirección precargada): **ABIERTO**, depende de cada exchange.

### 4. Créditos prepagos
- Reusar el **sistema de cupones** existente (créditos gratis, con restricción opcional por ocasión). El socio compra un paquete y recibe cupones. No inventar un sistema nuevo.
- Cobro a empresas (factura, medio de pago): se define con el contador de USA. **No implementar cobro B2B hasta que Rodolfo lo confirme.**

### 5. Tarjetas imprimibles en lote
- El navegador de la empresa genera un PDF listo para imprenta (marca, QR, recuadro para las palabras). **Nunca se generan del lado del servidor.**
- Se fondean antes de entregarlas.
- No ofrecer venta de tarjetas fondeadas al público (riesgo PSAV).

### 6. API / SDK para exchanges
- **Fuera del piloto.** Solo cuando un exchange la pida con volumen. Si se hace: librería que corre en la app del socio (claves nunca salen de ahí) + nuestra API para link, tarjeta, estado y difusión.

## Datos y privacidad
Objetivo: poder decir **"No tenemos los datos de tus clientes: sus nombres y contactos quedan cifrados con tu clave, y nosotros no la tenemos."**

- **Usar el mismo mecanismo de cifrado con passkey que estás implementando para el regalo individual.** No crear uno propio para B2B.
- **En claro en el servidor:** cuenta (mail, credencial pública de passkey), facturación, configuración de marca, metadatos de lote (id, cantidad, vencimiento, estado) y direcciones de los regalos (para ver reclamos y mandar recordatorios).
- **Cifrado con la bóveda:** CSV de destinatarios, relación dirección ↔ persona, mensajes y textos de tarjetas.
- **Solo con la empresa conectada:** ver quién tiene pendiente, exportar, firmar recupero.
- **Nunca:** semilla, 4 palabras, clave maestra.
- **Cerrar fugas en el reclamo:**
  - Retención corta de IP y user agent en logs (definir plazo y escribirlo).
  - No persistir la dirección de destino del barrido asociada al regalo.
  - Métrica "eligió guardarlo en X": solo contador agregado por lote, sin asociar al regalo.

## Bloqueante antes de vender lotes: varias personas por cuenta
Una passkey es de una persona. Si la bóveda y la clave maestra de una empresa dependen de un solo operador y se va, la empresa pierde los datos y **la capacidad de recuperar los regalos no reclamados**. Se necesita:
- Clave de bóveda envuelta con varias passkeys (una por miembro), alta y baja de miembros sin re-cifrar todo.
- Código de 12 palabras en resguardo formal de la empresa.
- Roles: quien arma lotes no necesariamente puede recuperar fondos.

Pedido a Code: propuesta técnica para esto antes que cualquier otra cosa del B2B, compatible con el cifrado con passkey en curso.

## Las 4 palabras en lote — ABIERTO
Opciones a evaluar (la empresa elegiría por lote):
1. Canal separado (link por mail, palabras por otro medio o en mano). Recomendada.
2. Tarjeta física con las palabras escritas a mano (eventos, entregas presenciales).
3. Dato que el destinatario conoce (legajo, DNI). Débil si se filtra el link.
4. Sin palabras, con vencimiento corto y recupero por la empresa. Riesgo aceptado por decisión de negocio.

Pedido a Code: qué implica cada una en el esquema actual (seed + passphrase BIP39 de 44 bits) y si la 4 es viable sin cambiar la derivación existente.

## Pendiente fuera del código
- Abogado: B2B con co-branding de un PSAV, panel corporativo con recupero en lote, datos de empleados de terceros.
- Contador de USA: facturación y cobro a empresas.
- Cada empresa, con su contador: tratamiento de regalos en BTC a empleados (avisarlo en la propuesta comercial).
