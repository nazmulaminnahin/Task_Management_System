import type { Prisma, TaskStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';

export const DEFAULT_COLUMNS: Array<{ name: string; status: TaskStatus; wipLimit?: number }> = [
  { name: 'Backlog', status: 'BACKLOG' },
  { name: 'To do', status: 'TODO', wipLimit: 12 },
  { name: 'In progress', status: 'IN_PROGRESS', wipLimit: 6 },
  { name: 'In review', status: 'IN_REVIEW', wipLimit: 6 },
  { name: 'Done', status: 'DONE' },
];

export const TASK_INCLUDE = {
  assignees: { include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } } },
  subtasks: { orderBy: { position: 'asc' } },
  tags: true,
  _count: { select: { comments: true, attachments: true } },
} satisfies Prisma.TaskInclude;

export type TaskWithRelations = Prisma.TaskGetPayload<{ include: typeof TASK_INCLUDE }>;

/**
 * Fractional ranking: tasks are ordered by a float `position` inside a column.
 * Inserting between two cards averages their positions, so a drag & drop move is
 * a single UPDATE instead of re-numbering the whole column. When the gap between
 * neighbours collapses (< 0.001), the column is renormalised in steps of 1000.
 */
export function positionBetween(before?: number | null, after?: number | null): number {
  if (before == null && after == null) return 1000;
  if (before == null) return (after as number) - 1000;
  if (after == null) return before + 1000;
  return before + (after - before) / 2;
}

export async function renormalizeColumn(columnId: string): Promise<void> {
  const tasks = await prisma.task.findMany({
    where: { columnId },
    orderBy: { position: 'asc' },
    select: { id: true },
  });
  await prisma.$transaction(
    tasks.map((t, i) => prisma.task.update({ where: { id: t.id }, data: { position: (i + 1) * 1000 } })),
  );
}

/**
 * Moves a task to a column/status at a computed position.
 * `beforeId` / `afterId` are the neighbours the client dropped the card between.
 */
export async function moveTask(params: {
  taskId: string;
  projectId: string;
  status: TaskStatus;
  columnId?: string | null;
  beforeId?: string | null;
  afterId?: string | null;
  actorId: string;
}) {
  const { taskId, projectId, status, columnId, beforeId, afterId, actorId } = params;

  const [before, after] = await Promise.all([
    beforeId ? prisma.task.findFirst({ where: { id: beforeId, projectId }, select: { position: true } }) : null,
    afterId ? prisma.task.findFirst({ where: { id: afterId, projectId }, select: { position: true } }) : null,
  ]);

  let position = positionBetween(before?.position, after?.position);
  const statusChanged = await prisma.task
    .findUnique({ where: { id: taskId }, select: { status: true, completedAt: true } })
    .then((t) => t?.status !== status);

  // Rebalance when floats get too tight to split.
  if (before && after && Math.abs(after.position - before.position) < 0.001 && columnId) {
    await renormalizeColumn(columnId);
    const refreshed = await prisma.task.findUnique({ where: { id: taskId }, select: { position: true } });
    position = refreshed?.position ?? position;
  }

  const updated = await prisma.task.update({
    where: { id: taskId },
    data: {
      status,
      columnId: columnId ?? null,
      position,
      completedAt: status === 'DONE' ? (statusChanged ? new Date() : undefined) : null,
    },
    include: TASK_INCLUDE,
  });

  await prisma.activityLog.create({
    data: {
      actorId,
      projectId,
      action: 'TASK_MOVED',
      entityType: 'TASK',
      entityId: taskId,
      metadata: { to: status, columnId: columnId ?? null },
    },
  });

  return updated;
}

/** Progress = completed subtasks if any exist, otherwise 0/100 from status. */
export function taskProgress(task: { status: TaskStatus; subtasks: Array<{ isDone: boolean }> }): number {
  if (task.subtasks.length) {
    return Math.round((task.subtasks.filter((s) => s.isDone).length / task.subtasks.length) * 100);
  }
  if (task.status === 'DONE') return 100;
  if (task.status === 'IN_REVIEW') return 80;
  if (task.status === 'IN_PROGRESS') return 40;
  return 0;
}
