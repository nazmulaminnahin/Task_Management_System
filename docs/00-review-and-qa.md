# QA & Verification Log

Everything below was executed against the running stack (PostgreSQL 17, API on :4000, Vite on :5173) during delivery.

## Automated / scripted checks

| Check | Result |
|---|---|
| `backend: npx tsc --noEmit` | ✅ clean |
| `frontend: npx tsc --noEmit` | ✅ clean |
| `frontend: vite build` | ✅ built, route-level chunks (ProjectPage 74 kB, index 952 kB) |
| `prisma migrate dev` + seed | ✅ schema applied, ~24 tasks / 3 projects / 8 users seeded |
| Login for all 4 roles | ✅ correct landing dashboard per role |
| `GET /analytics/admin` as employee | ✅ 403 |
| `GET /analytics/admin` as admin | ✅ 200 with KPIs |
| Another user's **personal** project as employee | ✅ 404 (existence not leaked) |
| Same personal project as admin | ✅ 200 |
| `PATCH /tasks/:id/move` (column move) | ✅ position updated, `TASK_MOVED` audited |
| `POST /tasks` with subtasks | ✅ created with default column resolution |
| `GET/POST /tasks/:id/comments` | ✅ threaded root + reply returned |
| Refresh rotation | ✅ new access token, old refresh token revoked |
| Audit log after the above | ✅ rows for login, task move, comment |

## Browser walkthrough (Chromium via Playwright)

| Surface | Verified |
|---|---|
| Login page | 4 demo role cards, quick sign-in, brand panel |
| Admin dashboard | KPI cards, signup area chart, role donut, largest projects, workload watch |
| Manager dashboard | velocity bars, project health, workload distribution, overdue watchlist |
| Projects grid | colour accent, status, member/task counts, owner avatar |
| Kanban board | 5 columns, WIP counters (4/12), priority dots, tags, due chips, subtask progress, avatar stacks |
| Task drawer | inline title, status/priority selects, markdown description, subtask add/toggle, assignee toggles, tag chips, attachments upload, comments, activity tab |
| List view | group-by tabs, sortable headers, progress column, completion styling |
| Calendar view | month grid, overflow markers, overdue tint, today chip |
| Insights tab | status donut with legend, priority bars, per-member workload |
| My work | open/today/overdue/done buckets, table view |
| Notifications | popover with unread badges, mark-all-read, deep links |
| Admin users | role chips, inline role select, disable/edit actions, self row locked |
| Audit log | filter + paginated table |
| Individual dashboard | private workspace KPIs, today schedule, completion trend |

## Realtime verification (two independent browser contexts)

1. Manager and Employee sessions open the **same Apollo board**.
2. Manager drags *App store screenshots & descriptions* from **Backlog → To do**.
3. Manager's board re-renders optimistically; `PATCH /tasks/:id/move` fires; `task:moved` broadcasts on `project:{id}`.
4. Employee's board updates **without a reload** (Backlog 2 → 1, To do 4 → 5).
5. Employee comments on the moved task → manager's notification bell increments and the drawer thread refreshes on open.

## Bugs found and fixed during QA

| Bug | Cause | Fix |
|---|---|---|
| Opening the task drawer blanked the page | Callback `ref` passed a setter that triggered a render loop (`Maximum update depth`) in `CommentThread` | Replaced the state-held ref with `useRef` |
| Comments route 404 | Routes mounted at `/api` but declared `/task/:taskId` | Declared `/tasks/:taskId/comments` |
| Completed tasks showed "12d overdue" | Due tone computed from date regardless of status | Completed/cancelled tasks now render neutral due labels |
| Role select clipped text in admin table | Fixed 32/40 width too narrow | Widened select column |

## Known stubs (integration points requiring vendor credentials)

| Stub | File | Production swap |
|---|---|---|
| Email console driver | `services/mail.service.ts` + `jobs/reminderWorker.ts` | `nodemailer` SMTP transport (outbox already wired) |
| Local disk uploads | `routes/uploads.routes.ts` | S3 driver + signed URLs |
| In-memory rate limiter | `middleware/rateLimit.ts` | `rate-limiter-flexible` on Redis |
| `setInterval` worker | `jobs/reminderWorker.ts` | BullMQ repeatable job (single-flight across nodes) |
| Single-node sockets | `realtime/io.ts` | `@socket.io/redis-adapter` + sticky sessions |
