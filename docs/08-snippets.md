# Core Implementation Snippets

Copy-ready extracts; the full, compiled versions live in the repository.

## 1. RBAC middleware + resource gate

```ts
// src/middleware/auth.ts
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next(unauthorized('Missing Bearer access token'));
  try {
    const payload = verifyAccessToken(header.slice('Bearer '.length));
    req.user = { id: payload.sub, role: payload.role, email: payload.email, name: payload.name };
    next();
  } catch {
    next(unauthorized('Access token is invalid or expired'));
  }
}

export function authorize(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(unauthorized());
    if (roles.length && !roles.includes(req.user.role)) {
      return next(forbidden(`Requires role: ${roles.join(' | ')}`));
    }
    next();
  };
}

// src/services/access.service.ts  (excerpt — full version in docs/04)
export async function getProjectAccess(userId: string, role: Role, projectId: string,
                                       required: AccessLevel = 'VIEW'): Promise<ProjectAccess> {
  const project = await prisma.project.findUnique({
    where: { id: projectId }, include: { members: { where: { userId } } },
  });
  if (!project) throw notFound('Project not found');

  const membership = project.members[0] ?? null;
  const isOwner = project.ownerId === userId;

  let level: AccessLevel | null = null;
  if (role === 'ADMIN') level = 'MANAGE';
  else if (isOwner || membership?.projectRole === 'LEAD') level = 'MANAGE';
  else if (membership?.projectRole === 'MEMBER') level = 'EDIT';
  else if (membership?.projectRole === 'VIEWER') level = 'VIEW';
  else if (project.type === 'PERSONAL' && isOwner) level = 'MANAGE';

  if (!level) throw notFound('Project not found');           // do not leak existence
  if (RANK[level] < RANK[required]) throw forbidden(`This action requires ${required.toLowerCase()} access`);
  return { project, level, isMember: Boolean(membership) || isOwner,
           projectRole: isOwner ? 'LEAD' : membership?.projectRole ?? null };
}
```

Usage:

```ts
router.patch('/:id/move', authenticate, validate({ body: moveSchema }), asyncHandler(async (req, res) => {
  const { task, access } = await getTaskAccess(req.user!.id, req.user!.role, req.params.id, 'EDIT');
  const updated = await moveTask({ taskId: task.id, projectId: access.project.id, ...req.body, actorId: req.user!.id });
  emitToProject(access.project.id, 'task:moved', { ...updated, actorId: req.user!.id });
  res.json({ task: updated });
}));
```

## 2. Socket.io setup (server)

```ts
export async function initSocket(server: HttpServer): Promise<Server> {
  const io = new Server(server, {
    cors: { origin: config.clientOrigin, credentials: true },
    path: '/socket.io', pingInterval: 25_000, pingTimeout: 20_000,
  });

  io.use(async (socket, next) => {
    const token = (socket.handshake.auth?.token as string | undefined) ?? '';
    try {
      const payload = verifyAccessToken(token);
      const user = await prisma.user.findUnique({
        where: { id: payload.sub }, select: { id: true, name: true, role: true, isActive: true },
      });
      if (!user?.isActive) return next(new Error('Unauthorized'));
      socket.data.user = { id: user.id, name: user.name, role: user.role };
      next();
    } catch { next(new Error('Unauthorized')); }
  });

  io.on('connection', async (socket) => {
    const user = socket.data.user as { id: string; name: string; role: string };
    socket.join(userRoom(user.id));

    const memberships = await prisma.projectMember.findMany({ where: { userId: user.id }, select: { projectId: true } });
    const owned = await prisma.project.findMany({ where: { ownerId: user.id }, select: { id: true } });
    const projectIds = new Set([...memberships.map(m => m.projectId), ...owned.map(p => p.id)]);
    for (const id of projectIds) socket.join(projectRoom(id));

    socket.on('project:subscribe', async (projectId: string, ack?: (ok: boolean) => void) => {
      const member = await prisma.projectMember.findFirst({ where: { projectId, userId: user.id }, select: { id: true } });
      const owns = await prisma.project.findFirst({ where: { id: projectId, ownerId: user.id }, select: { id: true } });
      const ok = Boolean(member ?? owns) || user.role === 'ADMIN';
      if (ok) socket.join(projectRoom(projectId));
      ack?.(ok);
    });

    socket.on('disconnect', () => {
      socket.to([...projectIds].map(projectRoom)).emit('presence:update',
        { userId: user.id, name: user.name, state: 'offline', at: new Date().toISOString() });
    });
  });

  setServer(io);
  return io;
}
```
For multiple API nodes, add `@socket.io/redis-adapter` with `io.adapter(createAdapter(pubClient, subClient))` — every emit already goes through `emitToProject` / `emitToUser`.

## 3. Task board logic — fractional ordering + move

