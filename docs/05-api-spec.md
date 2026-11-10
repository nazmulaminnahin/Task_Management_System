# REST API Specification

Base URL: `http://localhost:4000/api` · All bodies JSON (except multipart upload) · All responses JSON.

**Conventions**

- Auth: `Authorization: Bearer <accessToken>` on every endpoint except register/login/refresh.
- The refresh token is an **HttpOnly cookie** (`tf_refresh`, `path=/api/auth`), never in a response body.
- Dates are ISO-8601 UTC strings. Ids are UUIDs.
- Errors: `{ "error": { "code": "FORBIDDEN", "message": "…", "details": [...] } }`.
- **G** = required role · `projectRole` constraints are enforced by `access.service` (see `04-rbac-matrix.md`).

---

## 1. Auth — `/auth`

### `POST /auth/register` · public · rate-limited (30 / 15 min / IP)

```json
{ "email": "ana@acme.com", "password": "min 8 chars", "name": "Ana Silva",
  "role": "EMPLOYEE" }
```
`role` may only be `EMPLOYEE` (default) or `INDIVIDUAL`; elevated roles are granted by an admin.

**201**
```json
{ "user": { "id": "uuid", "email": "ana@acme.com", "name": "Ana Silva",
            "role": "EMPLOYEE", "avatarUrl": null, "isActive": true,
            "emailNotifications": true, "createdAt": "2026-11-09T04:00:00.000Z" } }
```
Errors: `409 EMAIL_TAKEN`.

### `POST /auth/login` · public · rate-limited

```json
{ "email": "admin@taskforge.dev", "password": "Password123!" }
```
**200** · sets `Set-Cookie: tf_refresh=…; HttpOnly; SameSite=Lax; Path=/api/auth; Max-Age=604800`
```json
{ "accessToken": "eyJ…", "user": { "id": "uuid", "role": "ADMIN", … } }
```
Errors: `401` invalid credentials **or** deactivated account (identical shape).

### `POST /auth/refresh` · cookie only

Rotates the refresh token (old token revoked, new cookie set).

**200** `{ "accessToken": "eyJ…", "user": { … } }`
**401** `Refresh token has been revoked — please sign in again` when a revoked token is replayed (**reuse detection revokes every session for that user**).

### `POST /auth/logout` · revokes presented refresh token, clears cookie → **204**

### `GET /auth/me` · auth
**200** `{ "user": { … } }`

### `GET /auth/sessions` · auth
**200** `{ "sessions": [ { "id": "uuid", "userAgent": "…", "ip": "…", "createdAt": "…", "expiresAt": "…" } ] }`

---

## 2. Users — `/users`

### `GET /users?q=&role=&isActive=&page=1&pageSize=20` · auth
Everyone can call it; response is role-scoped.

| Caller | Sees |
|---|---|
| ADMIN / MANAGER | all users, all filters |
| EMPLOYEE / INDIVIDUAL | active users only (needed for mentions/member pickers) |

**200** `{ "items": [UserDto], "total": 8, "page": 1, "pageSize": 20 }`

### `GET /users/:id` · auth
Self or MANAGER/ADMIN ⇒ full record (+ `_count.assignments`, `_count.ownedProjects`); other callers get a record with `email` omitted.

### `PATCH /users/me` · auth
```json
{ "name": "Ana Silva", "avatarUrl": "https://…", "emailNotifications": false }
```
**200** `{ "user": { … } }`

### `POST /users/me/password` · auth
```json
{ "currentPassword": "old", "newPassword": "new-min-8" }
```
**204** — revokes all other refresh tokens for the user.

### `POST /users` · **ADMIN**
```json
{ "email": "…", "name": "…", "password": "…", "role": "ADMIN|MANAGER|EMPLOYEE|INDIVIDUAL" }
```
**201** `{ "user": { … } }` — writes `USER_CREATED` audit.

### `PATCH /users/:id` · **ADMIN**
```json
{ "name": "…", "email": "…", "isActive": false, "avatarUrl": null }
```
**200** `{ "user": { … } }` — deactivation also revokes refresh tokens.

### `PATCH /users/:id/role` · **ADMIN**
```json
{ "role": "MANAGER" }
```
**200** `{ "user": { … } }` — the **only** privilege-elevation endpoint.
`400` self-demotion · writes `ROLE_CHANGED` audit · revokes the target's sessions.

