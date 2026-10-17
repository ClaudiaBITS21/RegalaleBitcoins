# Mainnet

## Autorización

| Fecha | Quién | Qué |
|---|---|---|
| 17/10/2026 | Claudia (responsable del proyecto) | "Autorizo Mainnet con tope de 20 hasta ver que funciona todo." |

- Tope: **USD 20 por regalo**, fijo en el código (`MAINNET_CEILING_USD` en `apps/api/src/app.ts`).
  La variable `TOPE_USD` solo puede bajarlo. Subirlo requiere una nueva autorización explícita
  anotada en esta tabla.
- Hasta tener el dominio, mainnet vive en `https://regalalebitcoins.web.app`. Signet pasa a
  `https://regalalebitcoins-signet.web.app`.

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
2. Prueba corta en signet con un celular y una billetera reales.
3. Primer regalo real de la responsable (≈ USD 5) de punta a punta: regalar, pagar, abrir,
   reclamar a una billetera propia.
4. Recién ahí, compartir el link.

## Limitaciones conocidas mientras no haya dominio

- **Mails:** Resend sin dominio verificado solo entrega a la dueña de la cuenta. El acceso por
  mail y los avisos no llegan a otras personas; la passkey funciona igual.
- **Passkeys:** quedan con rpId `regalalebitcoins.web.app`. Al mudarse a `regalalebitcoins.com`
  se pueden seguir usando con *Related Origin Requests* de WebAuthn (`/.well-known/webauthn` en
  web.app con el origen del .com) en vez de pedir a cada persona que cree otra.
