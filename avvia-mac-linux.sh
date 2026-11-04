#!/usr/bin/env sh
cd "$(dirname "$0")" || exit 1
printf 'AFTERFRAME: apri http://localhost:8000 nel browser\n'
python3 -m http.server 8000
