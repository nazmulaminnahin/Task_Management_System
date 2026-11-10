import { Bell, CheckCheck } from 'lucide-react';
import { useMarkNotificationsRead, useNotifications } from '@/hooks/useNotifications';
import { PageHeader } from '@/components/layout/AppShell';
import { Button, EmptyState, Skeleton } from '@/components/ui/primitives';
import { cn, fromNow } from '@/lib/utils';
import { useUiStore } from '@/store/ui.store';

export function NotificationsPage() {
  const { data, isLoading } = useNotifications();
  const markRead = useMarkNotificationsRead();
  const openTask = useUiStore((s) => s.openTask);

  return (
    <>
      <PageHeader
        title="Notifications"
        subtitle="Assignments, mentions, comments and deadline alerts."
        actions={
          <Button variant="outline" onClick={() => markRead.mutate({ all: true })} disabled={!data?.unreadCount}>
            <CheckCheck size={14} /> Mark all read
          </Button>
        }
      />
      {isLoading ? (
        <Skeleton className="h-72 w-full" />
      ) : !data?.items.length ? (
        <EmptyState icon={<Bell size={20} />} title="No notifications" description="You'll see real-time alerts here when teammates assign, mention or comment." />
      ) : (
        <div className="card divide-y divide-slate-100 overflow-hidden">
          {data.items.map((n) => (
            <button
              key={n.id}
              onClick={() => {
                markRead.mutate({ ids: [n.id] });
                if (n.entityType === 'TASK' && n.entityId) openTask(n.entityId);
              }}
              className={cn('flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-slate-50', !n.isRead && 'bg-brand-50/30')}
            >
              <span className={cn('mt-1 h-2 w-2 shrink-0 rounded-full', n.isRead ? 'bg-slate-200' : 'bg-brand-500')} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-ink">{n.title}</span>
                <span className="block text-xs text-ink-muted">{n.body}</span>
                <span className="mt-0.5 block text-[10px] uppercase tracking-wider text-ink-faint">{fromNow(n.createdAt)}</span>
              </span>
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-500">{n.type.replaceAll('_', ' ')}</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
