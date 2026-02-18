#!/usr/bin/env bash
set -euo pipefail

: "${TOKEN_TENANT:?Defina TOKEN_TENANT antes (export TOKEN_TENANT=...)}"

EMP_ID="${EMP_ID:-cmlqyr1xd00035nxrx7e3wvgu}"
SITE_ID="${SITE_ID:-cmlqz3vtn00055nxrj4xiu84w}"
SELFIE_URL="${SELFIE_URL:-/uploads/selfies/cmlqyeq0g00005nxr0vbzxmgn/cmlqyr1xd00035nxrx7e3wvgu/1771354915608.jpg}"

DEVICE_ID="${DEVICE_ID:-android-001}"
DEVICE_TS="${DEVICE_TS:-2026-02-17T19:20:00.000Z}"

BODY=$(jq -n \
  --arg employeeId "$EMP_ID" \
  --arg siteId "$SITE_ID" \
  --arg type "IN" \
  --arg selfieUrl "$SELFIE_URL" \
  --arg deviceId "$DEVICE_ID" \
  --arg deviceTs "$DEVICE_TS" \
  '{employeeId:$employeeId, siteId:$siteId, type:$type, latitude:-15.793889, longitude:-47.882778, selfieUrl:$selfieUrl, deviceId:$deviceId, deviceTs:$deviceTs}')

curl -s -X POST "http://127.0.0.1:3011/timeentries/punch" \
  -H "Authorization: Bearer $TOKEN_TENANT" \
  -H "Content-Type: application/json" \
  -d "$BODY" | jq
