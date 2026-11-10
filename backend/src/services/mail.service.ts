import { prisma } from '../lib/prisma';
import { config } from '../config';
import type { NotificationType } from '@prisma/client';

const baseTemplate = (title: string, body: string, cta?: { label: string; url: string }) => `
<div style="font-family:Inter,system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a">
  <div style="font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:#6366f1;font-weight:700">TaskForge</div>
  <h1 style="font-size:20px;margin:12px 0 8px">${title}</h1>
  <p style="font-size:14px;line-height:1.6;color:#475569">${body}</p>
  ${cta ? `<a href="${cta.url}" style="display:inline-block;margin-top:16px;background:#4f46e5;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-size:14px">${cta.label}</a>` : ''}
  <p style="margin-top:24px;font-size:12px;color:#94a3b8">You receive this because of your notification settings. Manage them in TaskForge → Settings.</p>
</div>`;

/**
 * Queues an email in the transactional outbox instead of sending inline.
 * The outbox is drained by src/jobs/reminderWorker.ts (cron in prod, interval in dev),
 * so a slow SMTP server never blocks an API request and failures retry safely.
 */
export async function queueEmail(to: string, subject: string, html: string) {
  return prisma.emailOutbox.create({ data: { to, subject, html } });
}

const TITLES: Record<NotificationType, string> = {
  TASK_ASSIGNED: 'New task assigned',
  TASK_DUE_SOON: 'Task due soon',
  TASK_OVERDUE: 'Task overdue',
  TASK_STATUS_CHANGED: 'Task status changed',
  COMMENT_ADDED: 'New comment',
  COMMENT_MENTION: 'You were mentioned',
  PROJECT_INVITE: 'Project invitation',
  PROJECT_MEMBER_ADDED: 'Added to a project',
  SYSTEM: 'TaskForge',
};

/**
 * Creates in-app notifications and enqueues matching emails.
 * Fire-and-forget by design: failures are logged, never surfaced to the caller.
 */
export async function notify(
  entries: Array<{
    userId: string;
    type: NotificationType;
    body: string;
    entityType?: string;
    entityId?: string;
    email?: boolean;
    cta?: { label: string; url: string };
  }>,
) {
  if (!entries.length) return;
  try {
    const created = await Promise.all(
      entries.map((e) =>
        prisma.notification.create({
          data: {
            userId: e.userId,
            type: e.type,
            title: TITLES[e.type],
            body: e.body,
            entityType: e.entityType,
            entityId: e.entityId,
          },
        }),
      ),
    );

    const recipients = await prisma.user.findMany({
      where: { id: { in: entries.map((e) => e.userId) } },
      select: { id: true, email: true, emailNotifications: true },
    });
    const byId = new Map(recipients.map((r) => [r.id, r]));

    for (const [i, entry] of entries.entries()) {
      const note = created[i];
      const recipient = byId.get(entry.userId);
      if (!note || !recipient || !recipient.emailNotifications || entry.email === false) continue;
      await queueEmail(
        recipient.email,
        `[TaskForge] ${TITLES[entry.type]}`,
        baseTemplate(TITLES[entry.type], entry.body, entry.cta),
      );
    }

    // Lazy import avoids a service↔realtime import cycle at module load time.
    const { emitToUser } = await import('../realtime/io');
    created.forEach((n) => emitToUser(n.userId, 'notification:new', n));
  } catch (err) {
    console.error('[notify] failed', err);
  }
}

export const mailTemplates = { baseTemplate };
export { config as mailConfig };
