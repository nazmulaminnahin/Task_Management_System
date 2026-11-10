import type { Prisma, ProjectRole, Role } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { forbidden, notFound } from '../lib/errors';

export type AccessLevel = 'VIEW' | 'EDIT' | 'MANAGE';

export interface ProjectAccess {
  project: Prisma.ProjectGetPayload<{ include: { members: true } }>;
  level: AccessLevel;
  isMember: boolean;
  projectRole: ProjectRole | null;
}

const RANK: Record<AccessLevel, number> = { VIEW: 1, EDIT: 2, MANAGE: 3 };

/**
 * Single source of truth for project scoping. Every project/task endpoint funnels
 * through here so the RBAC matrix lives in exactly one place:
 *
 *  ADMIN     → MANAGE on everything
 *  Owner/LEAD→ MANAGE
 *  MEMBER    → EDIT
 *  VIEWER    → VIEW
 *  Non-member→ 404 (never 403 — do not leak project existence)
 */
export async function getProjectAccess(
  userId: string,
  role: Role,
  projectId: string,
  required: AccessLevel = 'VIEW',
): Promise<ProjectAccess> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { members: { where: { userId } } },
  });
  if (!project) throw notFound('Project not found');

  const membership = project.members[0] ?? null;
  const isOwner = project.ownerId === userId;

  let level: AccessLevel | null = null;
  if (role === 'ADMIN') level = 'MANAGE';
  else if (isOwner || membership?.projectRole === 'LEAD') level = 'MANAGE';
  else if (membership?.projectRole === 'MEMBER') level = 'EDIT';
  else if (membership?.projectRole === 'VIEWER') level = 'VIEW';
  // Personal workspaces are strictly private, even to managers.
  else if (project.type === 'PERSONAL' && project.ownerId === userId) level = 'MANAGE';

  if (!level) throw notFound('Project not found');
  if (RANK[level] < RANK[required]) {
    throw forbidden(`This action requires ${required.toLowerCase()} access to the project`);
  }

  return {
    project,
    level,
    isMember: Boolean(membership) || isOwner,
    projectRole: isOwner ? 'LEAD' : (membership?.projectRole ?? null),
  };
}

/**
 * Task-level scoping: resolves the task's project and checks access there.
 * Used by every /tasks/:id handler, including comment and attachment routes.
 */
export async function getTaskAccess(
  userId: string,
  role: Role,
  taskId: string,
  required: AccessLevel = 'VIEW',
) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, projectId: true, createdById: true, title: true, boardId: true },
  });
  if (!task) throw notFound('Task not found');
  const access = await getProjectAccess(userId, role, task.projectId, required);
  return { task, access };
}

/** Members of a project (ids only) — used for realtime notification fan-out. */
export async function getProjectMemberIds(projectId: string): Promise<string[]> {
  const rows = await prisma.projectMember.findMany({
    where: { projectId },
    select: { userId: true },
  });
  return rows.map((r) => r.userId);
}