### `DELETE /users/:id` · **ADMIN**
Soft delete (`isActive = false`) → **200** `{ "user": { … } }`. Self-deactivation is `400`.

`UserDto` = `{ id, email, name, role, avatarUrl, isActive, emailNotifications, createdAt, lastSeenAt }`

---

## 3. Projects — `/projects`

### `GET /projects?scope=mine|all|personal&status=&q=`

| Caller | Default scope | Result |
|---|---|---|
| ADMIN | `all` allowed | everything, or `?scope=mine` |
| MANAGER / EMPLOYEE | `mine` | projects owned or joined |
| INDIVIDUAL | forced personal | own private workspace(s) |

**200**
```json
{ "items": [ { "id": "uuid", "key": "APOLLO", "name": "Apollo — Mobile App v2",
  "type": "TEAM", "status": "ACTIVE", "visibility": "TEAM", "color": "#6366f1",
  "ownerId": "uuid", "startDate": "…", "dueDate": "…", "owner": { "id": "uuid", "name": "Daniel Okafor", "avatarUrl": null },
  "_count": { "tasks": 12, "members": 4 } } ] }
```

### `POST /projects` · ADMIN, MANAGER (TEAM) / anyone (PERSONAL)
```json
{ "name": "Orion — Billing revamp", "key": "ORION", "description": "…",
  "type": "TEAM", "color": "#0ea5e9", "startDate": "2026-11-01",
  "dueDate": "2027-01-31", "memberIds": ["uuid", "uuid"] }
```
Creates the project **and** a default board (`Backlog | To do | In progress | In review | Done`) in one flow; owner becomes `LEAD`.
**201** `{ "project": { … } }` · `409 KEY_TAKEN` · notifies invited members (`PROJECT_MEMBER_ADDED`).

### `GET /projects/:id` · project member (VIEW+)
```json
{ "project": { "id": "uuid", "key": "APOLLO", "name": "…", "type": "TEAM", "status": "ACTIVE",
               "visibility": "TEAM", "color": "#6366f1", "ownerId": "uuid",
               "startDate": "…", "dueDate": "…", "archivedAt": null },
  "accessLevel": "MANAGE",
  "members": [ { "id": "uuid", "name": "Marco Rossi", "email": "…", "avatarUrl": null,
                 "role": "EMPLOYEE", "projectRole": "MEMBER", "joinedAt": "…" } ],
  "boards": [ { "id": "uuid", "name": "Main board",
                "columns": [ { "id": "uuid", "name": "To do", "status": "TODO",
                               "position": 1, "wipLimit": 12 } ] } ],
  "tags": [ { "id": "uuid", "name": "mobile", "color": "#6366f1" } ],
  "taskCounts": { "TODO": 4, "IN_PROGRESS": 2, "DONE": 2 } }
```
`404` for non-members (existence is not leaked).

### `PATCH /projects/:id` · MANAGE
```json
{ "name": "…", "description": "…", "status": "ON_HOLD", "visibility": "PRIVATE",
  "color": "#10b981", "startDate": null, "dueDate": "2027-02-01" }
```
**200** `{ "project": { … } }` · emits `project:updated`.

### `POST /projects/:id/members` · MANAGE
```json
{ "userIds": ["uuid"], "projectRole": "LEAD|MEMBER|VIEWER" }
```
**200** `{ "members": [ { …, "projectRole": "MEMBER" } ] }` — notifies each added user.

### `DELETE /projects/:id/members/:userId` · MANAGE
**204** · owner cannot be removed (`400`).

### `DELETE /projects/:id` · MANAGE
Archives (`status=ARCHIVED`, `archivedAt`) → **204**. `?hard=true` + ADMIN performs a cascade delete.

### `POST /projects/:id/tags` · EDIT
```json
{ "name": "infra", "color": "#0ea5e9" }
```
**201** `{ "tag": { … } }` · `409` on duplicate `(projectId, name)`.

---

## 4. Tasks — `/tasks`

### `GET /tasks` · auth

| Mode | Query | Returns |
|---|---|---|
| Project board | `?projectId=uuid&boardId=&assigneeId=&status=&priority=&q=&dueBefore=&dueAfter=&includeCompleted=` | tasks ordered by `position`, with `progress` |
| My work (cross-project) | `?assigneeId=me` / no `projectId` | tasks in projects the caller can see, ordered by `dueDate, priority` |

