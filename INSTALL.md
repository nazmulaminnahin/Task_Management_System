# Setup from this archive

The archive contains source only (no `node_modules`). Two terminals, ~3 minutes.

## 0. Prerequisites
- Node.js 20+
- PostgreSQL 14+ running locally (or point `DATABASE_URL` at any Postgres)

## 1. Backend
```bash
cd backend
cp .env.example .env         # edit DATABASE_URL + JWT secrets if needed
npm install
npx prisma migrate deploy    # creates all tables
npm run prisma:seed          # demo users, projects, tasks, comments
npm run dev                  # http://localhost:4000
```

## 2. Frontend (new terminal)
```bash
cd frontend
npm install
npm run dev                  # http://localhost:5173
```

Open http://localhost:5173 — password for every demo account is `Password123!`:

| Role | Email |
|---|---|
| System Admin | admin@taskforge.dev |
| Team Manager | manager@taskforge.dev |
| Employee | employee@taskforge.dev |
| Individual | individual@taskforge.dev |

## Other ways to run
```bash
./start-demo.sh          # auto-boots a throwaway local Postgres, migrates, seeds, runs both apps
docker compose up --build  # full stack in Docker (web :5173, api :4000, db :5432)
```

## Checks
```bash
cd backend  && npm run typecheck && npm test
cd frontend && npm run typecheck && npm run build
```
