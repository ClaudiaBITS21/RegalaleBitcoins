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

Firebase Hosting reenvía `/api/**` a Cloud Run; el resto cae en `index.html`.

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
