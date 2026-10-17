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

Desde el 17/10/2026 el dominio y la marca son **`regalalebitcoin.com`** / **RegalaleBitcoin**
(singular). El `.com` viejo, `regalalebitcoins.com`, se conserva solo para redirigir al nuevo
(links impresos o compartidos con el nombre anterior, typos y anti-phishing).

Los identificadores de infraestructura **no cambian** (no se pueden renombrar sin rehacer todo):
proyecto GCP y sitio Firebase `regalalebitcoins`, `regalalebitcoins.web.app`, servicios Cloud Run,
Artifact Registry, Cloud SQL, paquetes `@regalale/*`. Tampoco cambian las constantes de la bóveda
(`"regalalebitcoins/boveda/v1/..."` en `docs/derivacion.md`): son dominio de separación
criptográfico, cambiarlas deja inaccesibles las bóvedas existentes.

| Dominio | En Firebase Hosting (sitio `regalalebitcoins`, mainnet) | DNS |
|---|---|---|
| `regalalebitcoin.com` | dominio principal | A `@` 199.36.158.100 · TXT `@` `hosting-site=regalalebitcoins` (+ el `_acme-challenge` si la consola lo pide) |
| `www.regalalebitcoin.com` | redirige a `regalalebitcoin.com` | CNAME `www` → `regalalebitcoins.web.app.` |
| `regalalebitcoins.com` y `www` | redirigen (301) a `regalalebitcoin.com` | los mismos registros que ya estaban (Route 53) |

Los valores exactos los da la consola de Firebase al agregar cada dominio: si difieren, mandan
los de la consola.

Al apuntar el dominio:

- Web: `VITE_PUBLIC_URL=https://regalalebitcoin.com pnpm build:mainnet` y deploy.
- API mainnet: `PUBLIC_URL=https://regalalebitcoin.com` (base de los links y rpId de las passkeys)
  y `ALLOWED_ORIGINS=https://regalalebitcoins.web.app` mientras convivan.
- Passkeys hechas en web.app no sirven en el dominio nuevo: entrar por mail y crear otra, o
  *Related Origin Requests* (ver `mainnet.md`).
- Resend: verificar `regalalebitcoin.com` (o un subdominio de envío) y cambiar `MAIL_FROM`
  a `RegalaleBitcoin <hola@regalalebitcoin.com>`.
