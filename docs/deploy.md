# Deploy

Mainnet y signet están separados: ver [mainnet.md](mainnet.md).

Todo vive en el proyecto de Google Cloud `regalalebitcoins`, región `southamerica-east1`.

| Pieza | Dónde |
|---|---|
| Web | Firebase Hosting, sitio `regalalebitcoins` → https://regalalebitcoins.web.app |
| API | Cloud Run `regalalebitcoins-api` (imagen en Artifact Registry `regalalebitcoins/api`) |
| Base | Cloud SQL Postgres 16 `regalalebitcoins-db`, base y usuario `regalale` |
| Secretos | Secret Manager: `db-password`, `tareas-token`, `resend-api-key` |
| Mails | Resend (`RESEND_API_KEY`, remitente `MAIL_FROM`). Sin dominio verificado solo llega a la dueña de la cuenta de Resend |
| Difusiones programadas | Cloud Scheduler `difusiones-programadas`, cada 5 min, POST `/api/tareas/difusiones` con OIDC (`tareas-scheduler@`) y header `x-tarea-token` |

Firebase Hosting reenvía `/api/**`, `/r/**` y `/c/**` a Cloud Run; el resto cae en `index.html`.
`/r/<id>` y `/c/<corto>` los sirve la API (share.ts): la misma web, con la vista previa del regalo
o del cupón (link corto, migración 030) para WhatsApp y las redes. Al sumar una de estas reglas,
primero la API y después la web: si no, el link llega a una API que todavía no lo conoce.

## API

```sh
gcloud builds submit --config cloudbuild.api.yaml --substitutions _TAG=<commit>-v1
gcloud run deploy regalalebitcoins-api --region southamerica-east1 \
  --image southamerica-east1-docker.pkg.dev/regalalebitcoins/regalalebitcoins/api:<commit>-v1
```

La configuración (variables, secretos, conexión a Cloud SQL) queda en el servicio; el deploy
solo cambia la imagen. `RUN_BROADCASTER_LOOP=no`: las difusiones las dispara Scheduler.

Variables de cuentas (etapa 4, paso 4):
- `PUBLIC_URL`: origen público, base de los links de los mails y rpId de las passkeys.
- `ALLOWED_ORIGINS`: otros orígenes aceptados (coma).
- `MAIL_FROM` y el secreto `RESEND_API_KEY=resend-api-key:latest`.
- `ADMIN_EMAILS`: admins fijos (coma). Desde el 21/10 se pueden sumar más admins desde `/admin`
  (tabla `admins`, con passkey y aviso por mail a todos); los fijos no se quitan desde el panel.

```sh
gcloud run services update regalalebitcoins-api --region southamerica-east1 \
  --update-env-vars PUBLIC_URL=https://regalalebitcoins.web.app \
  --update-secrets RESEND_API_KEY=resend-api-key:latest
```

La organización tiene *domain restricted sharing*, que impide dar `allUsers`. El servicio es
público con el control de invocador desactivado (`--no-invoker-iam-check`), solo en este servicio.

## Web

```sh
pnpm build && pnpm build:mainnet
npx firebase deploy --only hosting:signet,hosting:mainnet --project regalalebitcoins
```

**Mainnet desde GitHub Actions (desde el 18/10/2026):** workflow «Deploy web mainnet»
(`.github/workflows/deploy.yml`), solo a mano (*Run workflow*) y solo desde `main`. Compila con
`pnpm build:mainnet`, deja la huella en el resumen de la corrida y publica `hosting:mainnet`.
Se autentica con federación de identidades (pool `github`, proveedor `github-oidc`) como la cuenta
de servicio `deploy-hosting@regalalebitcoins.iam.gserviceaccount.com`: no hay claves guardadas.

**API de mainnet desde GitHub Actions (desde el 24/10/2026):** workflow «Deploy API mainnet»
(`.github/workflows/deploy-api.yml`), solo a mano y solo desde `main`. Construye la imagen en el
runner, la sube a Artifact Registry (`api:<commit>-gh`) y despliega esa imagen en
`regalalebitcoins-api-mainnet`; la configuración del servicio no cambia y las migraciones se
aplican al arrancar. Se autentica como `deploy-api@regalalebitcoins.iam.gserviceaccount.com`
(federación de identidades, sin claves), que solo puede desplegar ese servicio, subir imágenes al
repositorio de la API y solo se puede usar desde `main`. Se crea una vez con
`scripts/setup-deploy-api.sh`. Orden: primero la API, después la web.

## Dominio

`regalalebitcoin.com` y `www` (redirige a la raíz) están dados de alta en Firebase Hosting.
Registrador y DNS: Metaregistrar (nameservers `ns1`/`ns2`/`ns3.yourdomainprovider.net`, cambiados
por la responsable el 18/10/2026). Registros: A `@` 199.36.158.100, TXT `@`
`hosting-site=regalalebitcoins`, CNAME `www` `regalalebitcoins.web.app.`

El dominio viejo en plural, `regalalebitcoins.com`, sigue delegado a AWS Route 53. No es el del
sitio.

## Huella de cada versión (desde el 18/10/2026)

`pnpm build:mainnet` compila el sitio, arma la herramienta sin conexión
(`herramienta-sin-conexion.html`) y escribe `version.json` con la huella. Después de cada
`firebase deploy --only hosting:mainnet`, agregar una fila a `docs/versiones.md` con la fecha, el
commit, la huella del sitio y la de la herramienta, y subirla. `/sin-custodia` explica cómo
comprobarla.
