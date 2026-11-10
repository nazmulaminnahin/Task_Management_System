import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/http';
import { badRequest, notFound } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { getProjectAccess, getTaskAccess } from '../services/access.service';
import { logActivity } from '../services/activity.service';
import { notify } from '../services/mail.service';
import { TASK_INCLUDE, moveTask, taskProgress } from '../services/task.service';
import { emitToProject } from '../realtime/io';

const router = Router();
router.use(authenticate);

const statusEnum = z.enum(['BACKLOG', 'TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'CANCELLED']);
const priorityEnum = z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']);
const uuid = z.string().uuid();

/**
 * GET /api/tasks?projectId=…&assigneeId=…&status=…&dueBefore=…
 * Board payload: tasks grouped by columnId, ordered by fractional position.
 */
router.get(
  '/',
  validate({
    query: z.object({
      projectId: uuid.optional(),
      boardId: uuid.optional(),
      assigneeId: uuid.optional(),
      status: statusEnum.optional(),
      priority: priorityEnum.optional(),
      dueBefore: z.coerce.date().optional(),
      dueAfter: z.coerce.date().optional(),
      q: z.string().trim().optional(),
      includeCompleted: z.enum(['true', 'false']).default('true'),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(200).default(100),
    }),
  }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as {
      projectId?: string;
      boardId?: string;
      assigneeId?: string;
      status?: string;
      priority?: string;
      dueBefore?: Date;
      dueAfter?: Date;
      q?: string;
      includeCompleted: string;
      page: number;
      pageSize: number;
    };

    // Cross-project "my work" query: only tasks in projects I can see.
    if (!q.projectId) {
      const user = req.user!;
      const visible =
        user.role === 'ADMIN'
          ? undefined
          : {
              project: {
                OR: [{ ownerId: user.id }, { members: { some: { userId: user.id } } }],
              },
            };

      const where = {
        ...(visible ?? {}),
        ...(q.assigneeId ? { assignees: { some: { userId: q.assigneeId } } } : {}),
        ...(q.status ? { status: q.status as any } : {}),
        ...(q.priority ? { priority: q.priority as any } : {}),
        ...(q.q ? { title: { contains: q.q, mode: 'insensitive' as const } } : {}),
        ...(q.dueBefore || q.dueAfter
          ? { dueDate: { ...(q.dueAfter ? { gte: q.dueAfter } : {}), ...(q.dueBefore ? { lte: q.dueBefore } : {}) } }
          : {}),
      };

      const [items, total] = await prisma.$transaction([
        prisma.task.findMany({
          where,
          include: { ...TASK_INCLUDE, project: { select: { id: true, name: true, key: true, color: true } } },
          orderBy: [{ dueDate: 'asc' }, { priority: 'desc' }],
          skip: (q.page - 1) * q.pageSize,
          take: q.pageSize,
        }),
        prisma.task.count({ where }),
      ]);
      return res.json({ items: items.map((t) => ({ ...t, progress: taskProgress(t) })), total });
    }

    await getProjectAccess(req.user!.id, req.user!.role, q.projectId);

    const where = {
      projectId: q.projectId,
      ...(q.boardId ? { boardId: q.boardId } : {}),
      ...(q.assigneeId ? { assignees: { some: { userId: q.assigneeId } } } : {}),
      ...(q.status ? { status: q.status as any } : {}),
      ...(q.priority ? { priority: q.priority as any } : {}),
      ...(q.q ? { title: { contains: q.q, mode: 'insensitive' as const } } : {}),
      ...(q.dueBefore || q.dueAfter
        ? { dueDate: { ...(q.dueAfter ? { gte: q.dueAfter } : {}), ...(q.dueBefore ? { lte: q.dueBefore } : {}) } }
        : {}),
      ...(q.includeCompleted === 'false' ? { status: { notIn: ['DONE', 'CANCELLED'] as any } } : {}),
    };

    const tasks = await prisma.task.findMany({
      where,
      include: TASK_INCLUDE,
      orderBy: [{ position: 'asc' }],
    });

    res.json({ items: tasks.map((t) => ({ ...t, progress: taskProgress(t) })), total: tasks.length });
  }),
);

/** GET /api/tasks/:id — full task drawer payload (comments + activity included). */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { task } = await getTaskAccess(req.user!.id, req.user!.role, req.params.id);
    const full = await prisma.task.findUniqueOrThrow({
      where: { id: task.id },
      include: {
        ...TASK_INCLUDE,
        project: { select: { id: true, name: true, key: true, color: true } },
        createdBy: { select: { id: true, name: true, avatarUrl: true } },
        comments: {
          where: { parentId: null },
          orderBy: { createdAt: 'asc' },
          include: {
            author: { select: { id: true, name: true, avatarUrl: true } },
            mentions: { select: { userId: true } },
            replies: {
              orderBy: { createdAt: 'asc' },
              include: { author: { select: { id: true, name: true, avatarUrl: true } } },
            },
            attachments: true,
          },
        },
        attachments: true,
        timeEntries: { include: { user: { select: { id: true, name: true } } }, orderBy: { startedAt: 'desc' } },
      },
    });
    res.json({ task: { ...full, progress: taskProgress(full) } });
  }),
);

