import { Router } from 'express';
import { asyncHandler } from '../lib/http';
import { prisma } from '../lib/prisma';
import { authenticate, authorize } from '../middleware/auth';
import { getProjectAccess } from '../services/access.service';

const router = Router();
router.use(authenticate);

const DAY = 24 * 60 * 60 * 1000;
const startOfDay = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const daysAgo = (n: number) => new Date(startOfDay().getTime() - n * DAY);

/** Buckets rows into the last N days for sparkline/area charts. */
function dailySeries(dates: Date[], days: number) {
  const buckets = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) {
    const d = daysAgo(i);
    buckets.set(d.toISOString().slice(0, 10), 0);
  }
  for (const date of dates) {
    const key = date.toISOString().slice(0, 10);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return [...buckets.entries()].map(([date, count]) => ({ date, count }));
}

/** GET /api/analytics/admin — platform health (ADMIN only). */
router.get(
  '/admin',
  authorize('ADMIN'),
  asyncHandler(async (_req, res) => {
    const [roleSplit, activeUsers, totalProjects, totalTasks, tasksByStatus, recentSignups, loginsByDay, topProjects] =
      await Promise.all([
        prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
        prisma.user.count({ where: { isActive: true } }),
        prisma.project.count({ where: { archivedAt: null } }),
        prisma.task.count(),
        prisma.task.groupBy({ by: ['status'], _count: { _all: true } }),
        prisma.user.findMany({ select: { createdAt: true }, where: { createdAt: { gte: daysAgo(30) } } }),
        prisma.activityLog.findMany({
          where: { action: 'AUTH_LOGIN', createdAt: { gte: daysAgo(14) } },
          select: { createdAt: true },
        }),
        prisma.project.findMany({
          where: { archivedAt: null },
          select: { id: true, name: true, color: true, _count: { select: { tasks: true, members: true } } },
          orderBy: { tasks: { _count: 'desc' } },
          take: 6,
        }),
      ]);

    const totalUsers = roleSplit.reduce((sum, r) => sum + r._count._all, 0);

    res.json({
      kpis: {
        totalUsers,
        activeUsers,
        totalProjects,
        totalTasks,
        completionRate: totalTasks
          ? Math.round(((tasksByStatus.find((s) => s.status === 'DONE')?._count._all ?? 0) / totalTasks) * 100)
          : 0,
      },
      roleDistribution: roleSplit.map((r) => ({ role: r.role, count: r._count._all })),
      tasksByStatus: tasksByStatus.map((s) => ({ status: s.status, count: s._count._all })),
      signups: dailySeries(recentSignups.map((u) => u.createdAt), 30),
      logins: dailySeries(loginsByDay.map((l) => l.createdAt), 14),
      topProjects,
    });
  }),
);

/** GET /api/analytics/workload — manager/admin: per-user open vs overdue load. */
router.get(
  '/workload',
  authorize('ADMIN', 'MANAGER'),
  asyncHandler(async (_req, res) => {
    const now = new Date();
    const users = await prisma.user.findMany({
      where: { isActive: true, role: { in: ['EMPLOYEE', 'MANAGER'] } },
      select: { id: true, name: true, avatarUrl: true, assignments: { select: { task: { select: { status: true, dueDate: true } } } } },
      take: 50,
    });

    res.json({
      items: users
        .map((u) => {
          const open = u.assignments.filter((a) => !['DONE', 'CANCELLED'].includes(a.task.status));
          return {
            userId: u.id,
            name: u.name,
            avatarUrl: u.avatarUrl,
            openTasks: open.length,
            overdue: open.filter((a) => a.task.dueDate && a.task.dueDate < now).length,
            inProgress: open.filter((a) => a.task.status === 'IN_PROGRESS').length,
          };
        })
        .sort((a, b) => b.openTasks - a.openTasks),
    });
  }),
);

