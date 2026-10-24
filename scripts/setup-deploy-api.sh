#!/bin/bash
# Una sola vez: crea la cuenta de servicio con la que GitHub Actions publica la API de mainnet
# (.github/workflows/deploy-api.yml). Correr con una cuenta dueña del proyecto, por ejemplo en
# Cloud Shell: bash scripts/setup-deploy-api.sh
# Permisos mínimos: desplegar solo el servicio de la API de mainnet, subir imágenes al repositorio
# de la API y usar la cuenta con la que corre el servicio. Solo la rama main del repo la puede usar.
set -euo pipefail
P=regalalebitcoins
N=522829661671
SA="deploy-api@$P.iam.gserviceaccount.com"

gcloud iam service-accounts describe "$SA" --project "$P" >/dev/null 2>&1 ||
  gcloud iam service-accounts create deploy-api --project "$P" --display-name "Deploy API mainnet (GitHub Actions)"
gcloud run services add-iam-policy-binding regalalebitcoins-api-mainnet --project "$P" --region southamerica-east1 \
  --member "serviceAccount:$SA" --role roles/run.developer
gcloud iam service-accounts add-iam-policy-binding "$N-compute@developer.gserviceaccount.com" --project "$P" \
  --member "serviceAccount:$SA" --role roles/iam.serviceAccountUser
gcloud artifacts repositories add-iam-policy-binding regalalebitcoins --project "$P" --location southamerica-east1 \
  --member "serviceAccount:$SA" --role roles/artifactregistry.writer
gcloud iam service-accounts add-iam-policy-binding "$SA" --project "$P" --role roles/iam.workloadIdentityUser \
  --member "principal://iam.googleapis.com/projects/$N/locations/global/workloadIdentityPools/github/subject/repo:ClaudiaBITS21/RegalaleBitcoins:ref:refs/heads/main"
echo "Listo: la cuenta $SA puede publicar la API desde main."
