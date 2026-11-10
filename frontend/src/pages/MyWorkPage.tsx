import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarClock, CheckCircle2, Inbox, ListChecks } from 'lucide-react';
import { useMyWork } from '@/hooks/useTasks';
import { useAuthStore } from '@/store/auth.store';
import { PageHeader, StatCard } from '@/components/layout/AppShell';
import { Badge, Skeleton } from '@/components/ui/primitives';
import { TaskListView } from '@/components/board/TaskListView';
import { useUiStore } from '@/store/ui.store';
import { useTranslation } from '@/lib/i18n';
import { cn } from '@/lib/utils';

type Bucket = 'open' | 'today' | 'overdue' | 'done';

export function MyWorkPage() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user)!;
  const { data, isLoading } = useMyWork();
  const [bucket, setBucket] = useState<Bucket>('open');
  const openTask = useUiStore((s) => s.openTask);
  const navigate = useNavigate();

  const mine = useMemo(() => {
    const all = data?.items ?? [];
    return all.filter((t) => t.assignees.some((a) => a.userId === user.id));
  }, [data, user.id]);

  const now = new Date();
  const buckets = useMemo(() => {
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(startOfToday.getTime() + 86400000);
    const open = mine.filter((t) => !['DONE', 'CANCELLED'].includes(t.status));
    return {
      open,
      today: open.filter((t) => t.dueDate && new Date(t.dueDate) >= startOfToday && new Date(t.dueDate) < endOfToday),
      overdue: open.filter((t) => t.dueDate && new Date(t.dueDate) < startOfToday),
      done: mine.filter((t) => t.status === 'DONE'),
    };
  }, [mine, now]);

  const visible = buckets[bucket];

  const tabs: { key: Bucket; label: string; count: number }[] = [
    { key: 'open', label: t('Open'), count: buckets.open.length },
    { key: 'today', label: t('Due today'), count: buckets.today.length },
    { key: 'overdue', label: t('Overdue'), count: buckets.overdue.length },
    { key: 'done', label: t('Completed'), count: buckets.done.length },
  ];

  return (
    <>
      <PageHeader title={t('My work')} subtitle={t('Everything assigned to you across every project.')} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t('Open')} value={buckets.open.length} icon={<ListChecks size={15} />} loading={isLoading} />
        <StatCard label={t('Due today')} value={buckets.today.length} icon={<CalendarClock size={15} />} tone="amber" loading={isLoading} />
        <StatCard label={t('Overdue')} value={buckets.overdue.length} icon={<CalendarClock size={15} />} tone="rose" loading={isLoading} />
        <StatCard label={t('Completed')} value={buckets.done.length} icon={<CheckCircle2 size={15} />} tone="emerald" loading={isLoading} />
      </div>

      {/* Fully custom high-contrast tab buttons and role badge */}
      <div className="mb-4 mt-5 flex items-center justify-between">
        <div className="flex rounded-lg bg-slate-200 p-1 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setBucket(tab.key)}
              className={cn(
                'rounded-md px-3.5 py-1.5 text-xs font-semibold transition-all',
                bucket === tab.key
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                  : 'text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
              )}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>
        <Badge className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold border border-slate-300 dark:border-slate-700">
          {user.role.toLowerCase()}
        </Badge>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-16 text-center text-slate-900 dark:text-slate-100 shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 mb-3">
            <Inbox size={22} />
          </div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">
            {bucket === 'overdue' ? t('Nothing overdue') : t('Nothing here')}
          </h3>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400 max-w-sm mx-auto">
            {bucket === 'overdue'
              ? t('Every deadline is under control.')
              : t('Tasks assigned to you will appear here — pick something from a project board.')}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {bucket === 'open' || bucket === 'done' ? (
            <TaskListView tasks={visible} />
          ) : (
            <div className="space-y-1.5">
              {visible.map((t) => (
                <button
                  key={t.id}
                  onClick={() => openTask(t.id)}
                  className="flex w-full items-center gap-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-2.5 text-left hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50 shadow-sm"
                >
                  <span className="h-2 w-2 rounded" style={{ backgroundColor: t.project?.color ?? '#94a3b8' }} />
                  <span className="flex-1 truncate text-sm font-medium text-slate-900 dark:text-slate-100">{t.title}</span>
                  {t.project && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/projects/${t.project!.id}`);
                      }}
                      className="hidden rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 sm:block border border-slate-300 dark:border-slate-700"
                    >
                      {t.project.key}
                    </button>
                  )}
                  <Badge className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                    {t.status.replace('_', ' ').toLowerCase()}
                  </Badge>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}