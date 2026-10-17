# Handoff — mudanza a regalalebitcoin.com (Cowork, 17/10/2026)

Decisión de la responsable: el dominio y la marca pasan a **regalalebitcoin.com** / **RegalaleBitcoin**
(singular). Rama `cowork/dominio`, desde `main`.

## Qué cambió en esta rama

- Textos de la web en los 4 idiomas, título, `og:*`, manifest, wordmark (`regalale<span>bitcoin</span>`),
  mails (asuntos), `rpName` de la passkey, nombre de descarga del cuento, tarjeta imprimible,
  CLAUDE.md, README y docs (`arquitectura`, `contenido`, `derivacion` §link, `mainnet`, `deploy`).
- `og.jpg` regenerado con `node apps/e2e/imagenes.ts` (los íconos salieron idénticos).
- `cuento-navidad.pdf`: editado el PDF (no está el HTML fuente en el repo): wordmark de tapa y
  contratapa sin la "s", recentrados; URL y link de la contratapa a `regalalebitcoin.com`.
- typecheck, `pnpm test` (core 200, web 29, api 52) y `pnpm build` en verde.

## Qué NO cambió, a propósito

- Identificadores de infraestructura: proyecto GCP / sitio Firebase `regalalebitcoins`,
  `regalalebitcoins.web.app`, Cloud Run, Artifact Registry, Cloud SQL, `.firebaserc`, `firebase.json`,
  paquetes `@regalale/*`, bases `regalale*`.
- Constantes de la bóveda `"regalalebitcoins/boveda/v1/..."` (vault.ts y derivacion.md): son
  separación de dominio criptográfica; cambiarlas rompe las bóvedas existentes.
- Handoffs y `docs/fuentes/` (históricos).

## Para hacer (Code)

1. Integrar la rama y deployar web con `VITE_PUBLIC_URL=https://regalalebitcoin.com` **recién
   cuando el dominio resuelva** (antes, seguir con web.app para que el og:image cargue).
2. API mainnet: `PUBLIC_URL=https://regalalebitcoin.com`, `ALLOWED_ORIGINS=https://regalalebitcoins.web.app`.
   Passkeys: las de web.app no sirven en el dominio nuevo → evaluar Related Origin Requests
   (`/.well-known/webauthn`) o reentrar por mail.
3. Resend: verificar el dominio y `MAIL_FROM=RegalaleBitcoin <hola@regalalebitcoin.com>`.
4. `regalalebitcoins.com` (+www) quedan en Firebase como redirección 301 a `regalalebitcoin.com`.
5. Sigue vigente el bloqueante: 2FA confirmada por la responsable antes de lanzar en el dominio.
6. La descripción del repo y su nombre en GitHub: lo decide la responsable (renombrar el repo
   redirige los clones viejos).
