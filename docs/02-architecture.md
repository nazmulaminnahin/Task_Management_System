# Architecture Overview

## 1. System context

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                                Browser (SPA)                                 │
│  React 18 · Vite · TypeScript · Tailwind · Zustand · TanStack Query          │
│  dnd-kit Kanban · Recharts dashboards · socket.io-client                     │
└───────────────┬───────────────────────────────────────────┬──────────────────┘
                │ HTTPS  /api/*  (REST, JSON)               │ WSS  /socket.io
                │ Authorization: Bearer <15m access token>  │ auth.token in handshake
                ▼                                           ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                        Single Node process (or N behind LB)                  │
│  ┌────────────────────────┐        ┌───────────────────────────────────────┐ │
│  │ Express 4 (TypeScript) │        │ Socket.io 4                           │ │
│  │ helmet · cors · zod    │        │ handshake JWT verify · rooms:         │ │
│  │ authenticate           │◄──────►│   user:{id} · project:{id} · role:ADMIN│ │
│  │ authorize(RBAC)        │        └───────────────────────────────────────┘ │
│  │ routes → services      │                     ▲                            │
│  └──────────┬─────────────┘                     │ emitToProject/emitToUser   │
│             │ Prisma Client                     │                            │
│  ┌──────────▼─────────────┐   ┌─────────────────┴────────────────────────┐  │
│  │ access.service (RBAC)  │   │ reminderWorker (hourly interval)          │  │
│  │ task.service (ranking) │   │ deadline sweep + EmailOutbox drain        │  │
│  │ mail.service (outbox)  │   └──────────────────────────────────────────┘  │
│  └──────────┬─────────────┘                                                  │
└─────────────┼────────────────────────────────────────────────────────────────┘
              │ TCP 5432
       ┌──────▼──────┐        ┌───────────────┐        ┌──────────────────┐
       │ PostgreSQL  │        │ Object store  │        │ SMTP provider    │
       │ (Prisma)    │        │ local → S3    │        │ console → SMTP   │
       └─────────────┘        └───────────────┘        └──────────────────┘
```

**Deployment topology**

| Environment | API | Web | DB | Notes |
|---|---|---|---|---|
| Local | `tsx watch` :4000 | Vite :5173 (proxies `/api`, `/socket.io`) | local cluster | `./start-demo.sh` |
| Staging/Prod | 2+ containers behind an ALB | static build on CDN | managed Postgres + PITR | Socket.io needs sticky sessions **or** the Redis adapter |

## 2. Request lifecycle (write path)

```
POST /api/tasks/:id/move
  1 helmet/cors/cookieParser/express.json
  2 authenticate        → verify access JWT → req.user
  3 rateLimit?          (login/register only)
  4 validate(zod)       → coordinate/body/query coercion
  5 asyncHandler        → route handler
  6 getTaskAccess(...)  → project lookup + RBAC level check  → 404/403
  7 service mutation    → prisma $transaction
  8 activity log write  → append-only audit row
  9 notification fan-out→ in-app rows + email outbox rows
 10 emitToProject(...)  → Socket.io room broadcast
 11 res.json(...)       → 200
      ↳ any throw → errorHandler → { error: { code, message, details } }
```

**Why the write order matters:** the audit row and the notification rows are written before the HTTP response so a client that receives `200` can assume the side effects exist. The socket broadcast happens last, after commit, so subscribers never see events for rolled-back transactions.

## 3. Realtime model

| Concern | Decision |
|---|---|
| Auth | Access token in `socket.handshake.auth.token`; verified on connect **and** re-verified on reconnect through the `auth` callback. Never a query-string token (proxy logs). |
| Rooms | `user:{id}` for personal feeds, `project:{id}` for board traffic, `role:ADMIN` for admin fan-out. Joined at connect from live membership. |
| Authorisation | `project:subscribe` re-checks membership server-side; a socket cannot join a room it has no access to. |
| Delivery | Broadcasting is **advisory**. Clients patch TanStack Query caches from the payload and fall back to a refetch on reconnect (`connected` pill + invalidation). |
| Scaling | With >1 API node, add `@socket.io/redis-adapter` so rooms span processes; the emit helpers in `realtime/io.ts` are the single choke point to change. |

## 4. Authentication & session design

```
login ──► access JWT (15m, in memory)  +  refresh token (opaque, 7d, HttpOnly cookie, SHA-256 at rest)
refresh ─► verify hash → revoked? → reuse detection: revoke ALL user tokens, clear cookie, 401
        └► else rotate: revoke presented token, issue a new pair
logout ──► revoke presented refresh token, clear cookie
role change / deactivate / password change ──► revoke every refresh token for that user
```

Access tokens are deliberately **stateless** (no DB hit per request). The staleness window is ≤15 minutes, and every destructive endpoint re-reads the DB where it matters (role changes, membership, `isActive` on socket connect).

XSS hardening: no `localStorage`, tokens never rendered into HTML, `react-markdown` without `rehype-raw`, strict CSP.

## 5. Backend folder structure

```
backend/
├─ prisma/
│  ├─ schema.prisma               # single source of truth for the data model
│  ├─ migrations/<ts>_init/       # committed SQL
│  └─ seed.ts                     # demo data for all four roles
├─ src/
│  ├─ server.ts                   # HTTP server + socket init + worker + graceful shutdown
│  ├─ app.ts                      # express app wiring (middleware → routes → errors)
│  ├─ config.ts                   # typed env with production guards
│  ├─ lib/
│  │  ├─ prisma.ts                # singleton client (dev hot-reload safe)
│  │  ├─ tokens.ts                # JWT sign/verify + opaque refresh generation
│  │  ├─ password.ts              # bcrypt helpers
│  │  ├─ errors.ts                # HttpError + typed factories
│  │  └─ http.ts                  # asyncHandler
│  ├─ middleware/
│  │  ├─ auth.ts                  # authenticate + authorize(...roles)
│  │  ├─ validate.ts              # zod body/query/params parsing
│  │  ├─ rateLimit.ts             # in-memory fixed window (swap for Redis)
│  │  └─ errorHandler.ts          # Prisma/Zod/Http error mapping
│  ├─ routes/
│  │  ├─ auth.routes.ts           # register/login/refresh/logout/me/sessions
│  │  ├─ users.routes.ts          # directory, admin CRUD, role assignment, password
│  │  ├─ projects.routes.ts       # CRUD, members, tags, archive
│  │  ├─ tasks.routes.ts          # CRUD, move, activity, time entries
│  │  ├─ comments.routes.ts       # threaded comments + mentions
│  │  ├─ notifications.routes.ts  # feed + mark read
│  │  ├─ analytics.routes.ts      # admin / workload / project / me
│  │  ├─ audit.routes.ts          # audit log browser
│  │  └─ uploads.routes.ts        # multipart upload + authorised download
│  ├─ services/
│  │  ├─ access.service.ts        # ★ RBAC matrix
│  │  ├─ task.service.ts          # fractional ranking, progress, include graph
│  │  ├─ auth.service.ts          # token issue/rotate/revoke, cookie policy
│  │  ├─ mail.service.ts          # notification creation + email outbox
│  │  └─ activity.service.ts      # audit writes + project feed emission
│  ├─ realtime/io.ts              # socket auth, rooms, emit helpers
│  ├─ jobs/reminderWorker.ts      # hourly deadline sweep + outbox drain
│  └─ types/express.d.ts          # Request.user augmentation
```

**Layering rule:** routes orchestrate (validate → authorise → call services → respond → emit). Services own persistence and invariants. Nothing in `services/` imports from `routes/`.

## 6. Frontend folder structure

```
frontend/
├─ index.html · vite.config.ts · tailwind.config.js · tsconfig.json
└─ src/
   ├─ main.tsx                # QueryClient + Router providers
   ├─ App.tsx                 # route table, lazy pages, protected shell, drawer host
   ├─ index.css               # Tailwind base + design-system component classes
   ├─ lib/
   │  ├─ api.ts               # fetch client, in-memory token, single-flight refresh
   │  └─ utils.ts             # cn(), date labels, priority/status metadata
   ├─ types/index.ts          # DTO contracts mirrored from Prisma
   ├─ store/
   │  ├─ auth.store.ts        # Zustand: bootstrap/login/logout/setUser
   │  └─ ui.store.ts          # Zustand+persist: sidebar, view mode, open task, notifications
   ├─ hooks/
   │  ├─ useSocket.ts         # shared connection, useSocketEvent, status
   │  ├─ useProjects.ts       # workspace, create, members, users
   │  ├─ useTasks.ts          # lists, detail, create/update/move/delete, comments, my work
   │  ├─ useAnalytics.ts      # admin/project/me/workload queries
   │  └─ useNotifications.ts  # feed + mark read
   ├─ components/
   │  ├─ ui/primitives.tsx    # Button, Input, Select, Modal, Badge, Avatar, ProgressBar, …
   │  ├─ layout/              # AppShell, PageHeader, StatCard, notifications, search, new project
   │  ├─ board/               # KanbanBoard, TaskCard, TaskListView, CalendarView
   │  └─ task/                # TaskDetailDrawer, CommentThread, Markdown
   └─ pages/                  # Login, Dashboard (admin/manager/personal), Projects,
                              # Project, MyWork, Calendar, Notifications, Settings, admin/*
```

## 7. Component & state strategy

**Server state → TanStack Query.** Query keys are hierarchical so invalidation is cheap:

| Key | Invalidated by |
|---|---|
| `['projects', scope]` | create project, member changes |
| `['project', id]` | task create/move, member add, tag create |
| `['tasks', projectId, filters]` | task create/move/update/delete, socket events |
| `['task', id]` | drawer updates, comments, socket `task:updated` |
| `['notifications']` | `notification:new`, mark-read |
| `['analytics', *]`, `['my-work']`, `['audit']`, `['admin-users']` | respective mutations |

**Client state → Zustand.**

- `auth.store` holds the principal and a status machine (`idle → loading → authenticated | anonymous`).
- `ui.store` holds sidebar collapse, the persisted board view mode, the globally-mounted task drawer id, and the notifications popover state.
- The task drawer is mounted once at the app root, so **any** page can open a task and deep links (`?task=<id>`) work.

**Realtime → cache patches, not refetches.**
`task:moved` rewrites `status/columnId/position` in every `['tasks', projectId, *]` cache entry; `task:created` appends; `task:updated` merges; `task:deleted` filters. The drawer listens on `comment:created` to refetch its own thread. A socket-driven React re-render never touches the store for board order — dnd-kit's local state owns the drag preview, the server owns the truth.

## 8. Task ordering (the interesting algorithm)

Dragging assigns `position` as a **float between neighbours**:

```ts
position = before == null && after == null ? 1000
         : before == null ? after - 1000
         : after == null ? before + 1000
         : before + (after - before) / 2;
```

- One UPDATE per drag instead of re-numbering a column.
- When `after - before < 0.001` (≈ 50 halvings), the column is re-normalised to `1000, 2000, …` in a transaction, then the move is applied.
- Concurrent drags converge because each client sends the neighbour ids it saw; the server recomputes from current rows inside the transaction.
- Sorting ties fall back to `updatedAt` so the UI never flickers.

## 9. Error contract

```json
{ "error": { "code": "FORBIDDEN", "message": "This action requires edit access to the project",
             "details": [{ "path": "dueDate", "message": "Invalid date" }] } }
```

| Status | When |
|---|---|
| 400 | Zod validation, domain rule (e.g. "only project members can be assigned") |
| 401 | missing/expired/invalid token, bad credentials, refresh reuse |
| 403 | authenticated but role/access level insufficient |
| 404 | unknown id **or** a resource the caller may not see (personal workspaces) |
| 409 | unique constraint (email, project key) |
| 429 | rate limit |
| 500 | unexpected (details only outside production) |