/** POST /api/tasks — create inside a project (EDIT access minimum). */
router.post(
  '/',
  validate({
    body: z.object({
      projectId: uuid,
      title: z.string().min(2).max(200),
      description: z.string().max(20000).nullable().optional(),
      status: statusEnum.default('TODO'),
      priority: priorityEnum.default('MEDIUM'),
      columnId: uuid.nullable().optional(),
      boardId: uuid.nullable().optional(),
      startDate: z.coerce.date().nullable().optional(),
      dueDate: z.coerce.date().nullable().optional(),
      estimateMins: z.number().int().min(0).max(100000).nullable().optional(),
      assigneeIds: z.array(uuid).default([]),
      tagIds: z.array(uuid).default([]),
      subtasks: z.array(z.string().min(1).max(300)).default([]),
    }),
  }),
  asyncHandler(async (req, res) => {
    const body = req.body as any;
    const { project, level } = await getProjectAccess(
      req.user!.id,
      req.user!.role,
      body.projectId,
      'EDIT',
    );

    // Default column resolution so the card always lands somewhere sensible.
    let columnId: string | null = body.columnId ?? null;
    let boardId: string | null = body.boardId ?? null;
    if (!columnId) {
      const column = await prisma.boardColumn.findFirst({
        where: { board: { projectId: project.id }, status: body.status },
        orderBy: { position: 'asc' },
        select: { id: true, boardId: true },
      });
      columnId = column?.id ?? null;
      boardId = column?.boardId ?? boardId;
    }

    const last = await prisma.task.findFirst({
      where: { columnId },
      orderBy: { position: 'desc' },
      select: { position: true },
    });

    const assigneeIds: string[] = [...new Set(body.assigneeIds as string[])].filter((id) => id !== '');
    if (assigneeIds.length) {
      const valid = await prisma.projectMember.count({
        where: { projectId: project.id, userId: { in: assigneeIds } },
      });
      if (valid !== assigneeIds.length) throw badRequest('Assignees must be project members');
    }

    const task = await prisma.task.create({
      data: {
        projectId: project.id,
        boardId,
        columnId,
        title: body.title,
        description: body.description ?? null,
        status: body.status,
        priority: body.priority,
        position: (last?.position ?? 0) + 1000,
        startDate: body.startDate ?? null,
        dueDate: body.dueDate ?? null,
        estimateMins: body.estimateMins ?? null,
        createdById: req.user!.id,
        assignees: { create: assigneeIds.map((userId) => ({ userId })) },
        tags: body.tagIds.length ? { connect: body.tagIds.map((id: string) => ({ id })) } : undefined,
        subtasks: {
          create: (body.subtasks as string[]).map((title, i) => ({ title, position: i })),
        },
      },
      include: TASK_INCLUDE,
    });

    await logActivity({
      actorId: req.user!.id,
      projectId: project.id,
      action: 'TASK_CREATED',
      entityType: 'TASK',
      entityId: task.id,
      taskId: task.id,
      metadata: { title: task.title, status: task.status },
      ipAddress: req.ip,
    });

    await notify(
      assigneeIds
        .filter((id) => id !== req.user!.id)
        .map((userId) => ({
          userId,
          type: 'TASK_ASSIGNED' as const,
          body: `${req.user!.name} assigned you "${task.title}" in ${project.name}.`,
          entityType: 'TASK',
          entityId: task.id,
          cta: { label: 'Open task', url: `http://localhost:5173/projects/${project.id}?task=${task.id}` },
        })),
    );

    emitToProject(project.id, 'task:created', { ...task, progress: taskProgress(task), actorId: req.user!.id });
    res.status(201).json({ task: { ...task, progress: taskProgress(task) }, accessLevel: level });
  }),
);

