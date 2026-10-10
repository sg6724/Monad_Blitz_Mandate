#!/usr/bin/env bash
# Calls the TaskPay keeper every 60 s so expired tasks are refunded to their owners.
# Usage: KEEPER_URL=https://<site> KEEPER_SECRET=... scripts/keeper-loop.sh
set -u
URL="${KEEPER_URL:-http://localhost:3000}"
: "${KEEPER_SECRET:?set KEEPER_SECRET}"
while true; do
  printf '%s ' "$(date '+%H:%M:%S')"
  curl -s -m 50 "$URL/api/keeper?key=$KEEPER_SECRET" || echo "keeper call failed"
  echo
  sleep 60
done
