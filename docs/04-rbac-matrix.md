# RBAC Matrix & Authorisation Rules

Four roles, two authorisation layers, one source of truth (`backend/src/services/access.service.ts`).

## 1. Roles

| Role | Persona | Default surfaces |
|---|---|---|
| **ADMIN** | System Admin | Global user management, role assignment, platform analytics, audit log, every project |
| **MANAGER** | Team Manager | Team project creation, membership, assignment, project reporting, workload |
| **EMPLOYEE** | Employee | Project work: create/edit tasks in projects they belong to, comment, log time |
| **INDIVIDUAL** | Individual User | Private personal workspace only (own boards, self-analytics) |

## 2. Capability matrix

Legend: ✅ allowed · 🔸 own/project-scoped · ❌ denied

| Capability | ADMIN | MANAGER | EMPLOYEE | INDIVIDUAL |
|---|---|---|---|---|
| Register / login / refresh / logout | ✅ | ✅ | ✅ | ✅ |
| View own profile, change password, sessions | ✅ | ✅ | ✅ | ✅ |
| Browse user directory | ✅ all | ✅ all | ✅ active only | ✅ active only |
| Create user / assign any role | ✅ | ❌ | ❌ | ❌ |
| Change a user's role | ✅ | ❌ | ❌ | ❌ |
| Deactivate a user | ✅ | ❌ | ❌ | ❌ |
| Create **team** project | ✅ | ✅ | ❌ 1 | ❌ |
| Create **personal** project | ✅ | ✅ | ✅ | ✅ |
| See all projects (`scope=all`) | ✅ | ❌ | ❌ | ❌ |
| Manage project (edit, archive, members) | ✅ any | 🔸 owned/LEAD | 🔸 LEAD only | 🔸 own personal |
| Add/remove project members | ✅ | 🔸 MANAGE | 🔸 MANAGE | ❌ |
| View project board / tasks / comments | ✅ | 🔸 member | 🔸 member | 🔸 own only |
| Create task in project | ✅ | 🔸 EDIT | 🔸 EDIT | 🔸 own |
| Edit task (any project) | ✅ | 🔸 EDIT | 🔸 EDIT | 🔸 own |
| Move task / drag & drop | ✅ | 🔸 EDIT | 🔸 EDIT | 🔸 own |
| Delete task | ✅ | 🔸 creator or MANAGE | 🔸 creator only | 🔸 own |
| Comment + @mention | ✅ | 🔸 EDIT | 🔸 EDIT | 🔸 own |
| Log time | ✅ | 🔸 EDIT | 🔸 EDIT | 🔸 own |
| Upload / delete attachment | ✅ | 🔸 uploader or EDIT | 🔸 uploader | 🔸 own |
| Project analytics (velocity, workload) | ✅ | 🔸 member | 🔸 member | 🔸 own |
| Cross-team workload endpoint | ✅ | ✅ | ❌ | ❌ |
| Platform analytics | ✅ | ❌ | ❌ | ❌ |
| Audit log | ✅ | ❌ | ❌ | ❌ |

¹ Employees and individuals can still own an unlimited number of **personal** projects.

## 3. Two-layer enforcement

### Layer 1 — route gate (coarse)
```ts
router.post('/:id/role', authenticate, authorize('ADMIN'), handler);        // users.routes.ts
router.get('/admin', authenticate, authorize('ADMIN'), handler);            // analytics.routes.ts
router.get('/workload', authenticate, authorize('ADMIN', 'MANAGER'), ...);  // analytics.routes.ts
```

### Layer 2 — resource gate (fine, in the service)
```ts
// access.service.ts — the ONLY authorisation decision for project data
export async function getProjectAccess(userId, role, projectId, required = 'VIEW') {
  const project = await prisma.project.findUnique({
    where: { id: projectId }, include: { members: { where: { userId } } },
  });
  if (!project) throw notFound('Project not found');          // 404, not 403

  const membership = project.members[0] ?? null;
  const isOwner = project.ownerId === userId;

  let level: AccessLevel | null = null;
  if (role === 'ADMIN') level = 'MANAGE';
  else if (isOwner || membership?.projectRole === 'LEAD') level = 'MANAGE';
  else if (membership?.projectRole === 'MEMBER') level = 'EDIT';
  else if (membership?.projectRole === 'VIEWER') level = 'VIEW';
  else if (project.type === 'PERSONAL' && isOwner) level = 'MANAGE';  // private workspace

  if (!level) throw notFound('Project not found');   // non-members learn nothing
  if (RANK[level] < RANK[required]) throw forbidden(`This action requires ${required.toLowerCase()} access`);
  return { project, level, isMember: Boolean(membership) || isOwner, projectRole: isOwner ? 'LEAD' : membership?.projectRole ?? null };
}
```

Every project/task/comment/attachment route calls this (or `getTaskAccess`, which resolves the task's project first), so **a new endpoint cannot accidentally skip authorisation** — it simply has no way to load data without going through the funnel.

## 4. Access levels

| Level | Meaning | Typical operations |
|---|---|---|
| `VIEW` | read-only | see board, open task, read comments |
| `EDIT` | contribute | create/edit/move tasks, comment, upload, log time |
| `MANAGE` | administer | edit project, add/remove members, delete any task, archive |

## 5. Deliberate rules worth highlighting

1. **404 over 403 for non-members.** Returning `403 Project exists but you can't see it` leaks project names and activity.
2. **Personal workspaces are invisible to everyone else — including admins in the UI paths.** Admin remains able to hard-delete via DBA operations; the product never surfaces another user's private board. (The matrix's "every project" for ADMIN refers to team projects.)
3. **Role changes revoke refresh tokens.** Privilege elevation/demotion lands within ≤15 minutes (next access-token refresh) and never silently extends a session.
4. **Managers cannot elevate anyone.** Only `PATCH /users/:id/role` (ADMIN) can grant MANAGER/ADMIN, and an admin cannot demote themselves (prevents orphaned systems).
5. **Assignment is bounded by membership.** `POST /tasks` and `PATCH /tasks/:id` reject assignee ids that are not project members.
6. **Mentions are bounded by membership.** `@[Name](uuid)` ids that are not project members fail validation, preventing notification spam to outsiders.
7. **Viewers cannot mutate.** `getProjectAccess(..., 'EDIT')` guards every write, including comments and uploads.
8. **Socket joins are authorised separately.** Realtime access re-checks membership on `project:subscribe` and at handshake; RBAC is never assumed from the HTTP layer.

## 6. Frontend mirroring (defence in depth, not security)

- `<RequireAdmin>` wraps `/admin/*` routes; the API still enforces `authorize('ADMIN')`.
- `accessLevel` from `GET /projects/:id` hides edit affordances (`canEdit`, `canManage`) — the buttons are gone, but the server would reject the call anyway.
- Sidebar admin section renders only for `user.role === 'ADMIN'`.

**Rule:** the UI never *decides* authorisation; it only avoids offering actions the API would refuse.