```ts
export function positionBetween(before?: number | null, after?: number | null): number {
  if (before == null && after == null) return 1000;
  if (before == null) return (after as number) - 1000;
  if (after == null) return before + 1000;
  return before + (after - before) / 2;
}

export async function moveTask({ taskId, projectId, status, columnId, beforeId, afterId, actorId }: MoveArgs) {
  const [before, after] = await Promise.all([
    beforeId  ? prisma.task.findFirst({ where: { id: beforeId,  projectId }, select: { position: true } }) : null,
    afterId   ? prisma.task.findFirst({ where: { id: afterId,   projectId }, select: { position: true } }) : null,
  ]);

  let position = positionBetween(before?.position, after?.position);
  if (before && after && Math.abs(after.position - before.position) < 0.001 && columnId) {
    await renormalizeColumn(columnId);                     // gaps collapsed → renumber 1000, 2000, …
  }

  const updated = await prisma.task.update({
    where: { id: taskId },
    data: {
      status, columnId: columnId ?? null, position,
      completedAt: status === 'DONE' ? new Date() : null,   // clears when moved back out of DONE
    },
    include: TASK_INCLUDE,
  });

  await prisma.activityLog.create({ data: {
    actorId, projectId, action: 'TASK_MOVED', entityType: 'TASK',
    entityId: taskId, metadata: { to: status, columnId: columnId ?? null },
  }});

  return updated;
}
```

Optimistic client reducer (dnd-kit) — see `frontend/src/components/board/KanbanBoard.tsx`:

```ts
const handleDragOver = ({ active, over }) => {          // live cross-column preview
  const from = findContainer(String(active.id));
  const to   = over && findContainer(String(over.id));
  if (!from || !to || from === to) return;
  setGrouped(prev => { /* splice card from `from`, insert into `to` at hover index */ });
};

const handleDragEnd = ({ active, over }) => {           // commit neighbours to the server
  const container = findContainer(String(active.id))!;
  const column = columns.find(c => c.id === container)!;
  setGrouped(prev => {
    const items = [...prev[container]!];
    const from = items.findIndex(t => t.id === active.id);
    const to   = items.findIndex(t => t.id === over?.id);
    const next = from !== to && to >= 0 ? arrayMove(items, from, to) : items;
    const i = next.findIndex(t => t.id === active.id);
    onMove({ taskId: String(active.id), status: column.status, columnId: container,
             beforeId: next[i - 1]?.id ?? null, afterId: next[i + 1]?.id ?? null });
    return { ...prev, [container]: next };
  });
};
```

## 4. Auth: refresh rotation with reuse detection

```ts
export async function rotateRefreshToken(res: Response, rawToken: string | undefined, meta: SessionMeta) {
  if (!rawToken) throw unauthorized('Refresh token missing');
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    include: { user: { select: { id: true, email: true, role: true, name: true, isActive: true } } },
  });
  if (!stored) throw unauthorized('Refresh token is invalid');

  if (stored.revokedAt) {                       // replay ⇒ theft
    await prisma.refreshToken.updateMany({ where: { userId: stored.userId, revokedAt: null },
                                           data: { revokedAt: new Date() } });
    clearRefreshCookie(res);
    throw unauthorized('Refresh token has been revoked — please sign in again');
  }
  if (stored.expiresAt < new Date() || !stored.user.isActive) throw unauthorized('Refresh token expired');

  await prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
  return { accessToken: await issueTokens(res, stored.user, meta) };
}
```

## 5. Mention parsing & notification fan-out

```ts
const MENTION_RE = /@\[([^\]]+)\]\(([0-9a-f-]{36})\)/g;

const mentionIds = [...new Set([...body.matchAll(MENTION_RE)].map(m => m[2]!))];
if (mentionIds.length) {
  const valid = await prisma.projectMember.findMany({
    where: { projectId: access.project.id, userId: { in: mentionIds } }, select: { userId: true },
  });
  if (valid.length !== mentionIds.length) throw badRequest('Mentioned users must be project members');
}

await notify([
  ...mentionIds.filter(id => id !== actor.id).map(userId => ({
    userId, type: 'COMMENT_MENTION' as const,
    body: `${actor.name} mentioned you on "${task.title}".`,
    entityType: 'TASK', entityId: task.id,
  })),
  ...assignees.filter(id => id !== actor.id && !mentionIds.includes(id)).map(userId => ({
    userId, type: 'COMMENT_ADDED' as const,
    body: `${actor.name} commented on "${task.title}".`,
    entityType: 'TASK', entityId: task.id,
  })),
]);
```

## 6. Frontend API client with single-flight refresh

```ts
async function refreshAccessToken(): Promise<string | null> {
  refreshing ??= (async () => {
    try {
      const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
      if (!res.ok) return null;
      const { accessToken } = await res.json();
      accessTokenMemory = accessToken;
      return accessToken;
    } finally { refreshing = null; }
  })();
  return refreshing;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json',
               ...(accessTokenMemory ? { Authorization: `Bearer ${accessTokenMemory}` } : {}), ...options.headers },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (res.status === 401 && options.retry !== false && !path.startsWith('/auth/')) {
    if (await refreshAccessToken()) return api<T>(path, { ...options, retry: false });
    onUnauthorized?.();                                  // clears the Zustand session
    throw new ApiError(401, 'Session expired');
  }
  if (!res.ok) throw new ApiError(res.status, (await res.json().catch(() => ({}))).error?.message ?? res.statusText);
  return res.status === 204 ? (undefined as T) : res.json();
}
```
