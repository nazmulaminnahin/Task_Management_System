import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/http';
import { prisma } from '../lib/prisma';
import { authenticate, authorize } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();
router.use(authenticate, authorize('ADMIN'));

/** GET /api/audit — paginated, filterable audit trail (ADMIN). */
router.get(
  '/',
  validate({
    query: z.object({
      actorId: z.string().uuid().optional(),
      projectId: z.string().uuid().optional(),
      action: z.string().optional(),
      from: z.coerce.date().optional(),
      to: z.coerce.date().optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(200).default(50),
    }),
  }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as {
      actorId?: string;
      projectId?: string;
      action?: string;
      from?: Date;
      to?: Date;
      page: number;
      pageSize: number;
    };
    const where = {
      ...(q.actorId ? { actorId: q.actorId } : {}),
      ...(q.projectId ? { projectId: q.projectId } : {}),
      ...(q.action ? { action: q.action as any } : {}),
      ...(q.from || q.to
        ? { createdAt: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) } }
        : {}),
    };
    const [items, total] = await prisma.$transaction([
      prisma.activityLog.findMany({
        where,
        include: {
          actor: { select: { id: true, name: true, email: true, role: true } },
          project: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      prisma.activityLog.count({ where }),
    ]);
    res.json({ items, total, page: q.page, pageSize: q.pageSize });
  }),
);

export default router;