**200**
```json
{ "items": [ {
  "id": "uuid", "projectId": "uuid", "boardId": "uuid", "columnId": "uuid",
  "title": "Offline sync conflict resolution", "description": "Implement last-write-wins…",
  "status": "IN_PROGRESS", "priority": "URGENT", "position": 3000,
  "startDate": null, "dueDate": "2026-11-11T00:00:00.000Z", "completedAt": null,
  "estimateMins": null, "createdById": "uuid", "createdAt": "…", "updatedAt": "…",
  "progress": 33,
  "assignees": [ { "userId": "uuid", "user": { "id": "uuid", "name": "Sofia Chen", "email": "…", "avatarUrl": null } } ],
  "subtasks": [ { "id": "uuid", "title": "Spike: CRDT vs LWW", "isDone": true, "position": 0 } ],
  "tags": [ { "id": "uuid", "name": "mobile", "color": "#6366f1" } ],
  "_count": { "comments": 3, "attachments": 0 },
  "project": { "id": "uuid", "name": "Apollo — Mobile App v2", "key": "APOLLO", "color": "#6366f1" }
} ], "total": 12 }
```

### `GET /tasks/:id` · project member (VIEW+)
Adds `createdBy`, `comments` (threaded roots with `replies`), `attachments`, `timeEntries`, and `progress`.

### `POST /tasks` · EDIT
```json
{ "projectId": "uuid", "title": "QA regression suite for checkout",
  "description": "Markdown…", "status": "TODO", "priority": "HIGH",
  "columnId": "uuid", "boardId": "uuid", "startDate": null, "dueDate": "2026-11-18",
  "estimateMins": 240, "assigneeIds": ["uuid"], "tagIds": ["uuid"],
  "subtasks": ["Reproduce", "Fix", "Regression test"] }
```
If `columnId` is omitted it is resolved from the board column whose `status` matches. Assignees must be project members (`400` otherwise). Assignees receive `TASK_ASSIGNED` (in-app + email). Emits `task:created`.
**201** `{ "task": { … , "progress": 0 }, "accessLevel": "EDIT" }`

### `PATCH /tasks/:id` · EDIT
```json
{ "title": "…", "description": "…", "priority": "URGENT",
  "startDate": "2026-11-10", "dueDate": null, "estimateMins": 120,
  "assigneeIds": ["uuid"], "tagIds": ["uuid"],
  "subtasks": [ { "id": "uuid", "title": "Fix", "isDone": true },
                { "title": "New step", "isDone": false } ] }
```
`subtasks` **replaces** the set (existing ids updated, missing ones deleted, new ones created). Newly added assignees are notified. Emits `task:updated`.

### `PATCH /tasks/:id/move` · EDIT — *drag & drop hot path*
```json
{ "status": "IN_PROGRESS", "columnId": "uuid",
  "beforeId": "uuid-of-card-above", "afterId": "uuid-of-card-below" }
```
Server computes `position = midpoint(before, after)` (or ±1000 at the edges) and re-normalises the column if the gap `< 0.001`. Sets/clears `completedAt` when crossing into `DONE`. Writes `TASK_MOVED`; emits `task:moved`:
```json
{ "id": "uuid", "projectId": "uuid", "status": "IN_PROGRESS", "columnId": "uuid",
  "position": 2500, "updatedAt": "…", "progress": 40, "actorId": "uuid", "from": "TODO" }
```
**200** `{ "task": { … } }` · previous assignees get `TASK_STATUS_CHANGED` when the status differs.

### `GET /tasks/:id/activity` · VIEW
**200** `{ "items": [ { "id": "uuid", "action": "TASK_MOVED", "entityType": "TASK",
"metadata": { "to": "IN_PROGRESS" }, "createdAt": "…",
"actor": { "id": "uuid", "name": "Marco Rossi", "avatarUrl": null } } ] }`

### `POST /tasks/:id/time` · EDIT
```json
{ "minutes": 45, "note": "Investigated CRDT perf", "startedAt": "2026-11-09T03:00:00Z" }
```
**201** `{ "entry": { … }, "projectId": "uuid" }`

