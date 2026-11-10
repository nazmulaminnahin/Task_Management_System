import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/http';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();
router.use(authenticate);

/** GET /api/notifications?unread=true&page=1 — newest first, paginated. */
router.get(
  '/',
  validate({
    query: z.object({
      unread: z.enum(['true', 'false']).default('false'),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(20),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { unread, page, pageSize } = req.query as unknown as {
      unread: string;
      page: number;
      pageSize: number;
    };
    const where = { userId: req.user!.id, ...(unread === 'true' ? { isRead: false } : {}) };
    const [items, total, unreadCount] = await prisma.$transaction([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { userId: req.user!.id, isRead: false } }),
    ]);
    res.json({ items, total, unreadCount });
  }),
);

/** PATCH /api/notifications/read — mark one or all as read. */
router.patch(
  '/read',
  validate({ body: z.object({ ids: z.array(z.string().uuid()).optional(), all: z.boolean().optional() }) }),
  asyncHandler(async (req, res) => {
    const { ids, all } = req.body as { ids?: string[]; all?: boolean };
    if (!all && !ids?.length) return res.status(204).send();
    await prisma.notification.updateMany({
      where: { userId: req.user!.id, isRead: false, ...(all ? {} : { id: { in: ids } }) },
      data: { isRead: true, readAt: new Date() },
    });
    res.status(204).send();
  }),
);

export default router;
