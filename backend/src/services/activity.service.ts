import type { ActivityAction, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

interface LogInput {
  actorId?: string | null;
  projectId?: string | null;
  action: ActivityAction;
  entityType: string;
  entityId?: string | null;
  metadata?: Prisma.InputJsonValue;
  ipAddress?: string | null;
  taskId?: string | null;
}

/**
 * Writes an immutable audit record. Called from every mutating endpoint.
 * Notification-side fan-out happens in the `task.feed` room via `emitActivity`.
 */
export async function logActivity(input: LogInput) {
  const row = await prisma.activityLog.create({
    data: {
      actorId: input.actorId ?? null,
      projectId: input.projectId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      metadata: input.metadata ?? {},
      ipAddress: input.ipAddress ?? null,
    },
  });

  if (input.projectId) {
    const { emitToProject } = await import('../realtime/io');
    emitToProject(input.projectId, 'activity:new', { ...row, taskId: input.taskId ?? null });
  }
  return row;
}
