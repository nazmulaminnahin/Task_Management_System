import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { AtSign, BellOff, CheckCheck, Clock, MessageSquare, UserPlus, Zap } from 'lucide-react';
import type { Notification } from '@/types';
import { Button } from '@/components/ui/primitives';
import { cn, fromNow } from '@/lib/utils';
import { useUiStore } from '@/store/ui.store';

const ICONS: Record<string, { icon: React.ReactNode; className: string }> = {
  TASK_ASSIGNED: { icon: <Zap size={14} />, className: 'bg-brand-50 text-brand-600' },
  TASK_DUE_SOON: { icon: <Clock size={14} />, className: 'bg-amber-50 text-amber-600' },
  TASK_OVERDUE: { icon: <Clock size={14} />, className: 'bg-rose-50 text-rose-600' },
  COMMENT_MENTION: { icon: <AtSign size={14} />, className: 'bg-violet-50 text-violet-600' },
  COMMENT_ADDED: { icon: <MessageSquare size={14} />, className: 'bg-sky-50 text-sky-600' },
  PROJECT_MEMBER_ADDED: { icon: <UserPlus size={14} />, className: 'bg-emerald-50 text-emerald-600' },
};

export function NotificationPanel({
  notifications,
  onClose,
  onMarkAll,
  onMarkOne,
}: {
  notifications: Notification[];
  onClose: () => void;
  onMarkAll: () => void;
  onMarkOne: (id: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const openTask = useUiStore((s) => s.openTask);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [onClose]);

  const unread = notifications.filter((n) => !n.isRead).length;

  return (
    <div ref={ref} className="absolute right-0 top-11 z-40 w-[380px] animate-fade-in overflow-hidden rounded-xl border border-slate-200 bg-white shadow-pop">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">Notifications</span>
          {unread > 0 && <span className="rounded-full bg-brand-50 px-1.5 py-0.5 text-[10px] font-bold text-brand-700">{unread} new</span>}
        </div>
        <Button variant="ghost" size="sm" onClick={onMarkAll} disabled={!unread}>
          <CheckCheck size={13} /> Mark all read
        </Button>
      </div>

      <div className="max-h-[420px] overflow-y-auto scrollbar-thin">
        {notifications.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
            <BellOff size={22} className="text-slate-300" />
            <p className="text-sm font-medium text-ink-muted">You're all caught up</p>
            <p className="text-xs text-ink-faint">Real-time alerts will appear here.</p>
          </div>
        )}
        {notifications.map((n) => {
          const meta = ICONS[n.type] ?? { icon: <Zap size={14} />, className: 'bg-slate-100 text-slate-600' };
          return (
            <button
              key={n.id}
              onClick={() => {
                onMarkOne(n.id);
                if (n.entityType === 'TASK' && n.entityId) openTask(n.entityId);
                onClose();
              }}
              className={cn('flex w-full gap-3 border-b border-slate-50 px-4 py-3 text-left transition-colors hover:bg-slate-50', !n.isRead && 'bg-brand-50/40')}
            >
              <span className={cn('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full', meta.className)}>{meta.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-start justify-between gap-2">
                  <span className="text-[13px] font-semibold text-ink">{n.title}</span>
                  {!n.isRead && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />}
                </span>
                <span className="mt-0.5 line-clamp-2 block text-xs leading-relaxed text-ink-muted">{n.body}</span>
                <span className="mt-1 block text-[10px] font-medium uppercase tracking-wider text-ink-faint">{fromNow(n.createdAt)}</span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="border-t border-slate-100 p-1.5">
        <button
          onClick={() => {
            navigate('/notifications');
            onClose();
          }}
          className="w-full rounded-lg py-1.5 text-xs font-medium text-ink-muted hover:bg-slate-50 hover:text-ink"
        >
          View all notifications
        </button>
      </div>
    </div>
  );
}
