#!/bin/bash
# Una sola vez, ANTES de publicar la API con los mails cifrados (apps/api/src/secreto.ts).
# Correr con una cuenta dueña del proyecto, por ejemplo en Cloud Shell:
#   bash scripts/setup-kms-mails.sh
# Crea en Cloud KMS la clave que envuelve las claves de los mails. Esa clave no sale nunca de
# Google: ni el servidor ni nadie la puede bajar. Solo la cuenta con la que corre la API puede
# usarla (cifrar y descifrar), y cada uso queda en el registro de auditoría del proyecto.
# Después le dice a la API cuál es, con la variable CLAVE_MAILS_KMS.
set -euo pipefail
P=regalalebitcoins
N=522829661671
R=southamerica-east1
RING=regalalebitcoins
KEY=mails
SA="$N-compute@developer.gserviceaccount.com"

gcloud services enable cloudkms.googleapis.com --project "$P"
gcloud kms keyrings describe "$RING" --project "$P" --location "$R" >/dev/null 2>&1 ||
  gcloud kms keyrings create "$RING" --project "$P" --location "$R"
gcloud kms keys describe "$KEY" --project "$P" --location "$R" --keyring "$RING" >/dev/null 2>&1 ||
  gcloud kms keys create "$KEY" --project "$P" --location "$R" --keyring "$RING" --purpose encryption \
    --protection-level software --rotation-period 365d --next-rotation-time "$(date -u -d '+365 days' +%Y-%m-%dT00:00:00Z)"
gcloud kms keys add-iam-policy-binding "$KEY" --project "$P" --location "$R" --keyring "$RING" \
  --member "serviceAccount:$SA" --role roles/cloudkms.cryptoKeyEncrypterDecrypter
NAME="projects/$P/locations/$R/keyRings/$RING/cryptoKeys/$KEY"
gcloud run services update regalalebitcoins-api-mainnet --project "$P" --region "$R" --update-env-vars "CLAVE_MAILS_KMS=$NAME"
echo "Listo: la API usa $NAME para los mails. Ya se puede publicar la API nueva."
