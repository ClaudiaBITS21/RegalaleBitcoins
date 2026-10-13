# Deploy (signet)

Todo vive en el proyecto de Google Cloud `regalalebitcoins`, región `southamerica-east1`.

| Pieza | Dónde |
|---|---|
| Web | Firebase Hosting, sitio `regalalebitcoins` → https://regalalebitcoins.web.app |
| API | Cloud Run `regalalebitcoins-api` (imagen en Artifact Registry `regalalebitcoins/api`) |
| Base | Cloud SQL Postgres 16 `regalalebitcoins-db`, base y usuario `regalale` |
| Secretos | Secret Manager: `db-password`, `tareas-token` |
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

La organización tiene *domain restricted sharing*, que impide dar `allUsers`. El servicio es
público con el control de invocador desactivado (`--no-invoker-iam-check`), solo en este servicio.

## Web

```sh
pnpm build
npx firebase deploy --only hosting --project regalalebitcoins
```

## Dominio

`regalalebitcoins.com` y `www` (redirige a la raíz) están dados de alta en Firebase Hosting.
DNS en Namecheap: A `@` 199.36.158.100, TXT `@` `hosting-site=regalalebitcoins`, CNAME `www`
`regalalebitcoins.web.app.`
