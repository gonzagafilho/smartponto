#!/usr/bin/env bash
set -euo pipefail

: "${TOKEN_TENANT:?Rode: source scripts/login-tenant.sh}"

EMP_ID="${EMP_ID:-cmlqyr1xd00035nxrx7e3wvgu}"
SITE_ID="${SITE_ID:-cmlqz3vtn00055nxrj4xiu84w}"
SELFIE_URL="${SELFIE_URL:-/uploads/selfies/cmlqyeq0g00005nxr0vbzxmgn/cmlqyr1xd00035nxrx7e3wvgu/1771354915608.jpg}"

# se quiser forçar almoço sempre: export DO_LUNCH=1
DO_LUNCH="${DO_LUNCH:-0}"

make_body () {
  local TYPE="$1"
  jq -n \
    --arg employeeId "$EMP_ID" \
    --arg siteId "$SITE_ID" \
    --arg type "$TYPE" \
    --arg selfieUrl "$SELFIE_URL" \
    '{employeeId:$employeeId, siteId:$siteId, type:$type, latitude:-15.793889, longitude:-47.882778, selfieUrl:$selfieUrl}'
}

punch () {
  local TYPE="$1"
  local BODY
  BODY="$(make_body "$TYPE")"
  echo "---- $TYPE ----"
  curl -s -X POST "http://127.0.0.1:3011/timeentries/punch" \
    -H "Authorization: Bearer $TOKEN_TENANT" \
    -H "Content-Type: application/json" \
    -d "$BODY" | jq
}

last_type () {
  curl -s "http://127.0.0.1:3011/timeentries?employeeId=$EMP_ID" \
    -H "Authorization: Bearer $TOKEN_TENANT" \
  | jq -r '.[0].type // "NONE"'
}

LAST="$(last_type)"
echo "Último tipo: $LAST"

case "$LAST" in
  NONE|OUT)
    punch "IN"
    # Se quiser almoço automático, rode o script 3x em sequência, ou export DO_LUNCH=1 e ele faz o próximo passo
    ;;
  IN)
    if [ "$DO_LUNCH" = "1" ]; then
      punch "LUNCH_OUT"
    else
      punch "OUT"
    fi
    ;;
  LUNCH_OUT)
    punch "LUNCH_IN"
    ;;
  LUNCH_IN)
    punch "OUT"
    ;;
  *)
    echo "Tipo desconhecido: $LAST"
    exit 1
    ;;
esac
