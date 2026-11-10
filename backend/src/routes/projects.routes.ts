import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/http';
import { badRequest, conflict } from '../lib/errors';
import type { ProjectStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { authenticate, authorize } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { getProjectAccess } from '../services/access.service';
import { logActivity } from '../services/activity.service';
import { notify } from '../services/mail.service';
import { DEFAULT_COLUMNS } from '../services/task.service';
import { emitToProject } from '../realtime/io';

const router = Router();
router.use(authenticate);

const projectCard = {
  owner: { select: { id: true, name: true, avatarUrl: true } },
  _count: { select: { tasks: true, members: true } },
} as const;

/**
 * GET /api/projects
 * Role-aware scoping:
 *  ADMIN    → all projects (optional ?scope=mine)
 *  MANAGER  → assigned team projects + projects they own
 *  EMPLOYEE → projects they belong to
 *  INDIVIDUAL → their private personal workspace(s) only
 */
router.get(
  '/',
  validate({
    query: z.object({
      scope: z.enum(['all', 'mine', 'personal']).default('mine'),
      status: z.enum(['PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED']).optional(),
      q: z.string().trim().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { scope, status, q } = req.query as unknown as { scope: string; status?: string; q?: string };
    const user = req.user!;

    const filters: any[] = [];
    if (scope === 'personal' || user.role === 'INDIVIDUAL') {
      filters.push({ type: 'PERSONAL', ownerId: user.id });
    }
    if (scope === 'mine' || user.role !== 'ADMIN') {
      filters.push({ ownerId: user.id }, { members: { some: { userId: user.id } } });
    }
    // ADMIN + scope=all → no scoping clause.

    const where = {
      ...(filters.length ? { OR: filters } : {}),
      ...(status ? { status: status as ProjectStatus } : {}),
      ...(q ? { name: { contains: q, mode: 'insensitive' as const } } : {}),
      archivedAt: null,
    };

    const projects = await prisma.project.findMany({
      where,
      include: projectCard,
      orderBy: [{ updatedAt: 'desc' }],
    });
    res.json({ items: projects });
  }),
);

/** POST /api/projects — managers/admins create team projects; anyone can create a personal board. */
router.post(
  '/',
  validate({
    body: z.object({
      name: z.string().min(2).max(120),
      key: z.string().min(2).max(10).regex(/^[A-Z][A-Z0-9]+$/i, 'Key must be alphanumeric').optional(),
      description: z.string().max(4000).optional(),
      type: z.enum(['TEAM', 'PERSONAL']).default('TEAM'),
      color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
      startDate: z.coerce.date().optional(),
      dueDate: z.coerce.date().optional(),
      memberIds: z.array(z.string().uuid()).default([]),
    }),
  }),
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const body = req.body as {
      name: string;
      key?: string;
      description?: string;
      type: 'TEAM' | 'PERSONAL';
      color?: string;
      startDate?: Date;
      dueDate?: Date;
      memberIds: string[];
    };

    if (body.type === 'TEAM' && user.role !== 'ADMIN' && user.role !== 'MANAGER') {
      throw badRequest('Only managers and admins can create team projects');
    }

    const key =
      (body.key?.toUpperCase() as string | undefined) ??
      body.name
        .replace(/[^a-zA-Z0-9]/g, '')
        .slice(0, 6)
        .toUpperCase()
        .padEnd(3, 'X');

    const existing = await prisma.project.findUnique({ where: { key }, select: { id: true } });
    if (existing) throw conflict(`Project key "${key}" is already in use`, 'KEY_TAKEN');

    const project = await prisma.project.create({
      data: {
        name: body.name,
        key,
        description: body.description,
        type: body.type,
        color: body.color ?? '#6366f1',
        startDate: body.startDate,
        dueDate: body.dueDate,
        ownerId: user.id,
        ...(body.type === 'TEAM'
          ? {
              members: {
                create: [
                  { userId: user.id, projectRole: 'LEAD' as const },
                  ...body.memberIds
                    .filter((id: string) => id !== user.id)
                    .map((id: string) => ({ userId: id, projectRole: 'MEMBER' as const })),
                ],
              },
            }
          : { members: { create: [{ userId: user.id, projectRole: 'LEAD' as const }] } }),
      },
      include: projectCard,
    });

    // Every new project ships with a default Kanban board.
    await prisma.board.create({
      data: {
        projectId: project.id,
        name: 'Main board',
        columns: {
          create: DEFAULT_COLUMNS.map((c, i) => ({
            name: c.name,
            status: c.status,
            position: i,
            wipLimit: c.wipLimit,
          })),
        },
      },
    });

    await logActivity({
      actorId: user.id,
      projectId: project.id,
      action: 'PROJECT_CREATED',
      entityType: 'PROJECT',
      entityId: project.id,
      metadata: { name: project.name, type: project.type },
      ipAddress: req.ip,
    });

    if (body.type === 'TEAM' && body.memberIds.length) {
      await notify(
        body.memberIds
          .filter((id: string) => id !== user.id)
          .map((id: string) => ({
            userId: id,
            type: 'PROJECT_MEMBER_ADDED' as const,
            body: `${user.name} added you to the project "${project.name}".`,
            entityType: 'PROJECT',
            entityId: project.id,
          })),
      );
    }

    res.status(201).json({ project });
  }),
);

/** GET /api/projects/:id — full workspace payload (project + board columns + members). */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { project, level } = await getProjectAccess(req.user!.id, req.user!.role, req.params.id);
    const [members, boards, tags] = await prisma.$transaction([
      prisma.projectMember.findMany({
        where: { projectId: project.id },
        include: { user: { select: { id: true, name: true, email: true, avatarUrl: true, role: true } } },
        orderBy: { joinedAt: 'asc' },
      }),
      prisma.board.findMany({
        where: { projectId: project.id },
        include: { columns: { orderBy: { position: 'asc' } } },
        orderBy: { position: 'asc' },
      }),
      prisma.tag.findMany({ where: { projectId: project.id }, orderBy: { name: 'asc' } }),
    ]);

    const counts = await prisma.task.groupBy({
      by: ['status'],
      where: { projectId: project.id },
      _count: { _all: true },
    });

    res.json({
      project: { ...project, members: undefined },
      accessLevel: level,
      members: members.map((m) => ({ ...m.user, projectRole: m.projectRole, joinedAt: m.joinedAt })),
      boards,
      tags,
      taskCounts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
    });
  }),
);

