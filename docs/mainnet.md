# Mainnet

## Autorización

| Fecha | Quién | Qué |
|---|---|---|
| 17/10/2026 | Claudia (responsable del proyecto) | "Autorizo Mainnet con tope de 20 hasta ver que funciona todo." |

- Tope: **USD 20 por regalo**, fijo en el código (`MAINNET_CEILING_USD` en `apps/api/src/app.ts`).
  La variable `TOPE_USD` solo puede bajarlo. Subirlo requiere una nueva autorización explícita
  anotada en esta tabla.
- Hasta tener el dominio, mainnet vive en `https://regalalebitcoins.web.app`. La responsable no
  usa signet: el sitio `regalalebitcoins-signet` no se creó (el destino queda en `firebase.json`
  por si hace falta) y el servicio `regalalebitcoins-api` de signet sigue con la versión anterior.

## Cómo está separado

| | Mainnet | Signet |
|---|---|---|
| Web | sitio `regalalebitcoins`, `pnpm build:mainnet` → `apps/web/dist-mainnet` | sitio `regalalebitcoins-signet`, `pnpm build` → `apps/web/dist` |
| API | Cloud Run `regalalebitcoins-api-mainnet` | Cloud Run `regalalebitcoins-api` |
| Base | base `regalale_mainnet` (misma instancia Cloud SQL, usuario propio) | base `regalale` |
| Cadena | `https://mempool.space/api` | `https://mempool.space/signet/api` |
| Tareas | Scheduler `difusiones-mainnet` | Scheduler `difusiones-programadas` |

La API de mainnet arranca solo con `NETWORK=mainnet` y `ALLOW_MAINNET=autorizado`. La web solo
abre regalos de mainnet si se compiló con `VITE_ALLOW_MAINNET=autorizado` (`build:mainnet`).
Misma imagen de API para las dos; cambian las variables.

Variables de la API de mainnet: `NETWORK=mainnet`, `ALLOW_MAINNET=autorizado`, `TOPE_USD=20`,
`PUBLIC_URL=https://regalalebitcoins.web.app`, `DB_NAME=regalale_mainnet`, `DB_USER`,
`DB_SOCKET`, `RUN_BROADCASTER_LOOP=no`, `MAIL_FROM`; secretos `DB_PASSWORD`, `TAREAS_TOKEN` y
`RESEND_API_KEY` propios de mainnet.

## Antes de abrir

1. Revisión de seguridad de lo que mueve fondos, con los bloqueantes resueltos.
2. ~~Prueba corta en signet~~: salteada por decisión de la responsable (17/10/2026).
3. Primer regalo real de la responsable (≈ USD 5) de punta a punta: regalar, pagar, abrir,
   reclamar a una billetera propia.
4. Recién ahí, compartir el link.

## Limitaciones conocidas mientras no haya dominio

- **Mails:** Resend sin dominio verificado solo entrega a la dueña de la cuenta. El acceso por
  mail y los avisos no llegan a otras personas; la passkey funciona igual.
- **Passkeys:** quedan con rpId `regalalebitcoins.web.app`. Al mudarse a `regalalebitcoins.com`
  se pueden seguir usando con *Related Origin Requests* de WebAuthn (`/.well-known/webauthn` en
  web.app con el origen del .com) en vez de pedir a cada persona que cree otra.

## Revisión de seguridad (17/10/2026)

Sin caminos para que el servidor desvíe fondos: dirección derivada en el navegador, UTXO
verificados contra el txid, barrido de una sola salida controlado antes y después de firmar.

| Hallazgo | Estado |
|---|---|
| **B1.** Mismo código de recuperación → mismo link y palabras en signet y mainnet (el esquema no separa redes) | Esquema sin cambios (opción B, 17/10/2026): la responsable no usa signet. Regla: nunca usar en mainnet un código de recuperación usado en signet. Se puede revisar antes del lanzamiento público |
| I1. Tasa de comisión del servidor sin tope en el navegador | Arreglado: tope de 500 sat/vB y confirmación aparte si la comisión supera el 25 % |
| I2. Si "ahora" no alcanzaba, no se ofrecía "esperar" | Arreglado: se arman por separado, con la tasa mínima como último recurso |
| I3. Un reclamo expulsado de la mempool trababa el regalo | Arreglado: se libera si la red no conoce la transacción y los fondos siguen ahí |
| I4. No repetir índices dependía solo de la base | Arreglado: una dirección con movimientos cuenta como usada |
| I5. Sin nodo propio y con Firebase delante | Propuesto aceptar para la beta con tope de USD 20, con llaves de seguridad en las cuentas que pueden desplegar; pendiente de confirmación |
| M2. Links de acceso a los logs sin mailer | Arreglado: mainnet no arranca sin `RESEND_API_KEY` |
| M3. Control de red en `/utxos` y `/claim` | Arreglado |
| M7. Directorio de Firebase | Arreglado (sitios separados) |
| M8. Cartel de prueba atado a la compilación | Arreglado: sale de la red real |
| M1, M4, M5, M6, M9, M10, M11 | Menores, para después de abrir |

## Deploy del 17/10/2026

- Imagen `api:22f89f0-v1`; servicio `regalalebitcoins-api-mainnet` (revisión 00001) arrancó con
  `red: mainnet`, cadena `https://mempool.space/api` y migraciones 001–004 en `regalale_mainnet`.
- Secretos nuevos: `db-password-mainnet`, `tareas-token-mainnet`. Scheduler `difusiones-mainnet`.
- Web `pnpm build:mainnet` en el sitio `regalalebitcoins` (`firebase deploy --only hosting:mainnet`).
- Acceso público al servicio (`--no-invoker-iam-check`): lo corre la responsable desde Cloud Shell.
