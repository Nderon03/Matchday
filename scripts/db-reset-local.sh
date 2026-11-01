#!/usr/bin/env bash
# Recreate a throwaway local database (plain PostgreSQL) with the Supabase stubs and
# all migrations applied. Used by the SQL integration/security test-suite.
set -euo pipefail
DB=${MATCHDAY_TEST_DB:-matchday_test}
PSQL="psql -v ON_ERROR_STOP=1 -q ${PGURL:-postgresql://postgres:postgres@localhost:5432/postgres}"
$PSQL -c "drop database if exists $DB with (force)" -c "create database $DB"
TARGET="${PGURL_BASE:-postgresql://postgres:postgres@localhost:5432}/$DB"
psql -v ON_ERROR_STOP=1 -q "$TARGET" -f "$(dirname "$0")/../supabase/tests/auth_stub.sql"
for f in "$(dirname "$0")"/../supabase/migrations/*.sql; do
  psql -v ON_ERROR_STOP=1 -q "$TARGET" -f "$f"
done
echo "Database $DB ready."
