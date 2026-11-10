#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# TaskForge — one-command demo boot.
# Prerequisites: Node 20+, a PostgreSQL 14+ server reachable via DATABASE_URL.
# Usage:  ./start-demo.sh
# ---------------------------------------------------------------------------
set -euo pipefail
cd "$(dirname "$0")"

BOOTSTRAP_DB=${BOOTSTRAP_DB:-1}

if [ "$BOOTSTRAP_DB" = "1" ]; then
  # Starts a throwaway local Postgres cluster (no sudo, no system service).
  PG_BIN=${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}
  if [ -n "${PG_BIN}" ] && command -v initdb >/dev/null 2>&1 || [ -x "${PG_BIN}/initdb" ]; then
    export PATH="${PG_BIN}:$PATH"
    if ! pg_isready -h 127.0.0.1 -p 5432 >/dev/null 2>&1; then
      echo "▶ Starting local PostgreSQL cluster in /tmp/pgdata"
      [ -d /tmp/pgdata ] || initdb -D /tmp/pgdata -U postgres --auth=trust >/dev/null
      mkdir -p /tmp/pgrun
      pg_ctl -D /tmp/pgdata -o "-p 5432 -k /tmp/pgrun -c listen_addresses=127.0.0.1" -l /tmp/pg.log start >/dev/null
      sleep 2
    fi
    psql -h 127.0.0.1 -U postgres -tc "SELECT 1 FROM pg_database WHERE datname='taskforge'" | grep -q 1 \
      || psql -h 127.0.0.1 -U postgres -c "CREATE DATABASE taskforge;" >/dev/null
  fi
fi

[ -f backend/.env ] || cp backend/.env.example backend/.env
[ -d backend/node_modules ] || (cd backend && npm install)
[ -d frontend/node_modules ] || (cd frontend && npm install)

echo "▶ Migrating & seeding database"
(cd backend && npx prisma migrate deploy >/dev/null && npx prisma generate >/dev/null && npm run prisma:seed >/dev/null)

cleanup() { kill 0 2>/dev/null || true; }
trap cleanup EXIT INT TERM

echo "▶ API    → http://localhost:4000"
(cd backend && npm run dev) &
echo "▶ Web    → http://localhost:5173"
(cd frontend && npm run dev) &
wait
