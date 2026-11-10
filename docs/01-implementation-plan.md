# TaskForge — Implementation Plan

**Scope:** a feature-complete, production-grade Task Management System with four-role RBAC, real-time collaboration, multi-view task engine, dashboards, notifications and audit logging.

**Stack (fixed by requirements):** React 18 + Vite + TypeScript + Tailwind + Radix-style primitives + Zustand + TanStack Query + Lucide + Recharts + dnd-kit · Node 20 + Express 4 + TypeScript · PostgreSQL 16 + Prisma 6 · Socket.io 4 · JWT + http-only rotating refresh tokens.

---

## 0. Guiding principles

| Principle | How it is applied |
|---|---|
| One authorization brain | `services/access.service.ts` is the *only* place project/task scope is decided. Every route funnels through `getProjectAccess` / `getTaskAccess`. |
| Deny by default | Route-level `authorize(...roles)` for coarse gates, service-level access levels (`VIEW < EDIT < MANAGE`) for fine gates. Non-members get `404`, never `403`, so project existence does not leak. |
| Optimistic UI with server truth | Drag & drop paints instantly; the server assigns fractional positions and the cache reconciles. |
| Event log, not just state | Every privileged mutation writes an append-only `ActivityLog` row before responding. |
| Fail closed | Production boot refuses weak JWT secrets; refresh-token reuse revokes the whole family (theft detection). |
| Typed end-to-end | Zod validates every request body/query/params; Prisma generates DTO types; the frontend re-declares them in `src/types`. |

---

## Phase 1 — Foundation (days 1–2)

1. **Monorepo layout** — `backend/`, `frontend/`, `docs/` (see `02-architecture.md`).
2. **Backend scaffold** — Express app, `helmet`, CORS allow-list, `cookie-parser`, JSON limit 1 MB, health endpoint, central error handler, Zod validation middleware, in-memory rate limiter.
3. **Database** — `schema.prisma` with every model, enum, index and cascade rule (§ `03-database-schema.md`), commit the initial migration, `prisma generate`.
4. **Auth core** — bcrypt(10), 15-minute access JWT, opaque refresh token stored **hashed** (SHA-256) in `RefreshToken`, cookie scoped `path=/api/auth`, `SameSite=Lax`, `HttpOnly`, rotation on every use, reuse ⇒ revoke family.
5. **Principals** — `authenticate` middleware attaches `{ id, role, email, name }`; `authorize('ADMIN', …)` gates routes.

**Exit criteria:** `POST /auth/login` → access token + refresh cookie; `GET /auth/me` works; `POST /auth/refresh` rotates; wrong password and reuse both 401.

## Phase 2 — Domain model & RBAC (days 3–5)

1. **Projects** — `Project`, `ProjectMember` (+ `projectRole` LEAD/MEMBER/VIEWER), default board with five columns created transactionally on project creation.
2. **Tasks** — `Task`, `TaskAssignee`, `Subtask`, `Tag`, `Attachment`, `TimeEntry`. Fractional `position: float` per column.
3. **Access service** — implements the matrix in `04-rbac-matrix.md`.
4. **Seed script** — eight users across four roles, three projects (2 team + 1 personal), ~24 tasks spread across every column with realistic due dates, subtasks, tags, threaded comments, notifications and audit rows.

**Exit criteria:** employee receives `404` for another user's personal project; viewer can read but not mutate; manager can manage the team project.

## Phase 3 — Task & project APIs (days 5–8)

1. CRUD for projects, members, tags.
2. Task CRUD + `PATCH /tasks/:id/move` (drag & drop hot path) with neighbour-based fractional positioning and re-normalisation when gaps collapse.
3. Threaded comments with `@[Name](uuid)` mention parsing, one level of replies, soft delete.
4. Attachments via `multer` (type allow-list, 10 MB, 5 files) with an authenticated download route.
5. Notifications + transactional email outbox.

**Exit criteria:** every endpoint in `05-api-spec.md` returns the documented shape; Postman/`curl` smoke suite passes.

## Phase 4 — Realtime (days 8–9)

