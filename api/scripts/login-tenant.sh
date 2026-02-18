#!/usr/bin/env bash
set -euo pipefail

EMAIL="${EMAIL:-admin@dcnet.com}"
PASS="${PASS:-}"

if [[ -z "$PASS" ]]; then
  read -s -p "Senha do tenant ($EMAIL): " PASS
  echo
fi

RESP=$(curl -s -X POST "http://127.0.0.1:3011/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}")

TOKEN_TENANT=$(echo "$RESP" | jq -r '.accessToken')

if [[ -z "$TOKEN_TENANT" || "$TOKEN_TENANT" == "null" ]]; then
  echo "❌ Falha no login. Resposta:"
  echo "$RESP" | jq || echo "$RESP"
  exit 1
fi

export TOKEN_TENANT
echo "✅ TOKEN_TENANT gerado. LEN=${#TOKEN_TENANT}"

curl -s "http://127.0.0.1:3011/auth/me" \
  -H "Authorization: Bearer $TOKEN_TENANT" | jq
