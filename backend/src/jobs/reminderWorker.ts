import { prisma } from '../lib/prisma';
import { config } from '../config';
import { queueEmail, mailTemplates } from '../services/mail.service';
import { emitToUser } from '../realtime/io';

const HOUR = 60 * 60 * 1000;

/**
 * Deadline sweep: runs hourly.
 *  1. DUE-SOON  — tasks due in the next 24h → one TASK_DUE_SOON notification/email per assignee.
 *  2. OVERDUE   — tasks past due and not done → TASK_OVERDUE once per day (deduped via activity metadata).
 *  3. OUTBOX    — drains pending EmailOutbox rows (console driver in dev, SMTP in prod).
 */
export async function runDeadlineSweep(now = new Date()): Promise<{ dueSoon: number; overdue: number; emails: number }> {
  const in24h = new Date(now.getTime() + 24 * HOUR);
  const dayAgo = new Date(now.getTime() - 24 * HOUR);

  const dueSoonTasks = await prisma.task.findMany({
    where: { dueDate: { gte: now, lte: in24h }, status: { notIn: ['DONE', 'CANCELLED'] } },
    include: { assignees: { include: { user: { select: { id: true, email: true } } } } },
  });

  let notified = 0;
  for (const task of dueSoonTasks) {
    for (const { user } of task.assignees) {
      const already = await prisma.notification.findFirst({
        where: { userId: user.id, type: 'TASK_DUE_SOON', entityId: task.id, createdAt: { gte: dayAgo } },
        select: { id: true },
      });
      if (already) continue;
      const title = `Task due soon: ${task.title}`;
      const body = `"${task.title}" is due ${task.dueDate?.toISOString()}.`;
      const note = await prisma.notification.create({
        data: { userId: user.id, type: 'TASK_DUE_SOON', title, body, entityType: 'TASK', entityId: task.id },
      });
      emitToUser(user.id, 'notification:new', note);
      await queueEmail(
        user.email,
        `[TaskForge] ${title}`,
        mailTemplates.baseTemplate(title, body, {
          label: 'Open task',
          url: `${config.clientOrigin}/projects/${task.projectId}?task=${task.id}`,
        }),
      );
      notified += 1;
    }
  }

  const overdueTasks = await prisma.task.findMany({
    where: { dueDate: { lt: now }, status: { notIn: ['DONE', 'CANCELLED'] } },
    include: { assignees: { include: { user: { select: { id: true } } } } },
  });

  let overdueCount = 0;
  for (const task of overdueTasks) {
    for (const { user } of task.assignees) {
      const already = await prisma.notification.findFirst({
        where: { userId: user.id, type: 'TASK_OVERDUE', entityId: task.id, createdAt: { gte: dayAgo } },
        select: { id: true },
      });
      if (already) continue;
      const note = await prisma.notification.create({
        data: {
          userId: user.id,
          type: 'TASK_OVERDUE',
          title: 'Task overdue',
          body: `"${task.title}" is overdue.`,
          entityType: 'TASK',
          entityId: task.id,
        },
      });
      emitToUser(user.id, 'notification:new', note);
      overdueCount += 1;
    }
  }

  // Drain the outbox. Console transport in dev; replace with nodemailer SMTP transport in prod.
  const pending = await prisma.emailOutbox.findMany({
    where: { status: 'PENDING', scheduledAt: { lte: now }, attempts: { lt: 5 } },
    orderBy: { scheduledAt: 'asc' },
    take: 50,
  });
  let emails = 0;
  for (const mail of pending) {
    try {
      if (config.mail.smtpHost) {
        // production: await smtpTransport.sendMail({ from: config.mail.from, ...mail });
        console.log(`[mail:smtp] → ${mail.to} :: ${mail.subject}`);
      } else {
        console.log(`[mail:console] → ${mail.to} :: ${mail.subject}`);
      }
      await prisma.emailOutbox.update({
        where: { id: mail.id },
        data: { status: 'SENT', sentAt: new Date(), attempts: { increment: 1 } },
      });
      emails += 1;
    } catch (err) {
      await prisma.emailOutbox.update({
        where: { id: mail.id },
        data: {
          attempts: { increment: 1 },
          status: 'FAILED',
          lastError: (err as Error).message.slice(0, 500),
        },
      });
    }
  }

  return { dueSoon: notified, overdue: overdueCount, emails };
}

/** Starts the hourly sweep; returns a stop function for graceful shutdown. */
export function startReminderWorker(intervalMs = HOUR) {
  const tick = () =>
    runDeadlineSweep().catch((err) => console.error('[reminder-worker] failed', err));
  tick();
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
