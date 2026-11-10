# Database Schema & Design Decisions

PostgreSQL 16 · Prisma ORM 6 · the canonical model lives in [`backend/prisma/schema.prisma`](../backend/prisma/schema.prisma) and the committed migration in [`backend/prisma/migrations`](../backend/prisma/migrations).

## 1. Entity-relationship map

```
User 1───┬───* RefreshToken
         ├───* ProjectMember *───1 Project
         ├───* TaskAssignee  *───1 Task
         ├───* Comment        ───* CommentMention *───1 User
         ├───* Notification
         ├───* ActivityLog
         ├───* Attachment
         └───* TimeEntry

Project 1──* Board 1──* BoardColumn 1──* Task
Project 1──* Tag      ──── Task ↔ Tag (implicit M:N)
Project 1──* ProjectMember / Task / ActivityLog

Task 1──* Subtask / Comment / Attachment / TimeEntry / TaskAssignee
Comment 1──* Comment (self-relation, one level)
```

## 2. Tables

| Model | Purpose | Key columns & constraints |
|---|---|---|
| **User** | Identity + RBAC principal | `email @unique`, `role Role`, `isActive`, `emailNotifications`; `@@index([role])`, `@@index([isActive])` |
| **RefreshToken** | Server-side session registry | `tokenHash @unique` (SHA-256 of opaque token), `expiresAt`, `revokedAt`, `userAgent`, `ip`; `@@index([userId, revokedAt])` |
| **Project** | Workspace container (team or personal) | `key @unique` (e.g. `APOLLO`), `type`, `status`, `visibility`, `ownerId`, `archivedAt`; `@@index([status])`, `@@index([type, visibility])` |
| **ProjectMember** | Membership + project-scoped role | `@@unique([projectId, userId])`, `projectRole: LEAD｜MEMBER｜VIEWER`, `joinedAt` |
| **Board** | One or more boards per project | `projectId`, `position` |
| **BoardColumn** | Kanban column mapped to a canonical status | `@@unique([boardId, status])`, `position`, `wipLimit` |
| **Task** | The unit of work | `projectId`, nullable `boardId` / `columnId` (SetNull on delete), `status`, `priority`, **`position Float`**, `startDate`, `dueDate`, `completedAt`, `estimateMins`, `createdById` |
| **TaskAssignee** | Explicit M:N with metadata | `@@id([taskId, userId])`, `assignedAt` |
| **Subtask** | Checklist item | `taskId`, `isDone`, `position` |
| **Tag** | Project-scoped label | `@@unique([projectId, name])`, `color` |
| **Comment** | Threaded discussion | `parentId` self-relation (one level), `editedAt`, `deletedAt` (soft delete ⇒ tombstone) |
| **CommentMention** | Parsed `@[Name](uuid)` tokens | `@@id([commentId, userId])` |
| **Attachment** | Files on tasks or comments | `storageKey @unique`, `mimeType`, `sizeBytes`, uploader |
| **TimeEntry** | Time logging | `minutes`, `startedAt`; `@@index([userId, startedAt])` |
| **Notification** | In-app feed | `type NotificationType`, `isRead`, `readAt`, `entityType/entityId` deep link; `@@index([userId, isRead, createdAt])` |
| **ActivityLog** | Append-only audit | `action ActivityAction`, `actorId` (SetNull), `projectId` (Cascade), `metadata Json`, `ipAddress`; `@@index([projectId, createdAt])`, `@@index([action, createdAt])` |
| **EmailOutbox** | Transactional email queue | `status PENDING｜SENT｜FAILED`, `attempts`, `scheduledAt`, `lastError`; `@@index([status, scheduledAt])` |

## 3. Enumerations

```prisma
enum Role            { ADMIN MANAGER EMPLOYEE INDIVIDUAL }
enum ProjectType     { TEAM PERSONAL }
enum ProjectStatus   { PLANNING ACTIVE ON_HOLD COMPLETED ARCHIVED }
enum ProjectVisibility { PRIVATE TEAM }
enum ProjectRole     { LEAD MEMBER VIEWER }
enum TaskStatus      { BACKLOG TODO IN_PROGRESS IN_REVIEW DONE CANCELLED }
enum TaskPriority    { LOW MEDIUM HIGH URGENT }
enum NotificationType{ TASK_ASSIGNED TASK_DUE_SOON TASK_OVERDUE TASK_STATUS_CHANGED
                       COMMENT_ADDED COMMENT_MENTION PROJECT_INVITE
                       PROJECT_MEMBER_ADDED SYSTEM }
enum ActivityAction  { USER_CREATED USER_UPDATED USER_DEACTIVATED ROLE_CHANGED
                       PROJECT_CREATED PROJECT_UPDATED PROJECT_ARCHIVED
                       PROJECT_MEMBER_ADDED PROJECT_MEMBER_REMOVED
                       TASK_CREATED TASK_UPDATED TASK_MOVED TASK_ASSIGNED TASK_DELETED
                       COMMENT_CREATED COMMENT_DELETED
                       AUTH_LOGIN AUTH_LOGOUT AUTH_FAILED }
enum EmailStatus     { PENDING SENT FAILED }
```

