import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import { config } from '../config';
import { prisma } from '../lib/prisma';
import { verifyAccessToken } from '../lib/tokens';

type Room = string;

export const userRoom = (userId: string): Room => `user:${userId}`;
export const projectRoom = (projectId: string): Room => `project:${projectId}`;

interface SocketRegistry {
  io: Server | null;
}

const registry: SocketRegistry = { io: null };

function setServer(io: Server) {
  registry.io = io;
}

/**
 * Initialises Socket.io on the existing HTTP server.
 *
 * Auth: the access token is passed as `auth.token` in the handshake
 * (never in the query string, which leaks into proxy logs). Connections join
 * a private `user:{id}` room and every project room the user can see.
 *
 * Client contract (see docs/API.md § Realtime):
 *   socket.on('task:moved' | 'task:created' | 'task:updated' | 'task:deleted')
 *   socket.on('comment:created' | 'notification:new' | 'presence:update')
 */
export async function initSocket(server: HttpServer): Promise<Server> {
  const io = new Server(server, {
    cors: { origin: config.clientOrigin, credentials: true },
    path: '/socket.io',
    pingInterval: 25_000,
    pingTimeout: 20_000,
  });

  io.use(async (socket, next) => {
    const token = (socket.handshake.auth?.token as string | undefined) ?? '';
    try {
      const payload = verifyAccessToken(token);
      const user = await prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, name: true, role: true, isActive: true },
      });
      if (!user || !user.isActive) return next(new Error('Unauthorized'));
      socket.data.user = { id: user.id, name: user.name, role: user.role };
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', async (socket: Socket) => {
    const user = socket.data.user as { id: string; name: string; role: string };
    socket.join(userRoom(user.id));

    const memberships = await prisma.projectMember.findMany({
      where: { userId: user.id },
      select: { projectId: true },
    });
    const owned = await prisma.project.findMany({
      where: { ownerId: user.id },
      select: { id: true },
    });
    const projectIds = new Set([...memberships.map((m) => m.projectId), ...owned.map((p) => p.id)]);
    for (const id of projectIds) socket.join(projectRoom(id));

    socket.emit('presence:update', { userId: user.id, state: 'online', at: new Date().toISOString() });
    socket.to([...projectIds].map(projectRoom)).emit('presence:update', {
      userId: user.id,
      name: user.name,
      state: 'online',
      at: new Date().toISOString(),
    });

    /** Allow the client to subscribe to a project it just gained access to. */
    socket.on('project:subscribe', async (projectId: string, ack?: (ok: boolean) => void) => {
      const member = await prisma.projectMember.findFirst({
        where: { projectId, userId: user.id },
        select: { id: true },
      });
      const owns = await prisma.project.findFirst({
        where: { id: projectId, ownerId: user.id },
        select: { id: true },
      });
      const isAdmin = user.role === 'ADMIN';
      const ok = Boolean(member ?? owns) || isAdmin;
      if (ok) socket.join(projectRoom(projectId));
      ack?.(ok);
    });

    socket.on('disconnect', () => {
      socket.to([...projectIds].map(projectRoom)).emit('presence:update', {
        userId: user.id,
        name: user.name,
        state: 'offline',
        at: new Date().toISOString(),
      });
    });
  });

  setServer(io);
  return io;
}

/** Emit to everyone watching a project board (including the actor, who ignores own echoes). */
export function emitToProject(projectId: string, event: string, payload: unknown): void {
  registry.io?.to(projectRoom(projectId)).emit(event, payload);
}

/** Emit to a single user's private room (notifications, personal dashboards). */
export function emitToUser(userId: string, event: string, payload: unknown): void {
  registry.io?.to(userRoom(userId)).emit(event, payload);
}

/** Role-addressed fan-out used for admin dashboards. */
export function emitToAdmins(event: string, payload: unknown): void {
  registry.io?.to('role:ADMIN').emit(event, payload);
}

export function getIo(): Server | null {
  return registry.io;
}