### `DELETE /tasks/:id` · creator, MANAGE, or ADMIN
**204** · emits `task:deleted` · writes `TASK_DELETED`.

---

## 5. Comments — `/tasks/:taskId/comments`, `/comments/:id`

Mention syntax inside `body`: `@[Jane Doe](<user-uuid>)` — parsed, validated against project membership, and stored in `CommentMention`.

### `GET /tasks/:taskId/comments` · VIEW
**200**
```json
{ "items": [ {
  "id": "uuid", "taskId": "uuid", "parentId": null,
  "body": "Let's keep LWW… @[Marco Rossi](uuid) can you confirm?",
  "createdAt": "…", "editedAt": null, "deletedAt": null,
  "author": { "id": "uuid", "name": "Daniel Okafor", "avatarUrl": null, "role": "MANAGER" },
  "mentions": [ { "userId": "uuid" } ],
  "replies": [ { "id": "uuid", "body": "Confirmed —…", "author": { … } } ],
  "attachments": []
} ] }
```

### `POST /tasks/:taskId/comments` · EDIT
```json
{ "body": "Ready for review @[Sofia Chen](uuid)", "parentId": null }
```
**201** `{ "comment": { … } }` — mentions ⇒ `COMMENT_MENTION`; other assignees ⇒ `COMMENT_ADDED`. Emits `comment:created`.
`400` if `parentId` belongs to a reply (one-level threading).

### `PATCH /comments/:id` · author or ADMIN
```json
{ "body": "edited text" }
```
**200** `{ "comment": { … } }` — sets `editedAt`, re-emits `comment:updated`.

### `DELETE /comments/:id` · author or ADMIN
**204** — soft delete (`deletedAt`, body → `[deleted]`), emits `comment:deleted`. Threads stay readable.

---

## 6. Notifications — `/notifications`

### `GET /notifications?unread=true&page=1&pageSize=20` · auth
**200**
```json
{ "items": [ { "id": "uuid", "type": "COMMENT_MENTION", "title": "You were mentioned",
  "body": "Daniel Okafor mentioned you on \"Offline sync conflict resolution\".",
  "entityType": "TASK", "entityId": "uuid", "isRead": false, "createdAt": "…" } ],
  "total": 4, "unreadCount": 3 }
```

### `PATCH /notifications/read` · auth
```json
{ "ids": ["uuid"] }   // or { "all": true }
```
**204**

---

## 7. Analytics — `/analytics`

### `GET /analytics/admin` · **ADMIN**
```json
{ "kpis": { "totalUsers": 8, "activeUsers": 8, "totalProjects": 3, "totalTasks": 25, "completionRate": 20 },
  "roleDistribution": [ { "role": "MANAGER", "count": 2 } ],
  "tasksByStatus":    [ { "status": "IN_PROGRESS", "count": 4 } ],
  "signups": [ { "date": "2026-10-11", "count": 0 } ],
  "logins":  [ { "date": "2026-10-27", "count": 3 } ],
  "topProjects": [ { "id": "uuid", "name": "Apollo — Mobile App v2", "color": "#6366f1",
                     "_count": { "tasks": 12, "members": 4 } } ] }
```

### `GET /analytics/workload` · **ADMIN | MANAGER**
```json
{ "items": [ { "userId": "uuid", "name": "Sofia Chen", "avatarUrl": null,
               "openTasks": 6, "overdue": 1, "inProgress": 2 } ] }
```

### `GET /analytics/project/:id` · project member (VIEW+)
```json
{ "kpis": { "total": 12, "done": 2, "open": 10, "overdue": 1, "progress": 17, "velocity": 1 },
  "statusMix":   [ { "status": "TODO", "count": 4 } ],
  "priorityMix": [ { "priority": "URGENT", "count": 3 } ],
  "velocity":    [ { "week": "W-7", "completed": 0 } ],   // 8 buckets, last = current week
  "workload":    [ { "userId": "uuid", "name": "Marco Rossi", "open": 3, "done": 1 } ],
  "overdueTasks":[ { "id": "uuid", "title": "Fix crash on Android 14", "dueDate": "…",
                     "priority": "URGENT", "assignees": [ { "user": { "id": "uuid", "name": "Sofia Chen" } } ] } ] }
```

