import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/http';
import { badRequest, notFound } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { getTaskAccess } from '../services/access.service';
import { logActivity } from '../services/activity.service';
import { notify } from '../services/mail.service';
import { emitToProject } from '../realtime/io';

const router = Router();
router.use(authenticate);

const MENTION_RE = /@\[([^\]]+)\]\(([0-9a-f-]{36})\)/g;

function extractMentions(body: string): string[] {
  const ids = new Set<string>();
  for (const match of body.matchAll(MENTION_RE)) ids.add(match[2]!);
  return [...ids];
}

const commentInclude = {
  author: { select: { id: true, name: true, avatarUrl: true, role: true } },
  mentions: { select: { userId: true } },
  replies: {
    orderBy: { createdAt: 'asc' as const },
    include: { author: { select: { id: true, name: true, avatarUrl: true } } },
  },
  attachments: true,
};

/** GET /api/tasks/:taskId/comments — threaded roots with one level of replies. */
router.get(
  '/tasks/:taskId/comments',
  asyncHandler(async (req, res) => {
    const { task } = await getTaskAccess(req.user!.id, req.user!.role, req.params.taskId);
    const comments = await prisma.comment.findMany({
      where: { taskId: task.id, parentId: null, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      include: commentInclude,
    });
    res.json({ items: comments });
  }),
);

/**
 * POST /api/tasks/:taskId/comments
 * Markdown body with mention syntax: @[Jane Doe](uuid). Mentions notify the
 * mentioned users; other assignees receive a lighter COMMENT_ADDED ping.
 */
router.post(
  '/tasks/:taskId/comments',
  validate({
    body: z.object({
      body: z.string().min(1).max(10000),
      parentId: z.string().uuid().nullable().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { task, access } = await getTaskAccess(req.user!.id, req.user!.role, req.params.taskId, 'EDIT');
    const mentionIds = extractMentions(req.body.body);

    if (req.body.parentId) {
      const parent = await prisma.comment.findFirst({
        where: { id: req.body.parentId, taskId: task.id },
        select: { id: true, parentId: true },
      });
      if (!parent) throw notFound('Parent comment not found');
      if (parent.parentId) throw badRequest('Replies are limited to one level of threading');
    }

    if (mentionIds.length) {
      const valid = await prisma.projectMember.findMany({
        where: { projectId: access.project.id, userId: { in: mentionIds } },
        select: { userId: true },
      });
      if (valid.length !== mentionIds.length) throw badRequest('Mentioned users must be project members');
    }

    const comment = await prisma.comment.create({
      data: {
        taskId: task.id,
        authorId: req.user!.id,
        body: req.body.body,
        parentId: req.body.parentId ?? null,
        mentions: { create: mentionIds.map((userId) => ({ userId })) },
      },
      include: commentInclude,
    });

    const assignees = await prisma.taskAssignee.findMany({
      where: { taskId: task.id },
      select: { userId: true },
    });

    await notify([
      ...mentionIds
        .filter((id) => id !== req.user!.id)
        .map((userId) => ({
          userId,
          type: 'COMMENT_MENTION' as const,
          body: `${req.user!.name} mentioned you on "${task.title}".`,
          entityType: 'TASK',
          entityId: task.id,
        })),
      ...assignees
        .map((a) => a.userId)
        .filter((id) => id !== req.user!.id && !mentionIds.includes(id))
        .map((userId) => ({
          userId,
          type: 'COMMENT_ADDED' as const,
          body: `${req.user!.name} commented on "${task.title}".`,
          entityType: 'TASK',
          entityId: task.id,
        })),
    ]);

    await logActivity({
      actorId: req.user!.id,
      projectId: access.project.id,
      action: 'COMMENT_CREATED',
      entityType: 'COMMENT',
      entityId: comment.id,
      taskId: task.id,
      metadata: { mentions: mentionIds },
      ipAddress: req.ip,
    });

    emitToProject(access.project.id, 'comment:created', {
      taskId: task.id,
      comment,
      actorId: req.user!.id,
    });
    res.status(201).json({ comment });
  }),
);

/** PATCH /api/comments/:id — author edits, or an admin. */
router.patch(
  '/:id',
  validate({ body: z.object({ body: z.string().min(1).max(10000) }) }),
  asyncHandler(async (req, res) => {
    const existing = await prisma.comment.findUnique({
      where: { id: req.params.id },
      include: { task: { select: { projectId: true } } },
    });
    if (!existing || existing.deletedAt) throw notFound('Comment not found');
    if (existing.authorId !== req.user!.id && req.user!.role !== 'ADMIN') {
      throw badRequest('You can only edit your own comments');
    }
    const comment = await prisma.comment.update({
      where: { id: existing.id },
      data: { body: req.body.body, editedAt: new Date() },
      include: commentInclude,
    });
    emitToProject(existing.task.projectId, 'comment:updated', { taskId: existing.taskId, comment });
    res.json({ comment });
  }),
);

/** DELETE /api/comments/:id — soft delete; tombstones keep threads readable. */
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const existing = await prisma.comment.findUnique({
      where: { id: req.params.id },
      include: { task: { select: { projectId: true } } },
    });
    if (!existing) throw notFound('Comment not found');
    if (existing.authorId !== req.user!.id && req.user!.role !== 'ADMIN') {
      throw badRequest('You can only delete your own comments');
    }
    await prisma.comment.update({
      where: { id: existing.id },
      data: { deletedAt: new Date(), body: '[deleted]' },
    });
    emitToProject(existing.task.projectId, 'comment:deleted', {
      taskId: existing.taskId,
      commentId: existing.id,
      actorId: req.user!.id,
    });
    res.status(204).send();
  }),
);

export default router;
