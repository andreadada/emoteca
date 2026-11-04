#!/bin/sh
set -eu
node /opt/emoteca/catalog-api.mjs &
API_PID=$!
trap 'kill "$API_PID" 2>/dev/null || true' EXIT HUP INT TERM
exec nginx -g 'daemon off;'