/** PATCH /api/tasks/:id — partial update; assignee delta triggers notifications. */
router.patch(
  '/:id',
  validate({
    body: z.object({
      title: z.string().min(2).max(200).optional(),
      description: z.string().max(20000).nullable().optional(),
      priority: priorityEnum.optional(),
      startDate: z.coerce.date().nullable().optional(),
      dueDate: z.coerce.date().nullable().optional(),
      estimateMins: z.number().int().min(0).nullable().optional(),
      assigneeIds: z.array(uuid).optional(),
      tagIds: z.array(uuid).optional(),
      subtasks: z.array(z.object({ id: uuid.optional(), title: z.string().min(1), isDone: z.boolean().default(false) })).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { task: scope, access } = await getTaskAccess(req.user!.id, req.user!.role, req.params.id, 'EDIT');
    const body = req.body as any;

    const current = await prisma.task.findUniqueOrThrow({
      where: { id: scope.id },
      select: { assignees: { select: { userId: true } }, title: true },
    });
    const currentAssignees = current.assignees.map((a) => a.userId);
    const nextAssignees: string[] | undefined = body.assigneeIds;
    const addedAssignees = nextAssignees
      ? nextAssignees.filter((id: string) => !currentAssignees.includes(id))
      : [];

    const updated = await prisma.$transaction(async (tx) => {
      if (nextAssignees) {
        await tx.taskAssignee.deleteMany({
          where: { taskId: scope.id, userId: { notIn: nextAssignees.length ? nextAssignees : ['__none__'] } },
        });
        if (nextAssignees.length) {
          await tx.taskAssignee.createMany({
            data: nextAssignees.map((userId: string) => ({ taskId: scope.id, userId })),
            skipDuplicates: true,
          });
        }
      }

      if (body.subtasks) {
        const existing = await tx.subtask.findMany({ where: { taskId: scope.id }, select: { id: true } });
        const keepIds = body.subtasks.flatMap((s: any) => (s.id ? [s.id] : []));
        await tx.subtask.deleteMany({ where: { taskId: scope.id, id: { notIn: keepIds.length ? keepIds : ['__none__'] } } });
        for (const [i, s] of body.subtasks.entries()) {
          if (s.id && existing.some((e) => e.id === s.id)) {
            await tx.subtask.update({ where: { id: s.id }, data: { title: s.title, isDone: s.isDone, position: i } });
          } else {
            await tx.subtask.create({ data: { taskId: scope.id, title: s.title, isDone: s.isDone, position: i } });
          }
        }
      }

      return tx.task.update({
        where: { id: scope.id },
        data: {
          ...(body.title !== undefined && { title: body.title }),
          ...(body.description !== undefined && { description: body.description }),
          ...(body.priority !== undefined && { priority: body.priority }),
          ...(body.startDate !== undefined && { startDate: body.startDate }),
          ...(body.dueDate !== undefined && { dueDate: body.dueDate }),
          ...(body.estimateMins !== undefined && { estimateMins: body.estimateMins }),
          ...(body.tagIds !== undefined && { tags: { set: body.tagIds.map((id: string) => ({ id })) } }),
        },
        include: TASK_INCLUDE,
      });
    });

    await logActivity({
      actorId: req.user!.id,
      projectId: access.project.id,
      action: 'TASK_UPDATED',
      entityType: 'TASK',
      entityId: updated.id,
      taskId: updated.id,
      metadata: { fields: Object.keys(body) },
      ipAddress: req.ip,
    });

    await notify(
      addedAssignees
        .filter((id) => id !== req.user!.id)
        .map((userId) => ({
          userId,
          type: 'TASK_ASSIGNED' as const,
          body: `${req.user!.name} assigned you "${updated.title}".`,
          entityType: 'TASK',
          entityId: updated.id,
        })),
    );

    emitToProject(access.project.id, 'task:updated', {
      ...updated,
      progress: taskProgress(updated),
      actorId: req.user!.id,
    });
    res.json({ task: { ...updated, progress: taskProgress(updated) }, accessLevel: access.level });
  }),
);

/**
 * PATCH /api/tasks/:id/move — the drag & drop hot path.
 * Body: { status, columnId, beforeId?, afterId? }
 */
router.patch(
  '/:id/move',
  validate({
    body: z.object({
      status: statusEnum,
      columnId: uuid.nullable().optional(),
      boardId: uuid.nullable().optional(),
      beforeId: uuid.nullable().optional(),
      afterId: uuid.nullable().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { task: scope, access } = await getTaskAccess(req.user!.id, req.user!.role, req.params.id, 'EDIT');
    const body = req.body as any;

    const previous = await prisma.task.findUniqueOrThrow({
      where: { id: scope.id },
      select: { status: true, title: true, assignees: { select: { userId: true } } },
    });

    const updated = await moveTask({
      taskId: scope.id,
      projectId: access.project.id,
      status: body.status,
      columnId: body.columnId ?? null,
      beforeId: body.beforeId ?? null,
      afterId: body.afterId ?? null,
      actorId: req.user!.id,
    });

    emitToProject(access.project.id, 'task:moved', {
      id: updated.id,
      projectId: updated.projectId,
      status: updated.status,
      columnId: updated.columnId,
      position: updated.position,
      updatedAt: updated.updatedAt,
      progress: taskProgress(updated),
      actorId: req.user!.id,
      from: previous.status,
    });

    if (previous.status !== updated.status) {
      await notify(
        previous.assignees
          .map((a) => a.userId)
          .filter((id) => id !== req.user!.id)
          .map((userId) => ({
            userId,
            type: 'TASK_STATUS_CHANGED' as const,
            body: `"${updated.title}" moved from ${previous.status.replace('_', ' ')} to ${updated.status.replace('_', ' ')}.`,
            entityType: 'TASK',
            entityId: updated.id,
          })),
      );
    }

    res.json({ task: updated });
  }),
);

/** GET /api/tasks/:id/activity — task-level audit feed (task + its comments). */
router.get(
  '/:id/activity',
  asyncHandler(async (req, res) => {
    const { task } = await getTaskAccess(req.user!.id, req.user!.role, req.params.id);
    const commentIds = await prisma.comment.findMany({
      where: { taskId: task.id },
      select: { id: true },
      take: 500,
    });
    const items = await prisma.activityLog.findMany({
      where: {
        OR: [
          { entityType: 'TASK', entityId: task.id },
          { entityType: 'COMMENT', entityId: { in: commentIds.map((c) => c.id) } },
        ],
      },
      include: { actor: { select: { id: true, name: true, avatarUrl: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json({ items });
  }),
);

/** POST /api/tasks/:id/time — log time against a task. */
router.post(
  '/:id/time',
  validate({ body: z.object({ minutes: z.number().int().min(1).max(1440), note: z.string().max(500).optional(), startedAt: z.coerce.date().default(() => new Date()) }) }),
  asyncHandler(async (req, res) => {
    const { task, access } = await getTaskAccess(req.user!.id, req.user!.role, req.params.id, 'EDIT');
    const entry = await prisma.timeEntry.create({
      data: { taskId: task.id, userId: req.user!.id, ...req.body },
    });
    res.status(201).json({ entry, projectId: access.project.id });
  }),
);

/** DELETE /api/tasks/:id — creators, project leads and admins. */
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { task, access } = await getTaskAccess(req.user!.id, req.user!.role, req.params.id, 'EDIT');
    const canDelete =
      req.user!.role === 'ADMIN' || access.level === 'MANAGE' || task.createdById === req.user!.id;
    if (!canDelete) throw badRequest('Only the creator, project lead or an admin can delete this task');

    await prisma.task.delete({ where: { id: task.id } });
    await logActivity({
      actorId: req.user!.id,
      projectId: access.project.id,
      action: 'TASK_DELETED',
      entityType: 'TASK',
      entityId: task.id,
      metadata: { title: task.title },
      ipAddress: req.ip,
    });
    emitToProject(access.project.id, 'task:deleted', { id: task.id, actorId: req.user!.id });
    res.status(204).send();
  }),
);

export default router;
