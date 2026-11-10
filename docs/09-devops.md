# DevOps, Configuration & Operations

## 1. Environment variables (`backend/.env`)

| Variable | Default | Notes |
|---|---|---|
| `NODE_ENV` | `development` | `production` enables secret guards + strict errors |
| `PORT` | `4000` | API + Socket.io share the HTTP server |
| `CLIENT_ORIGIN` | `http://localhost:5173` | CORS allow-list, comma-separated |
| `PUBLIC_API_URL` | `http://localhost:4000` | used in emails/deep links |
| `DATABASE_URL` | — | `postgresql://user:pass@host:5432/taskforge?schema=public` |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | dev defaults | **boot fails in production if these still contain `change-me`** (`openssl rand -hex 32`) |
| `ACCESS_TOKEN_TTL` | `15m` | access tokens |
| `REFRESH_TOKEN_TTL_DAYS` | `7` | refresh cookie lifetime |
| `BCRYPT_ROUNDS` | `10` | use `12` in production |
| `COOKIE_SECURE` | auto (`true` in prod) | requires HTTPS |
| `UPLOAD_DIR` | `./uploads` | local disk driver |
| `MAX_UPLOAD_MB` | `10` | per-file limit (max 5 files/request) |
| `SMTP_HOST` … `MAIL_FROM` | empty | empty ⇒ console email driver |

Frontend needs nothing: it talks to `/api` and `/socket.io` on its own origin (Vite proxy in dev, nginx in Docker).

## 2. Local development

```bash
./start-demo.sh          # Postgres (throwaway cluster) + migrate + seed + API + web
```

or manually: `backend: npm run dev` · `frontend: npm run dev`.

## 3. Tests

```bash
cd backend && npm test        # vitest — ordering math, progress rules, schemas, mention parser
cd backend && npm run typecheck
cd frontend && npm run typecheck && npm run build
```

The QA log (including the two-browser Socket.io verification and bugs found) is in [`00-review-and-qa.md`](00-review-and-qa.md).

## 4. Docker

```bash
docker compose up --build
# web → http://localhost:5173   api → http://localhost:4000
```

- **api image** — multi-stage Node 20: `prisma generate` → `tsc` → runtime image with prod deps only; runs `prisma migrate deploy` on start; runs as `node` user.
- **web image** — Vite build served by nginx; `/api` and `/socket.io` are proxied to the `api` service (WebSocket upgrade handled).
- **db** — Postgres 16 with a healthcheck gate; volume `pgdata`.

## 5. CI (`.github/workflows/ci.yml`)

| Job | Steps |
|---|---|
| backend | Postgres service → `npm ci` → `prisma migrate deploy` + `generate` → typecheck → **`npm test`** → seed → build |
| frontend | `npm ci` → typecheck → `vite build` |

## 6. Production topology

```
Route53/CloudFront ──► CDN (static SPA)
        │
        └─► ALB ──► api container #1..#N ──► RDS Postgres (Multi-AZ, PITR)
                     │  (sticky sessions or @socket.io/redis-adapter)
                     ├─► Redis        (socket adapter, rate limiting, BullMQ)
                     ├─► S3           (attachments via signed URLs)
                     └─► SES/Postmark (email outbox transport)
```

Hardening checklist before go-live:

- [ ] Secrets from a manager/vault, rotate JWT secrets on a schedule (both secrets support key rotation via dual verification when needed).
- [ ] `COOKIE_SECURE=true`, HTTPS only, HSTS at the edge.
- [ ] `BCRYPT_ROUNDS=12`, login rate limit backed by Redis.
- [ ] Point `UPLOAD_DIR` at S3 driver (`storageKey` becomes the object key).
- [ ] Run the deadline sweep as a **single** BullMQ repeatable job (not per pod).
- [ ] Enable `pg_stat_statements`, alarm on p95 > 300 ms; alert on 5xx and on `EmailOutbox` rows older than 1 h.
- [ ] Nightly logical backup + PITR retention 30 days; quarterly restore drill.
- [ ] Add Sentry/OpenTelemetry to the API and web.

## 7. Runbook

| Symptom | Check |
|---|---|
| 500s after deploy | `prisma migrate status`; failed migration leaves the schema locked |
| Users logged out unexpectedly | refresh cookie path/domain changed, or `COOKIE_SECURE` mismatch on HTTP |
| Realtime dead but REST fine | proxy stripping the WebSocket upgrade (`/socket.io`), or clock skew between pods invalidating tokens |
| Emails not arriving | `SELECT status, attempts, lastError FROM "EmailOutbox"` — inspect failed rows first |
| Board order jitter | concurrent moves collapsing float gaps; `renormalizeColumn` runs automatically below 0.001 |
| Slow dashboards | `/analytics/*` are read-only — point them at a read replica |

## 8. Backup / restore

```bash
pg_dump "$DATABASE_URL" -Fc -f taskforge-$(date +%F).dump
pg_restore --clean --if-exists -d "$DATABASE_URL" taskforge-$(date +%F).dump
```
