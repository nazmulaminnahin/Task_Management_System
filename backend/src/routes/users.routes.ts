import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/http';
import { badRequest } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { hashPassword } from '../lib/password';
import { authenticate, authorize } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { publicUser } from '../services/auth.service';
import { logActivity } from '../services/activity.service';
import { notify } from '../services/mail.service';

const router = Router();
router.use(authenticate);

const listQuery = z.object({
  q: z.string().trim().optional(),
  role: z.enum(['ADMIN', 'MANAGER', 'EMPLOYEE', 'INDIVIDUAL']).optional(),
  isActive: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/** GET /api/users — directory. Admins/managers see everyone; others see active teammates (for mentions). */
router.get(
  '/',
  validate({ query: listQuery }),
  asyncHandler(async (req, res) => {
    const { q, role, isActive, page, pageSize } = req.query as unknown as z.infer<typeof listQuery>;
    const canSeeAll = req.user!.role === 'ADMIN' || req.user!.role === 'MANAGER';

    const where = {
      ...(canSeeAll ? {} : { isActive: true }),
      ...(role && canSeeAll ? { role } : {}),
      ...(isActive && canSeeAll ? { isActive: isActive === 'true' } : {}),
      ...(q
        ? { OR: [{ name: { contains: q, mode: 'insensitive' as const } }, { email: { contains: q, mode: 'insensitive' as const } }] }
        : {}),
    };

    const [items, total] = await prisma.$transaction([
      prisma.user.findMany({
        where,
        select: publicUser,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.user.count({ where }),
    ]);
    res.json({ items, total, page, pageSize });
  }),
);

/** GET /api/users/:id — profile (self, managers, admins). */
router.get(
  '/:id',
  authorize('ADMIN', 'MANAGER', 'EMPLOYEE', 'INDIVIDUAL'),
  asyncHandler(async (req, res) => {
    const isSelf = req.user!.id === req.params.id;
    const privileged = req.user!.role === 'ADMIN' || (req.user!.role === 'MANAGER' && !isSelf);
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { ...publicUser, _count: { select: { assignments: true, ownedProjects: true } } },
    });
    if (!user) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found' } });
    if (!isSelf && !privileged) {
      const { email: _omit, ...rest } = user;
      return res.json({ user: rest });
    }
    res.json({ user });
  }),
);

/** PATCH /api/users/me — profile + notification preferences. */
router.patch(
  '/me',
  validate({
    body: z.object({
      name: z.string().min(2).max(80).optional(),
      avatarUrl: z.string().url().or(z.literal('')).nullish(),
      emailNotifications: z.boolean().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: req.body,
      select: publicUser,
    });
    res.json({ user });
  }),
);

/** POST /api/users/me/password — change own password (revokes other sessions). */
router.post(
  '/me/password',
  validate({
    body: z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8).max(72) }),
  }),
  asyncHandler(async (req, res) => {
    const me = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
    const ok = await import('../lib/password').then((m) => m.verifyPassword(req.body.currentPassword, me.passwordHash));
    if (!ok) throw badRequest('Current password is incorrect');
    await prisma.$transaction([
      prisma.user.update({
        where: { id: me.id },
        data: { passwordHash: await hashPassword(req.body.newPassword) },
      }),
      prisma.refreshToken.updateMany({
        where: { userId: me.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    res.status(204).send();
  }),
);

/** POST /api/users — admin creates an account with any role. */
router.post(
  '/',
  authorize('ADMIN'),
  validate({
    body: z.object({
      email: z.string().email(),
      name: z.string().min(2).max(80),
      password: z.string().min(8).max(72),
      role: z.enum(['ADMIN', 'MANAGER', 'EMPLOYEE', 'INDIVIDUAL']).default('EMPLOYEE'),
    }),
  }),
  asyncHandler(async (req, res) => {
    const email = req.body.email.toLowerCase();
    const user = await prisma.user.create({
      data: { ...req.body, email, passwordHash: await hashPassword(req.body.password) },
      select: publicUser,
    });
    await prisma.activityLog.create({
      data: {
        actorId: req.user!.id,
        action: 'USER_CREATED',
        entityType: 'USER',
        entityId: user.id,
        metadata: { email: user.email, role: user.role },
        ipAddress: req.ip,
      },
    });
    res.status(201).json({ user });
  }),
);

/** PATCH /api/users/:id — admin CRUD on account details. */
router.patch(
  '/:id',
  authorize('ADMIN'),
  validate({
    body: z.object({
      name: z.string().min(2).max(80).optional(),
      email: z.string().email().optional(),
      isActive: z.boolean().optional(),
      avatarUrl: z.string().url().nullish(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { ...req.body, ...(req.body.email ? { email: req.body.email.toLowerCase() } : {}) },
      select: publicUser,
    });
    await logActivity({
      actorId: req.user!.id,
      action: req.body.isActive === false ? 'USER_DEACTIVATED' : 'USER_UPDATED',
      entityType: 'USER',
      entityId: user.id,
      metadata: { changes: req.body },
      ipAddress: req.ip,
    });
    res.json({ user });
  }),
);

/** PATCH /api/users/:id/role — the only path that can elevate privileges. */
router.patch(
  '/:id/role',
  authorize('ADMIN'),
  validate({ body: z.object({ role: z.enum(['ADMIN', 'MANAGER', 'EMPLOYEE', 'INDIVIDUAL']) }) }),
  asyncHandler(async (req, res) => {
    if (req.params.id === req.user!.id && req.body.role !== 'ADMIN') {
      throw badRequest('You cannot demote your own admin account');
    }
    const previous = await prisma.user.findUniqueOrThrow({
      where: { id: req.params.id },
      select: { role: true },
    });
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { role: req.body.role },
      select: publicUser,
    });
    // Revoke refresh tokens so the new role lands on the next access-token refresh.
    await prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await logActivity({
      actorId: req.user!.id,
      action: 'ROLE_CHANGED',
      entityType: 'USER',
      entityId: user.id,
      metadata: { from: previous.role, to: req.body.role },
      ipAddress: req.ip,
    });
    await notify([
      {
        userId: user.id,
        type: 'SYSTEM',
        body: `Your role was changed to ${req.body.role} by an administrator.`,
        entityType: 'USER',
        entityId: user.id,
      },
    ]);
    res.json({ user });
  }),
);

/** DELETE /api/users/:id — soft delete (deactivate). Hard delete stays a DBA operation. */
router.delete(
  '/:id',
  authorize('ADMIN'),
  asyncHandler(async (req, res) => {
    if (req.params.id === req.user!.id) throw badRequest('You cannot deactivate your own account');
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { isActive: false },
      select: publicUser,
    });
    await prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await logActivity({
      actorId: req.user!.id,
      action: 'USER_DEACTIVATED',
      entityType: 'USER',
      entityId: user.id,
      ipAddress: req.ip,
    });
    res.json({ user });
  }),
);

export default router;