### `GET /analytics/me` · auth
```json
{ "kpis": { "open": 4, "dueToday": 0, "overdue": 0, "completed30d": 1, "streak": 0 },
  "todayTasks": [ { "id": "uuid", "title": "…", "status": "TODO", "priority": "HIGH",
                    "dueDate": "…", "project": { "id": "uuid", "name": "…", "key": "APOLLO", "color": "#6366f1" } } ],
  "upcoming": [ { "id": "uuid", "title": "…", "dueDate": "…", "priority": "HIGH" } ],
  "completionSeries": [ { "date": "2026-10-11", "count": 0 } ],
  "recentActivity": [ { "id": "uuid", "action": "TASK_MOVED", "entityType": "TASK",
                        "entityId": "uuid", "metadata": {}, "createdAt": "…" } ] }
```

---

## 8. Audit — `/audit`

### `GET /audit?actorId=&projectId=&action=&from=&to=&page=1&pageSize=50` · **ADMIN**
```json
{ "items": [ { "id": "uuid", "action": "ROLE_CHANGED", "entityType": "USER", "entityId": "uuid",
               "metadata": { "from": "EMPLOYEE", "to": "MANAGER" }, "ipAddress": "127.0.0.1",
               "createdAt": "…",
               "actor":   { "id": "uuid", "name": "Ayesha Rahman", "email": "…", "role": "ADMIN" },
               "project": null } ],
  "total": 128, "page": 1, "pageSize": 50 }
```

---

## 9. Uploads — `/uploads`

### `POST /uploads/tasks/:taskId` · EDIT · `multipart/form-data`, field `files` (≤ 5 × 10 MB)
Allowed MIME: png, jpeg, webp, gif, pdf, txt, md, zip, docx, xlsx.
**201** `{ "attachments": [ { "id": "uuid", "fileName": "spec.pdf", "mimeType": "application/pdf",
"sizeBytes": 81234, "storageKey": "b1c2….pdf", "createdAt": "…" } ] }` · emits `attachment:created`.

### `GET /uploads/:storageKey` · project member
Streams the file (`Content-Disposition: inline`). In production this handler returns a short-lived signed S3 URL instead.

### `DELETE /uploads/:id` · uploader, EDIT+, ADMIN → **204**

---

## 10. Realtime contract (Socket.io, path `/socket.io`)

**Handshake:** `io('/', { auth: cb => cb({ token: accessToken }) })` — a rejected handshake emits `connect_error` with `Unauthorized`; the client's `auth` callback re-reads the current token on every reconnect.

**Rooms:** `user:{id}` (auto), `project:{id}` (auto from membership; `project:subscribe` re-authorises), `role:ADMIN`.

| Direction | Event | Payload |
|---|---|---|
| S→C | `task:created` | full task + `progress` + `actorId` |
| S→C | `task:updated` | full task + `progress` + `actorId` |
| S→C | `task:moved` | `{ id, projectId, status, columnId, position, updatedAt, progress, actorId, from }` |
| S→C | `task:deleted` | `{ id, actorId }` |
| S→C | `comment:created` | `{ taskId, comment, actorId }` |
| S→C | `comment:updated` / `comment:deleted` | `{ taskId, comment }` / `{ taskId, commentId, actorId }` |
| S→C | `attachment:created` | `{ taskId, attachments }` |
| S→C | `notification:new` | full notification (sent to `user:{id}`) |
| S→C | `activity:new` | activity row + `taskId` |
| S→C | `project:updated` | project row |
| S→C | `presence:update` | `{ userId, name?, state: 'online'\|'offline', at }` |
| C→S | `project:subscribe` | `(projectId, ack(ok: boolean))` |

**Client contract:** patch the TanStack Query cache from the payload; never rely on broadcast ordering — the REST response is authoritative and a refetch reconciles on reconnect.

---

## 11. Status / error code reference

| Code | Meaning |
|---|---|
| `BAD_REQUEST` | validation or domain rule |
| `UNAUTHORIZED` | missing/expired access token, bad credentials, refresh reuse |
| `FORBIDDEN` | role or access level insufficient |
| `NOT_FOUND` | unknown id or invisible resource |
| `CONFLICT` / `UNIQUE_VIOLATION` / `EMAIL_TAKEN` / `KEY_TAKEN` | uniqueness |
| `RATE_LIMITED` | 429 from the login/register limiter |
| `INTERNAL_ERROR` | 500 (details only outside production) |
