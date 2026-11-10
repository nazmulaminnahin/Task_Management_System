# Realtime, Notifications & Deadline Automation

## 1. Socket lifecycle

```
connect attempt
  ├─ handshake.auth.token = current access token
  ├─ io.use(): verify JWT → load user → reject if !isActive
  ├─ join user:{id}
  ├─ join every project:{id} where owner or member
  └─ emit presence:update (online) to those rooms
reconnect
  ├─ auth callback re-reads the token (handles rotation/expiry)
  └─ rooms re-derived server-side; client invalidates queries via the `connect` event
disconnect
  └─ presence:update (offline) broadcast
```

`project:subscribe(projectId, ack)` exists for the case where membership was granted while the tab was open: the server re-checks the DB and only then joins the room, `ack(false)` otherwise.

## 2. Event catalogue

| Event | Room | Emitted by | Client reaction |
|---|---|---|---|
| `task:created` | `project:{id}` | `POST /tasks` | append to task cache, invalidate project counts |
| `task:updated` | `project:{id}` | `PATCH /tasks/:id` | merge task, invalidate drawer |
| `task:moved` | `project:{id}` | `PATCH /tasks/:id/move` | patch status/column/position |
| `task:deleted` | `project:{id}` | `DELETE /tasks/:id` | remove from cache |
| `comment:created` | `project:{id}` | `POST .../comments` | invalidate `['task', id]` |
| `comment:updated`/`deleted` | `project:{id}` | comment routes | invalidate thread |
| `attachment:created` | `project:{id}` | `POST /uploads/...` | invalidate drawer |
| `project:updated` | `project:{id}` | `PATCH /projects/:id` | update header/project cache |
| `activity:new` | `project:{id}` | every audit write | optional live activity feed |
| `notification:new` | `user:{id}` | `notify()` | invalidate notifications, bump bell |
| `presence:update` | project rooms | connect/disconnect | online dots (optional UI) |

## 3. Notification engine

```
                       ┌──────────────────────────────┐
domain mutation ──────►│ notify(entries[])            │
 (assign, comment,     │  • prisma.notification.create│──► in-app row (isRead=false)
  mention, invite,     │  • respect emailNotifications│──► emitToUser('notification:new')
  status change, …)    │  • emailOutbox.create        │──► queued email
                       └──────────────────────────────┘
```

| Type | Trigger | Recipients |
|---|---|---|
| `TASK_ASSIGNED` | task create/update with new assignees | newly added assignees (not the actor) |
| `TASK_STATUS_CHANGED` | move changes status | existing assignees |
| `COMMENT_ADDED` | new comment | assignees not mentioned |
| `COMMENT_MENTION` | `@[Name](uuid)` in body | mentioned project members |
| `PROJECT_MEMBER_ADDED` | project create/member add | added users |
| `TASK_DUE_SOON` | worker sweep (due ≤ 24 h) | assignees, max 1/day/task |
| `TASK_OVERDUE` | worker sweep (past due, not done) | assignees, max 1/day/task |
| `SYSTEM` | role change, admin notices | affected user |

Emails are **never sent inline**. `notify()` writes `EmailOutbox` rows; the worker drains them, retries up to 5 attempts, records `lastError`, and marks `SENT`/`FAILED`. Swapping the console driver for SMTP is a 5-line change inside `reminderWorker` / `mail.service`.

## 4. Deadline sweep (hourly)

```
runDeadlineSweep(now):
  dueSoon  := tasks where dueDate ∈ [now, now+24h] and status ∉ {DONE, CANCELLED}
              → for each assignee: skip if a TASK_DUE_SOON for that task exists in the last 24h
              → create notification + socket push + outbox email
  overdue  := tasks where dueDate < now and status ∉ {DONE, CANCELLED}
              → same de-duplication with TASK_OVERDUE
  outbox   := EmailOutbox where status=PENDING and scheduledAt ≤ now and attempts < 5 (batch 50)
              → send (console/SMTP) → mark SENT, else FAILED + lastError
```

The de-duplication query is indexed by `Notification(userId, isRead, createdAt)`; in a multi-node deployment run this in exactly one process (or move it to BullMQ with a repeatable job) to avoid duplicate sends.

## 5. Failure modes & guarantees

| Failure | Behaviour |
|---|---|
| Socket disconnects | UI shows **Offline**; TanStack Query refetches on reconnect; nothing is lost because REST is the source of truth |
| Broadcast lost | next `invalidateQueries` (focus, mutation, reconnect) reconciles |
| SMTP down | outbox rows stay `PENDING`/`FAILED`, retried up to 5×, never blocks an API response |
| Duplicate sweep runs | 24-hour de-dup window per (user, task, type) |
| Token expires mid-session | REST refreshes silently (single-flight); socket re-auths via the `auth` callback on reconnect |
