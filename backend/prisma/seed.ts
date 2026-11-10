/* eslint-disable no-console */
import { PrismaClient, type TaskStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const DAY = 24 * 60 * 60 * 1000;
const days = (n: number) => new Date(Date.now() + n * DAY);

const COLUMNS: Array<{ name: string; status: TaskStatus; wipLimit?: number }> = [
  { name: 'Backlog', status: 'BACKLOG' },
  { name: 'To do', status: 'TODO', wipLimit: 12 },
  { name: 'In progress', status: 'IN_PROGRESS', wipLimit: 6 },
  { name: 'In review', status: 'IN_REVIEW', wipLimit: 6 },
  { name: 'Done', status: 'DONE' },
];

async function createProject(opts: {
  name: string;
  key: string;
  type: 'TEAM' | 'PERSONAL';
  color: string;
  ownerId: string;
  memberIds: string[];
  description: string;
}) {
  const project = await prisma.project.create({
    data: {
      name: opts.name,
      key: opts.key,
      description: opts.description,
      type: opts.type,
      color: opts.color,
      status: 'ACTIVE',
      startDate: days(-30),
      dueDate: days(30),
      ownerId: opts.ownerId,
      members: {
        create: [
          { userId: opts.ownerId, projectRole: 'LEAD' },
          ...opts.memberIds
            .filter((id) => id !== opts.ownerId)
            .map((userId, i) => ({ userId, projectRole: i === 0 ? ('MEMBER' as const) : ('MEMBER' as const) })),
        ],
      },
    },
  });

  const board = await prisma.board.create({
    data: {
      projectId: project.id,
      name: 'Main board',
      columns: {
        create: COLUMNS.map((c, i) => ({ name: c.name, status: c.status, position: i, wipLimit: c.wipLimit })),
      },
    },
    include: { columns: true },
  });

  return { project, board };
}

async function main() {
  console.log('🧹 Clearing database…');
  await prisma.$transaction([
    prisma.emailOutbox.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.activityLog.deleteMany(),
    prisma.commentMention.deleteMany(),
    prisma.comment.deleteMany(),
    prisma.attachment.deleteMany(),
    prisma.timeEntry.deleteMany(),
    prisma.subtask.deleteMany(),
    prisma.taskAssignee.deleteMany(),
    prisma.task.deleteMany(),
    prisma.tag.deleteMany(),
    prisma.boardColumn.deleteMany(),
    prisma.board.deleteMany(),
    prisma.projectMember.deleteMany(),
    prisma.project.deleteMany(),
    prisma.refreshToken.deleteMany(),
    prisma.user.deleteMany(),
  ]);

  const hash = await bcrypt.hash('12345678', 10);
  const mk = (email: string, name: string, role: 'ADMIN' | 'MANAGER' | 'EMPLOYEE' | 'INDIVIDUAL') =>
    prisma.user.create({ data: { email, name, role, passwordHash: hash, emailNotifications: true } });

  console.log('👤 Seeding users…');
  const admin = await mk('admin@taskforge.com', 'Nazmul Amin', 'ADMIN');
  const manager = await mk('anon@taskforge.com', 'Anon', 'MANAGER');
  const manager2 = await mk('rifat@taskforge.com', 'Rifat', 'MANAGER');
  const emp1 = await mk('siam@taskforge.com', 'Siam', 'EMPLOYEE');
  const emp2 = await mk('rejwan@taskforge.com', 'Rejwan', 'EMPLOYEE');
  const emp3 = await mk('robin@taskforge.com', 'Robin', 'EMPLOYEE');
  const emp4 = await mk('emon@taskforge.com', 'Emon', 'EMPLOYEE');
  const individual = await mk('hasan@taskforge.com', 'Hasan', 'INDIVIDUAL');

  console.log('📁 Seeding projects & boards…');
  const padmaProject = await createProject({
    name: 'Padma Bridge Monitoring System',
    key: 'PBMS',
    type: 'TEAM',
    color: '#6366f1',
    ownerId: manager.id,
    memberIds: [emp1.id, emp2.id, emp3.id],
    description: 'Real-time traffic and structural health analytics platform.',
  });

  const dhakaProject = await createProject({
    name: 'Dhaka Metro Rail Ticketing',
    key: 'DMRT',
    type: 'TEAM',
    color: '#0ea5e9',
    ownerId: manager2.id,
    memberIds: [emp2.id, emp3.id, emp4.id],
    description: 'Automated rapid transit ticketing and pass renewal portal.',
  });

  const personal = await createProject({
    name: 'Chittagong Port Logistics',
    key: 'CPL',
    type: 'PERSONAL',
    color: '#10b981',
    ownerId: individual.id,
    memberIds: [],
    description: 'Container tracking and vessel berth scheduling system.',
  });

  const tags = await prisma.$transaction([
    prisma.tag.create({ data: { projectId: padmaProject.project.id, name: 'design', color: '#ec4899' } }),
    prisma.tag.create({ data: { projectId: padmaProject.project.id, name: 'mobile', color: '#6366f1' } }),
    prisma.tag.create({ data: { projectId: padmaProject.project.id, name: 'bug', color: '#ef4444' } }),
    prisma.tag.create({ data: { projectId: padmaProject.project.id, name: 'qa', color: '#f59e0b' } }),
    prisma.tag.create({ data: { projectId: dhakaProject.project.id, name: 'infra', color: '#0ea5e9' } }),
    prisma.tag.create({ data: { projectId: dhakaProject.project.id, name: 'docs', color: '#14b8a6' } }),
    prisma.tag.create({ data: { projectId: personal.project.id, name: 'health', color: '#10b981' } }),
  ]);
  const [tDesign, tMobile, tBug, tQa, tInfra, tDocs, tHealth] = tags;

  const columnOf = (status: TaskStatus) =>
    (padmaProject.board.columns.find((c) => c.status === status) ?? padmaProject.board.columns[0])!;

  type SeedTask = {
    title: string;
    description?: string;
    status: TaskStatus;
    priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
    due?: number;
    assignees?: string[];
    tagIds?: string[];
    subtasks?: string[];
    doneSubtasks?: number;
  };

  const padmaTasks: SeedTask[] = [
    { title: 'Design onboarding v2 flow', description: 'Exploration in Figma.\n\n4-step progressive profiling\nSocial login\nSkip / resume later', status: 'DONE', priority: 'HIGH', due: -6, assignees: [emp1.id], tagIds: [tDesign.id], subtasks: ['Wireframes', 'Hi-fi mockups', 'Prototype review'], doneSubtasks: 3 },
    { title: 'Offline sync conflict resolution', description: 'Implement last-write-wins with CRDT fallback for the notes module.', status: 'IN_PROGRESS', priority: 'URGENT', due: 2, assignees: [emp2.id, emp1.id], tagIds: [tMobile.id], subtasks: ['Spike: CRDT vs LWW', 'Merge strategy', 'Conflict UI'], doneSubtasks: 1 },
    { title: 'Push notification permission flow', description: 'Prompt once after the first successful order; deep-link into order detail.', status: 'IN_PROGRESS', priority: 'HIGH', due: 4, assignees: [emp3.id], tagIds: [tMobile.id] },
    { title: 'Fix crash on Android 14 (cold start)', description: 'Stack trace points to a null `notificationChannel` on cold start after upgrade.', status: 'IN_REVIEW', priority: 'URGENT', due: -1, assignees: [emp2.id], tagIds: [tBug.id], subtasks: ['Reproduce', 'Fix', 'Regression test'], doneSubtasks: 2 },
    { title: 'Accessibility audit — contrast & focus order', status: 'TODO', priority: 'MEDIUM', due: 7, assignees: [emp1.id], tagIds: [tDesign.id, tQa.id] },
    { title: 'QA regression suite for checkout', description: 'Cover Apple Pay, Google Pay and edge cases with expired cards.', status: 'TODO', priority: 'HIGH', due: 9, assignees: [emp3.id], tagIds: [tQa.id] },
    { title: 'Rewrite redux store to zustand', description: 'Reduce boilerplate; keep backwards-compatible selectors during migration.', status: 'BACKLOG', priority: 'LOW', assignees: [emp2.id], tagIds: [tMobile.id] },
    { title: 'App store screenshots & descriptions', status: 'BACKLOG', priority: 'MEDIUM', due: 16, assignees: [emp1.id], tagIds: [tDesign.id] },
    { title: 'Crashlytics dashboards', description: 'Track crash-free sessions ≥ 99.5%.', status: 'DONE', priority: 'MEDIUM', due: -12, assignees: [emp3.id], tagIds: [tQa.id] },
    { title: 'Localise strings for FR / DE / ES', status: 'TODO', priority: 'LOW', due: 21, assignees: [emp1.id] },
    { title: 'Ship v2.0 beta to TestFlight', status: 'TODO', priority: 'URGENT', due: 12, assignees: [manager.id, emp2.id], tagIds: [tMobile.id] },
    { title: 'Instrument onboarding funnel analytics', status: 'IN_REVIEW', priority: 'MEDIUM', due: 3, assignees: [emp3.id], tagIds: [tMobile.id] },
  ];

  console.log('✅ Seeding tasks…');
  for (const [i, t] of padmaTasks.entries()) {
    const column = columnOf(t.status);
    await prisma.task.create({
      data: {
        projectId: padmaProject.project.id,
        boardId: padmaProject.board.id,
        columnId: column.id,
        title: t.title,
        description: t.description,
        status: t.status,
        priority: t.priority,
        position: (i + 1) * 1000,
        dueDate: t.due !== undefined ? days(t.due) : null,
        completedAt: t.status === 'DONE' ? days((t.due ?? -2) + 1) : null,
        createdById: manager.id,
        assignees: { create: (t.assignees ?? []).map((userId) => ({ userId })) },
        tags: t.tagIds ? { connect: t.tagIds.map((id) => ({ id })) } : undefined,
        subtasks: t.subtasks
          ? {
              create: t.subtasks.map((title, idx) => ({ title, position: idx, isDone: idx < (t.doneSubtasks ?? 0) })),
            }
          : undefined,
      },
    });
  }

  const dhakaBoard = await prisma.board.findFirstOrThrow({ where: { projectId: dhakaProject.project.id }, include: { columns: true } });
  const dhakaTasks: SeedTask[] = [
    { title: 'Ingest Shopify orders into warehouse', status: 'IN_PROGRESS', priority: 'HIGH', due: 5, assignees: [emp4.id], tagIds: [tInfra.id] },
    { title: 'dbt models for revenue reporting', status: 'TODO', priority: 'HIGH', due: 10, assignees: [emp2.id], tagIds: [tInfra.id] },
    { title: 'Row-level security policies', description: 'Department-scoped access for all reporting tables.', status: 'IN_REVIEW', priority: 'URGENT', due: 1, assignees: [emp3.id], tagIds: [tInfra.id] },
    { title: 'Self-serve dashboard templates', status: 'IN_PROGRESS', priority: 'MEDIUM', due: 8, assignees: [emp4.id] },
    { title: 'Data catalogue documentation', status: 'BACKLOG', priority: 'LOW', tagIds: [tDocs.id] },
    { title: 'Warehouse cost review Q4', status: 'DONE', priority: 'MEDIUM', due: -4, assignees: [manager2.id] },
    { title: 'Alerting on pipeline failures', status: 'TODO', priority: 'HIGH', due: -2, assignees: [emp3.id], tagIds: [tInfra.id] },
    { title: 'Deprecate legacy CSV exports', status: 'DONE', priority: 'LOW', due: -9, assignees: [emp2.id] },
  ];
  for (const [i, t] of dhakaTasks.entries()) {
    const column = dhakaBoard.columns.find((c) => c.status === t.status)!;
    await prisma.task.create({
      data: {
        projectId: dhakaProject.project.id,
        boardId: dhakaBoard.id,
        columnId: column.id,
        title: t.title,
        description: t.description,
        status: t.status,
        priority: t.priority,
        position: (i + 1) * 1000,
        dueDate: t.due !== undefined ? days(t.due) : null,
        completedAt: t.status === 'DONE' ? days((t.due ?? -3) + 1) : null,
        createdById: manager2.id,
        assignees: { create: (t.assignees ?? []).map((userId) => ({ userId })) },
        tags: t.tagIds ? { connect: t.tagIds.map((id) => ({ id })) } : undefined,
      },
    });
  }

  const personalBoard = await prisma.board.findFirstOrThrow({ where: { projectId: personal.project.id }, include: { columns: true } });
  const personalTasks: SeedTask[] = [
    { title: 'Morning run — 5k', status: 'DONE', priority: 'LOW', due: -1, tagIds: [tHealth.id] },
    { title: 'Read "Designing Data-Intensive Applications" ch. 6', status: 'IN_PROGRESS', priority: 'MEDIUM', due: 2, tagIds: [tHealth.id] },
    { title: 'Plan Q1 side project: habit tracker', status: 'TODO', priority: 'HIGH', due: 6 },
    { title: 'Renew passport', status: 'TODO', priority: 'URGENT', due: -3 },
  ];
  for (const [i, t] of personalTasks.entries()) {
    const column = personalBoard.columns.find((c) => c.status === t.status)!;
    await prisma.task.create({
      data: {
        projectId: personal.project.id,
        boardId: personalBoard.id,
        columnId: column.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        position: (i + 1) * 1000,
        dueDate: t.due !== undefined ? days(t.due) : null,
        createdById: individual.id,
        assignees: { create: [{ userId: individual.id }] },
        tags: t.tagIds ? { connect: t.tagIds.map((id) => ({ id })) } : undefined,
      },
    });
  }

  console.log('💬 Seeding comments, activity, notifications…');
  const conflictTask = await prisma.task.findFirstOrThrow({ where: { title: 'Offline sync conflict resolution' } });
  const root = await prisma.comment.create({
    data: {
      taskId: conflictTask.id,
      authorId: manager.id,
      body: 'Let’s keep the LWW merge for v2 and revisit CRDTs when we add shared boards. @[Siam](MENTION_EMP1) can you confirm the spike findings?'.replace('MENTION_EMP1', emp1.id),
      mentions: { create: [{ userId: emp1.id }] },
    },
  });
  await prisma.comment.create({
    data: {
      taskId: conflictTask.id,
      authorId: emp1.id,
      parentId: root.id,
      body: 'Confirmed — CRDTs add ~40ms per merge on low-end devices. LWW + server reconciliation is the right call for v2.',
    },
  });
  await prisma.comment.create({
    data: { taskId: conflictTask.id, authorId: emp2.id, body: 'Pushed the merge strategy doc to the attachments tab. Ready for review.' },
  });

  const actorPairs: Array<[string, 'TASK_CREATED' | 'TASK_MOVED' | 'COMMENT_CREATED' | 'PROJECT_CREATED' | 'TASK_UPDATED']> = [
    [manager.id, 'PROJECT_CREATED'],
    [manager.id, 'TASK_CREATED'],
    [emp2.id, 'TASK_MOVED'],
    [emp1.id, 'COMMENT_CREATED'],
    [emp3.id, 'TASK_UPDATED'],
  ];
  for (const [actorId, action] of actorPairs) {
    await prisma.activityLog.create({
      data: {
        actorId,
        projectId: padmaProject.project.id,
        action,
        entityType: action.startsWith('PROJECT') ? 'PROJECT' : action.startsWith('COMMENT') ? 'COMMENT' : 'TASK',
        entityId: conflictTask.id,
        metadata: { seed: true },
      },
    });
  }

  await prisma.notification.createMany({
    data: [
      { userId: emp1.id, type: 'COMMENT_MENTION', title: 'You were mentioned', body: `${manager.name} mentioned you on "Offline sync conflict resolution".`, entityType: 'TASK', entityId: conflictTask.id },
      { userId: emp2.id, type: 'TASK_DUE_SOON', title: 'Task due soon', body: '"Offline sync conflict resolution" is due in 2 days.', entityType: 'TASK', entityId: conflictTask.id },
      { userId: emp2.id, type: 'TASK_OVERDUE', title: 'Task overdue', body: '"Fix crash on Android 14" is overdue.', entityType: 'TASK', entityId: conflictTask.id },
      { userId: manager.id, type: 'COMMENT_ADDED', title: 'New comment', body: 'Siam replied on "Offline sync conflict resolution".', entityType: 'TASK', entityId: conflictTask.id },
    ],
  });

  console.log('\n✨ Seed complete — sign in with any of:');
  console.table([
    { role: 'ADMIN', email: admin.email, password: '12345678' },
    { role: 'MANAGER (Anon)', email: manager.email, password: '12345678' },
    { role: 'MANAGER (Rifat)', email: manager2.email, password: '12345678' },
    { role: 'EMPLOYEE (Siam)', email: emp1.email, password: '12345678' },
    { role: 'EMPLOYEE (Rejwan)', email: emp2.email, password: '12345678' },
    { role: 'EMPLOYEE (Robin)', email: emp3.email, password: '12345678' },
    { role: 'EMPLOYEE (Emon)', email: emp4.email, password: '12345678' },
    { role: 'INDIVIDUAL (Hasan)', email: individual.email, password: '12345678' },
  ]);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());