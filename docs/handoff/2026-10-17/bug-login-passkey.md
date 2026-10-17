# Handoff 17/10/2026: no se puede volver a entrar con la passkey

Ruta sugerida en el repo: `docs/handoff/2026-10-17/bug-login-passkey.md`

Reportado por Rodolfo desde su iPhone, en https://regalalebitcoins.web.app (mainnet).
Captura: paso 4 de 5, "Entrá a tu cuenta", error "No pudimos verificar tu acceso. Probá de nuevo."

## Qué pasó

1. **16/10:** creó cuenta en el flujo de regalar (mail + passkey). Funcionó.
2. **17/10, ~09:30 (hora Argentina):** volvió a entrar al flujo.
   - Puso el mail y eligió "crear cuenta" (por error: ya tenía). La web lo llevó a la passkey y
     dio error.
   - Fue a "ya tengo cuenta" → "Entrar con mi cara o huella" → error.
   - En algún momento la web le dijo que ya tenía cuenta y que entrara con la passkey. Volvió a
     fallar. Quedó en un loop sin salida, salvo "Crear una cuenta nueva".
3. **No confirmado:** si apareció el pedido de Face ID antes del error. Rodolfo cree que sí.

Mismo teléfono que el 16/10. Pedirle a Rodolfo versión de iOS y navegador si hace falta.

## Riesgo

Si la única salida es "Crear una cuenta nueva", el usuario pierde la clave maestra anterior y con
ella la posibilidad de recuperar los regalos que hizo (quien recibe puede reclamarlos igual). En
mainnet eso es plata real. **Mientras no se arregle, la pantalla no debería empujar a crear una
cuenta nueva sin advertir eso.**

## Diagnóstico (revisado en `etapa-4-regalar`, commit ad60456)

Descartado: los desafíos se guardan en la base (`desafios`), el contador 0 se acepta
(`verifyAssertion`), el rpId sale del origen.

**Causa probable: passkey huérfana.** En `apps/web/src/account.ts`, `createAccess()` llama a
`navigator.credentials.create()` **antes** de que el servidor revise el mail. El servidor
responde `409 cuenta_existente` (`accountRoutes.ts`, `/api/cuenta/registro`) y no guarda nada,
pero la passkey ya quedó en el llavero del usuario. Como `user.id` es aleatorio, no reemplaza a
la anterior: quedan dos passkeys del sitio con el mismo mail. En el ingreso, `signIn()` no pasa
`allowCredentials` (passkey descubrible) y el iPhone ofrece la más nueva. El servidor no la
conoce (`Passkey desconocida`), devuelve `passkey_invalida` y la web muestra el mensaje genérico.

Confirmar en logs de Cloud Run (`southamerica-east1`) del 17/10 ~09:30 ART: un `409
cuenta_existente` en `/api/cuenta/registro` seguido de `401 Passkey desconocida` en
`/api/cuenta/ingreso`.

## Tareas

1. **Revisar el mail antes de crear la passkey.** Si ya existe, ir directo a entrar sin llamar a
   `navigator.credentials.create()`. Test: "crear cuenta" con mail existente no crea credencial.
2. **Passkey desconocida con su propio código** (`passkey_desconocida`) y mensaje: "Esta passkey
   no está registrada. Si tenés más de una, elegí otra." Donde el navegador lo soporte, llamar a
   `PublicKeyCredential.signalUnknownCredential()` para que el llavero borre la huérfana.
3. **Errores distinguibles**, en el navegador y en logs: cancelaste / este teléfono no tiene tu
   passkey / falló el servidor. Registrar el `name` del error de WebAuthn (`NotAllowedError`,
   `InvalidStateError`, etc.) y el motivo del rechazo en el servidor.
4. **Flujo con mail existente:** "crear cuenta" con un mail que ya tiene cuenta lleva directo a
   entrar, sin loop.
5. **Salida segura cuando la passkey falla:** "Entrar con mis 12 palabras" (si las tiene) y, si
   elige cuenta nueva, una advertencia clara de que no va a poder recuperar los regalos de la
   cuenta anterior.

## Textos de esta pantalla

- Reemplazar "Nosotros guardamos tu regalo cerrado: ni nosotros ni nadie lo puede abrir sin vos."
  Es inexacto: el regalo lo abre quien lo recibe. Lo que se guarda cerrado es la clave de
  recupero. Propuesta: "Guardamos tu llave en una caja cerrada que solo se abre con tu cara o tu
  huella. Nosotros no podemos abrirla."
- Reemplazar "con eso se cifra tu regalo ahí mismo" por "con eso se abre tu llave ahí mismo".
- En la pantalla de entrar, "Prefiero anotar un código" → "Entrar con mis 12 palabras".

## ABIERTO (Rodolfo)

- **Primero se arregla este bug.** Después, respaldo de la clave maestra: la clave maestra ya
  son 12 palabras guardadas en la bóveda. **No se genera una clave nueva.**
  - Cuentas nuevas: mostrar las 12 palabras al crear la passkey y pedir anotarlas.
  - Cuentas existentes: después de un ingreso exitoso, ofrecer "Anotá tus 12 palabras" (las
    mismas, abiertas de la bóveda).
  - Si la passkey falla: no forzar nada; primero resolver el acceso.
  - Pendiente de Rodolfo: si anotarlas es obligatorio o solo muy recomendado.

## Estado (17/10/2026)

Tareas 1 a 5 y textos de la pantalla: **hechos** (ver `docs/arquitectura.md`, "Cuenta y panel").
Test de API (`passkey huérfana`) y recorrido e2e con autenticador virtual: "crear cuenta" con mail
existente no deja credencial en el autenticador. El respaldo de las 12 palabras para cuentas con
passkey (sección ABIERTO) sigue pendiente de la decisión de Rodolfo.
