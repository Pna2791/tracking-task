#!/bin/sh
# Seed the SQLite volume from the image-baked snapshot on first boot only.
# Subsequent starts leave an existing /app/data/app.db untouched.
set -eu

DB_PATH="${DB_PATH:-/app/data/app.db}"
SEED_DB="${SEED_DB:-/app/seed/app.db}"

mkdir -p "$(dirname "$DB_PATH")"

if [ ! -f "$DB_PATH" ] && [ -f "$SEED_DB" ]; then
  echo "==> Seeding $DB_PATH from $SEED_DB (first boot)"
  cp "$SEED_DB" "$DB_PATH"
fi

exec "$@"