/** PATCH /api/projects/:id — MANAGE access (owner, lead, admin). */
router.patch(
  '/:id',
  validate({
    body: z.object({
      name: z.string().min(2).max(120).optional(),
      description: z.string().max(4000).nullish(),
      status: z.enum(['PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED']).optional(),
      visibility: z.enum(['PRIVATE', 'TEAM']).optional(),
      color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
      startDate: z.coerce.date().nullish(),
      dueDate: z.coerce.date().nullish(),
    }),
  }),
  asyncHandler(async (req, res) => {
    await getProjectAccess(req.user!.id, req.user!.role, req.params.id, 'MANAGE');
    const project = await prisma.project.update({
      where: { id: req.params.id },
      data: req.body,
      include: projectCard,
    });
    await logActivity({
      actorId: req.user!.id,
      projectId: project.id,
      action: 'PROJECT_UPDATED',
      entityType: 'PROJECT',
      entityId: project.id,
      metadata: { changes: req.body },
      ipAddress: req.ip,
    });
    emitToProject(project.id, 'project:updated', project);
    res.json({ project });
  }),
);

/** POST /api/projects/:id/members — add member(s); MANAGE only. */
router.post(
  '/:id/members',
  validate({
    body: z.object({
      userIds: z.array(z.string().uuid()).min(1),
      projectRole: z.enum(['LEAD', 'MEMBER', 'VIEWER']).default('MEMBER'),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { project } = await getProjectAccess(req.user!.id, req.user!.role, req.params.id, 'MANAGE');
    const { userIds, projectRole } = req.body as { userIds: string[]; projectRole: 'LEAD' | 'MEMBER' | 'VIEWER' };

    const users = await prisma.user.findMany({
      where: { id: { in: userIds }, isActive: true },
      select: { id: true, name: true },
    });
    if (users.length !== userIds.length) throw badRequest('One or more users do not exist');

    await prisma.$transaction(
      userIds.map((userId) =>
        prisma.projectMember.upsert({
          where: { projectId_userId: { projectId: project.id, userId } },
          create: { projectId: project.id, userId, projectRole },
          update: { projectRole },
        }),
      ),
    );

    await logActivity({
      actorId: req.user!.id,
      projectId: project.id,
      action: 'PROJECT_MEMBER_ADDED',
      entityType: 'PROJECT',
      entityId: project.id,
      metadata: { userIds, projectRole },
      ipAddress: req.ip,
    });

    await notify(
      userIds.map((userId) => ({
        userId,
        type: 'PROJECT_MEMBER_ADDED' as const,
        body: `${req.user!.name} added you to "${project.name}" as ${projectRole.toLowerCase()}.`,
        entityType: 'PROJECT',
        entityId: project.id,
      })),
    );

    const members = await prisma.projectMember.findMany({
      where: { projectId: project.id },
      include: { user: { select: { id: true, name: true, email: true, avatarUrl: true, role: true } } },
    });
    res.json({ members: members.map((m) => ({ ...m.user, projectRole: m.projectRole, joinedAt: m.joinedAt })) });
  }),
);

/** DELETE /api/projects/:id/members/:userId — MANAGE only; owner cannot be removed. */
router.delete(
  '/:id/members/:userId',
  asyncHandler(async (req, res) => {
    const { project } = await getProjectAccess(req.user!.id, req.user!.role, req.params.id, 'MANAGE');
    if (project.ownerId === req.params.userId) throw badRequest('Transfer ownership before removing the owner');
    await prisma.projectMember.deleteMany({
      where: { projectId: project.id, userId: req.params.userId },
    });
    await logActivity({
      actorId: req.user!.id,
      projectId: project.id,
      action: 'PROJECT_MEMBER_REMOVED',
      entityType: 'PROJECT',
      entityId: project.id,
      metadata: { userId: req.params.userId },
      ipAddress: req.ip,
    });
    res.status(204).send();
  }),
);

/** DELETE /api/projects/:id — archive (admins may hard-delete with ?hard=true). */
router.delete(
  '/:id',
  authorize('ADMIN', 'MANAGER', 'EMPLOYEE', 'INDIVIDUAL'),
  asyncHandler(async (req, res) => {
    const { project } = await getProjectAccess(req.user!.id, req.user!.role, req.params.id, 'MANAGE');
    const hard = req.query.hard === 'true' && req.user!.role === 'ADMIN';
    if (hard) {
      await prisma.project.delete({ where: { id: project.id } });
    } else {
      await prisma.project.update({ where: { id: project.id }, data: { status: 'ARCHIVED', archivedAt: new Date() } });
    }
    await logActivity({
      actorId: req.user!.id,
      action: 'PROJECT_ARCHIVED',
      entityType: 'PROJECT',
      entityId: project.id,
      metadata: { hard },
      ipAddress: req.ip,
    });
    res.status(204).send();
  }),
);

/** POST /api/projects/:id/tags — create a reusable project tag. */
router.post(
  '/:id/tags',
  validate({
    body: z.object({ name: z.string().min(1).max(24), color: z.string().regex(/^#[0-9a-f]{6}$/i).default('#64748b') }),
  }),
  asyncHandler(async (req, res) => {
    await getProjectAccess(req.user!.id, req.user!.role, req.params.id, 'EDIT');
    const tag = await prisma.tag.create({ data: { ...req.body, projectId: req.params.id } });
    res.status(201).json({ tag });
  }),
);

export default router;