/** GET /api/analytics/project/:id — velocity, status mix, workload, overdue watchlist. */
router.get(
  '/project/:id',
  asyncHandler(async (req, res) => {
    const { project } = await getProjectAccess(req.user!.id, req.user!.role, req.params.id);
    const now = new Date();

    const [tasks, completed, members] = await Promise.all([
      prisma.task.findMany({
        where: { projectId: project.id },
        select: { status: true, priority: true, dueDate: true, completedAt: true, createdAt: true, assignees: { select: { userId: true } } },
      }),
      prisma.task.findMany({
        where: { projectId: project.id, status: 'DONE', completedAt: { gte: daysAgo(56) } },
        select: { completedAt: true },
      }),
      prisma.projectMember.findMany({
        where: { projectId: project.id },
        select: { user: { select: { id: true, name: true, avatarUrl: true } } },
      }),
    ]);

    // Weekly velocity: completed tasks per ISO week for the last 8 weeks.
    const weeks: Array<{ week: string; completed: number }> = [];
    for (let i = 7; i >= 0; i--) {
      const end = daysAgo(i * 7);
      const start = new Date(end.getTime() - 7 * DAY);
      weeks.push({
        week: `W-${i}`,
        completed: completed.filter((t) => t.completedAt && t.completedAt >= start && t.completedAt < end).length,
      });
    }

    const total = tasks.length;
    const done = tasks.filter((t) => t.status === 'DONE').length;

    res.json({
      kpis: {
        total,
        done,
        open: total - done,
        overdue: tasks.filter((t) => t.dueDate && t.dueDate < now && t.status !== 'DONE').length,
        progress: total ? Math.round((done / total) * 100) : 0,
        velocity: weeks.at(-1)?.completed ?? 0,
      },
      statusMix: Object.entries(
        tasks.reduce<Record<string, number>>((acc, t) => ({ ...acc, [t.status]: (acc[t.status] ?? 0) + 1 }), {}),
      ).map(([status, count]) => ({ status, count })),
      priorityMix: Object.entries(
        tasks.reduce<Record<string, number>>((acc, t) => ({ ...acc, [t.priority]: (acc[t.priority] ?? 0) + 1 }), {}),
      ).map(([priority, count]) => ({ priority, count })),
      velocity: weeks,
      workload: members.map(({ user }) => {
        const assigned = tasks.filter((t) => t.assignees.some((a) => a.userId === user.id));
        return {
          userId: user.id,
          name: user.name,
          avatarUrl: user.avatarUrl,
          open: assigned.filter((t) => !['DONE', 'CANCELLED'].includes(t.status)).length,
          done: assigned.filter((t) => t.status === 'DONE').length,
        };
      }),
      overdueTasks: await prisma.task.findMany({
        where: { projectId: project.id, dueDate: { lt: now }, status: { notIn: ['DONE', 'CANCELLED'] } },
        select: { id: true, title: true, dueDate: true, priority: true, assignees: { select: { user: { select: { id: true, name: true } } } } },
        orderBy: { dueDate: 'asc' },
        take: 10,
      }),
    });
  }),
);

/** GET /api/analytics/me — personal dashboard: today, this week, completion trend, streak. */
router.get(
  '/me',
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const todayStart = startOfDay();
    const todayEnd = new Date(todayStart.getTime() + DAY);

    const [assigned, completedWeek, upcoming, recentActivity] = await Promise.all([
      prisma.taskAssignee.findMany({
        where: { userId, task: { status: { notIn: ['DONE', 'CANCELLED'] } } },
        select: {
          task: {
            select: {
              id: true,
              title: true,
              status: true,
              priority: true,
              dueDate: true,
              project: { select: { id: true, name: true, color: true, key: true } },
            },
          },
        },
      }),
      prisma.task.findMany({
        where: { assignees: { some: { userId } }, status: 'DONE', completedAt: { gte: daysAgo(30) } },
        select: { completedAt: true },
      }),
      prisma.task.findMany({
        where: {
          assignees: { some: { userId } },
          status: { notIn: ['DONE', 'CANCELLED'] },
          dueDate: { gte: todayStart, lt: new Date(todayEnd.getTime() + 7 * DAY) },
        },
        select: { id: true, title: true, dueDate: true, priority: true },
        orderBy: { dueDate: 'asc' },
        take: 8,
      }),
      prisma.activityLog.findMany({
        where: { actorId: userId },
        orderBy: { createdAt: 'desc' },
        take: 12,
        select: { id: true, action: true, entityType: true, entityId: true, metadata: true, createdAt: true },
      }),
    ]);

    const open = assigned.map((a) => a.task);
    const today = open.filter((t) => t.dueDate && t.dueDate >= todayStart && t.dueDate < todayEnd);
    const overdue = open.filter((t) => t.dueDate && t.dueDate < todayStart);
    const completionSeries = dailySeries(completedWeek.map((t) => t.completedAt!), 30);

    // Streak = consecutive days with at least one completion, ending today/yesterday.
    let streak = 0;
    for (let i = completionSeries.length - 1; i >= 0; i--) {
      if ((completionSeries[i]?.count ?? 0) > 0) streak += 1;
      else if (i === completionSeries.length - 1) continue;
      else break;
    }

    res.json({
      kpis: {
        open: open.length,
        dueToday: today.length,
        overdue: overdue.length,
        completed30d: completedWeek.length,
        streak,
      },
      todayTasks: today,
      upcoming,
      completionSeries,
      recentActivity,
    });
  }),
);

export default router;