## 4. Design decisions & trade-offs

### 4.1 Personal workspaces are projects, not a separate table
An `Individual User`'s private board is a `Project` with `type = PERSONAL`, `visibility = PRIVATE` and the user as owner. Boards, tasks, comments, tags and attachments therefore need **one** code path; only the access check differs (`services/access.service.ts` denies everyone but the owner — managers included).

### 4.2 Explicit join tables over implicit M:N
`ProjectMember` carries `projectRole` and `joinedAt`; `TaskAssignee` carries `assignedAt`. Implicit joins (Prisma's `Task[] @relation`) cannot hold metadata, and these two are the queries the UI hits on every board render.

### 4.3 Fractional `position` (Float) per column
Card order must survive frequent, concurrent drags. Integer positions force O(n) re-numbering per move and collide under concurrency. Floats allow a single-row update between neighbours (`(before + after) / 2`) with an occasional re-normalisation pass. Column ordering itself is a small dense integer.

### 4.4 `status` duplicated from the column
`BoardColumn.status` is canonical for a column, and `Task.status` denormalises it so calendar/list/reporting queries never join three tables. The API keeps them in sync inside `moveTask`.

### 4.5 Soft deletes where history matters
Comments use `deletedAt` + a `[deleted]` tombstone so threads stay readable. Users are deactivated (`isActive = false`) so audit rows and assignments keep referential meaning. Projects archive (`archivedAt`) by default; hard delete is an explicit admin-only `?hard=true`.

### 4.6 Audit vs. notification
`ActivityLog` is immutable and query-oriented (who/what/when/ip/metadata) for compliance. `Notification` is a mutable, per-user, read-tracked feed. They share an event source but never the same row.

### 4.7 Email outbox (transactional outbox pattern)
Notifications write an `EmailOutbox` row in the same request instead of calling SMTP inline: API latency stays flat, transient SMTP failures retry (`attempts < 5`), and the worker can drain at its own pace. Swap the console driver for `nodemailer` without touching call sites.

### 4.8 Cascade rules

| Relation | On delete | Why |
|---|---|---|
| User → RefreshToken, Notification, TaskAssignee, ProjectMember | Cascade | session/UX data dies with the account |
| Project → Task, Board, Tag, ProjectMember, ActivityLog | Cascade | project is the aggregate root |
| Task → Subtask, Comment, Attachment, TimeEntry | Cascade | task is the aggregate root |
| Task.boardId / columnId | SetNull | deleting a board must not delete work |
| ActivityLog.actorId | SetNull | audit survives account deletion |

## 5. Indexing strategy

| Index | Serves |
|---|---|
| `Task(projectId, status)` | board column queries, status analytics |
| `Task(boardId, columnId, position)` | ordered column fetch for drag & drop |
| `Task(dueDate)` | deadline sweep, calendar, overdue alerts |
| `TaskAssignee(userId)` | "my work", workload analytics |
| `ProjectMember(userId)`, `(projectId, userId)` unique | sidebar, membership checks |
| `Notification(userId, isRead, createdAt)` | unread badge + paginated feed |
| `ActivityLog(projectId, createdAt)`, `(action, createdAt)` | project feed, audit filters |
| `Comment(taskId, createdAt)` | task drawer thread |
| `EmailOutbox(status, scheduledAt)` | worker claim query |
| `RefreshToken(tokenHash)` unique, `(userId, revokedAt)` | rotation lookup, family revocation |

## 6. Migration & seeding

```bash
cd backend
npx prisma migrate dev --name init      # or `migrate deploy` in CI
npm run prisma:seed                     # idempotent: clears then reseeds demo data
```

Seed contents: 8 users (1 admin, 2 managers, 4 employees, 1 individual), 3 projects (Apollo, Atlas, Noah's personal), 5 columns per board, ~24 tasks across every status with subtasks/tags/due dates, threaded comments with a real mention, notifications in several states, and audit rows.

## 7. Growth notes

- **Partitioning:** `ActivityLog` by month once it passes ~50 M rows (`PARTITION BY RANGE (createdAt)`).
- **Search:** add `pg_trgm` on `Task.title` / `User.name` before reaching for Elasticsearch.
- **Read replicas:** analytics endpoints (`/analytics/*`, `/audit`) are read-only and safe to point at a replica via a Prisma read client.
- **Tenancy:** if the product becomes multi-tenant, add `organizationId` to `User`/`Project` and a global query guard in `access.service.ts` — the RBAC funnel already centralises that check.
