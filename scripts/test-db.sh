#!/usr/bin/env bash
# ============================================================================
# SQL RPC regression harness for TrustNomiks' challenge-domain functions.
#
#   scripts/test-db.sh
#       Spins up a throwaway local Postgres 16 cluster (needs postgresql@16,
#       e.g. `brew install postgresql@16`) and tears it down on exit.
#
#   DATABASE_URL=postgresql://... scripts/test-db.sh
#       Runs against an already-running database (used in CI, where a
#       postgres:16 service is provided).
#
# It applies, in order: the auth/roles/base-table fixture (_bootstrap.sql), the
# challenge-domain migrations listed in supabase/tests/migrations.list, the
# assertion helpers (_assert.sql), then every supabase/tests/[0-9]*.sql test
# file. Any failed assertion aborts psql (ON_ERROR_STOP) and fails the script.
# ============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TESTS_DIR="$ROOT/supabase/tests"
MIGR_DIR="$ROOT/supabase/migrations"
MIGRATIONS_LIST="$TESTS_DIR/migrations.list"

start_local() {
  local prefix
  prefix="$(brew --prefix postgresql@16 2>/dev/null || true)"
  PGBIN="$prefix/bin"
  [ -x "$PGBIN/pg_ctl" ] || PGBIN=/opt/homebrew/opt/postgresql@16/bin
  [ -x "$PGBIN/pg_ctl" ] || { echo "postgresql@16 not found (brew install postgresql@16)"; exit 1; }

  local tmp
  tmp="$(mktemp -d)"
  export PGDATA="$tmp/pgdata"
  local port="${PGPORT:-55432}"
  "$PGBIN/initdb" -D "$PGDATA" -U postgres --no-locale --encoding=UTF8 >/dev/null
  "$PGBIN/pg_ctl" -D "$PGDATA" \
    -o "-p $port -c listen_addresses=127.0.0.1 -c unix_socket_directories=''" \
    -w start >/dev/null
  export DATABASE_URL="postgresql://postgres@127.0.0.1:$port/postgres"
  # shellcheck disable=SC2064
  trap "'$PGBIN/pg_ctl' -D '$PGDATA' -m immediate stop >/dev/null 2>&1 || true; rm -rf '$tmp'" EXIT
}

[ -n "${DATABASE_URL:-}" ] || start_local

run() { psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q "$@"; }

echo "→ bootstrap (auth + roles + base tables)"
run -f "$TESTS_DIR/_bootstrap.sql"

echo "→ challenge-domain migrations"
while IFS= read -r m || [ -n "$m" ]; do
  m="${m%%#*}"                      # strip trailing comments
  m="$(echo "$m" | xargs)"          # trim whitespace
  [ -z "$m" ] && continue
  echo "  · $m"
  run -f "$MIGR_DIR/$m"
done < "$MIGRATIONS_LIST"

echo "→ assertion helpers"
run -f "$TESTS_DIR/_assert.sql"

echo "→ tests"
shopt -s nullglob
for t in "$TESTS_DIR"/[0-9]*.sql; do
  echo "  · $(basename "$t")"
  run -f "$t"
done

echo "✅ all SQL RPC tests passed"
