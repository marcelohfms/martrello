#!/bin/sh
set -e

DB_FILE="${DATABASE_URL#file:}"
DATA_DIR="$(dirname "$DB_FILE")"

if ! touch "$DATA_DIR/.write-test" 2>/dev/null; then
  echo "ERRO: $DATA_DIR não é gravável pelo usuário $(id -u). Verifique o volume montado em $DATA_DIR." >&2
  exit 1
fi
rm -f "$DATA_DIR/.write-test"

node dist/scripts/migrate.js
exec node server.js