1. Socket.io on the same HTTP server; handshake auth via `auth.token` (never the query string).
2. Private `user:{id}` rooms + `project:{id}` rooms joined at connect from membership.
3. Event catalogue: `task:created|updated|moved|deleted`, `comment:created|updated|deleted`, `notification:new`, `activity:new`, `presence:update`, `project:updated`, `attachment:created`.
4. Client: one socket per tab, reconnection with fresh token, TanStack Query cache patching per event so no refetch storm is needed.

## Phase 5 — Frontend shell & auth UX (days 9–11)

1. Vite + Tailwind design tokens (`brand`, `ink`, `surface`), shared `Button/Input/Modal/Badge/Avatar/ProgressBar/SegmentedControl` primitives.
2. In-memory access token + single-flight refresh; boot via refresh cookie; global 401 ⇒ clean logout.
3. App shell: collapsible sidebar with projects, ⌘K global search, live connection pill, notifications popover, role-aware admin nav.

## Phase 6 — Task engine UI (days 11–15)

1. **Kanban** (dnd-kit): `pointerWithin → rectIntersection → closestCorners` collision strategy, cross-column preview during `dragOver`, `DragOverlay` card, WIP-limit badges.
2. **List view**: group by status/priority/assignee, sortable columns, progress column.
3. **Calendar view**: month grid, overflow chips, overdue tinting.
4. **Task drawer**: inline title edit, Markdown description preview/edit, subtask checklist (PATCH replaces the set), assignee toggles, tag chips + inline tag creation, attachments upload, threaded comments with @-mention picker, per-task activity feed, time logged.

## Phase 7 — Dashboards & analytics (days 15–18)

1. `GET /analytics/admin` — KPIs, role distribution, status mix, 30-day signups, 14-day logins, top projects.
2. `GET /analytics/workload` — per-user open/overdue/in-progress load.
3. `GET /analytics/project/:id` — progress, 8-week velocity, status/priority mix, workload, overdue watchlist.
4. `GET /analytics/me` — due today, open, overdue, 30-day completions, streak, upcoming week, recent activity.
5. Recharts renders the admin, manager and personal dashboards.

## Phase 8 — Admin surfaces (days 18–20)

Users & roles table (inline role change — the only privilege-elevation path; self-demotion blocked; refresh tokens revoked on role change), soft-delete/deactivate, audit-log browser with action filter and pagination.

## Phase 9 — Notifications & deadline engine (days 20–21)

Hourly sweep: due-in-24h (`TASK_DUE_SOON`), overdue (`TASK_OVERDUE`), both de-duplicated per 24 h per user/task; drains `EmailOutbox` with retry counter (5 attempts). In-app notifications are pushed over `notification:new`.

## Phase 10 — Hardening & launch (days 21–25)

| Area | Work |
|---|---|
| Security | Helmet CSP, strict CORS, upload MIME allow-list, Markdown rendered without raw HTML (XSS boundary), bcrypt cost 12 in prod, secrets injected from a vault, rate-limit login/register |
| Performance | Composite indexes (project+status, column+position, dueDate), `select`-only projections, paginated list endpoints, TanStack Query caching, route-level code splitting |
| Observability | Structured request logs (pino in prod), `/api/health`, error tracking (Sentry), Prisma slow-query log |
| Reliability | Graceful shutdown (SIGTERM → drain → `prisma.$disconnect`), outbox retries, DB backups + PITR |
| Testing | Unit: fractional ranking, mention parser, RBAC matrix. Integration: auth rotation/reuse, project isolation, move endpoint. E2E: Playwright happy paths per role |
| Ops | Dockerfiles for API and web, docker-compose with Postgres + Redis, CI (typecheck → test → build → migrate deploy), staging smoke run |

## Milestone checklist

- [x] Four roles enforced server-side and reflected in the UI
- [x] Kanban / list / calendar over a single task store
- [x] Drag & drop persistence with stable ordering under concurrency
- [x] Threaded comments, mentions, notifications, email outbox
- [x] Admin analytics, manager velocity/workload, personal schedule
- [x] Audit log for every privileged mutation
- [x] Access-token-in-memory + rotating refresh cookie
- [x] Seeded demo covering every role
- [ ] Vendor integrations (SMTP transport, S3 driver, Redis limiter, BullMQ) — stubs marked in code
