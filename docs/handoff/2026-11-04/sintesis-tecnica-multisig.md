# Handoff 04/11/2026: síntesis de la parte técnica (multisig 1 de 2)

Estado: EN ESPERA — no se publicó. Verificado el 04/11/2026: la implementación **no** es una
multisig 1 de 2. Cada regalo es una dirección P2WPKH de una sola clave, derivada con BIP85 de la
clave maestra de quien regala (docs/derivacion.md, secciones 2 y 3): quien recibe la abre con el
link (semilla) + 4 palabras (passphrase), y quien regala la recupera con su clave maestra porque
deriva la misma clave. La multisig 1-de-2 existe solo en el modo avanzado (sección 10), guardado y
apagado en todas las redes. Frase propuesta a Rodolfo, a confirmar: «Cada regalo tiene su propia
dirección. La abre el link (+ 4 palabras) de quien recibe, y mientras no se abra, tu clave también
la puede recuperar. Nosotros NO tenemos las llaves.»

Decisión de Rodolfo, 04/11/2026. Texto aprobado, poner **arriba de todo de la sección/página técnica** (la que explica cómo funciona por dentro / "Sin custodia"), como síntesis antes del detalle.

## Texto (es-AR, literal)

> Cada regalo es una multisig 1 de 2 entre tu clave y el link (+ 4 palabras) de quien recibe. Nosotros NO tenemos las llaves.

## Antes de publicar: verificar

- **Confirmar que las direcciones de regalo son efectivamente multisig 1 de 2** (dos claves, cualquiera alcanza: la de recupero del que regala y la derivada de semilla del link + passphrase de quien recibe). Si la implementación es otra (Taproot con dos ramas, clave del regalo derivada de la maestra del que regala, etc.), **no publicar** y avisar a Rodolfo para ajustar la frase.
- Modo avanzado (xpub propia del que regala): verificar que la frase sigue siendo cierta en ese caso ("tu clave" = la de su billetera).

## Reglas de redacción (no cambiar sin consultar)

- No decir que la plataforma "firma": firma el navegador del usuario; el servidor solo difunde transacciones ya firmadas (regla 1 y 3 de docs/operacion.md).
- No llamarlo "billetera": es una dirección de paso hasta que se abre el regalo.
- "Tu clave" = passkey o código de 12 palabras (o xpub en modo avanzado), no "tu navegador".

## i18n

- Pendiente traducción EN / PT / IT con el mismo sentido. Si se traduce, mantener "1 de 2" (1-of-2 / 1 de 2 / 1 su 2) y el énfasis en "NO".
