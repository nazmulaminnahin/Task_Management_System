import { useMemo } from 'react';
import { CalendarView } from '@/components/board/CalendarView';
import { useProjects } from '@/hooks/useProjects';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Paged, Task } from '@/types';
import { PageHeader } from '@/components/layout/AppShell';
import { Skeleton } from '@/components/ui/primitives';
import { useTranslation } from '@/lib/i18n';
import { cn } from '@/lib/utils';

/** Cross-project calendar of every due date the user can see. */
export function CalendarPage() {
  const { t } = useTranslation();
  const { data: projects } = useProjects('mine');
  const { data, isLoading } = useQuery({
    queryKey: ['calendar-tasks'],
    queryFn: () => api<Paged<Task>>('/tasks?pageSize=200'),
  });

  const tasks = useMemo(() => (data?.items ?? []).filter((t) => t.dueDate), [data]);

  return (
    <>
      <PageHeader title={t('Calendar')} subtitle={t('All scheduled deadlines across your projects.')} />
      
      {isLoading ? (
        <Skeleton className="h-[520px] w-full" />
      ) : (
        <div className="card overflow-hidden border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          {/* Calendar Header Row (Mon, Tue, Wed, etc.) */}
          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-100 py-2.5 text-center text-xs font-semibold uppercase tracking-wider text-slate-700 dark:border-slate-700 dark:bg-slate-800/90 dark:text-slate-200">
            <div>{t('Mon')}</div>
            <div>{t('Tue')}</div>
            <div>{t('Wed')}</div>
            <div>{t('Thu')}</div>
            <div>{t('Fri')}</div>
            <div>{t('Sat')}</div>
            <div>{t('Sun')}</div>
          </div>

          <div className="bg-slate-200 dark:bg-slate-700">
            <CalendarView tasks={tasks} />
          </div>
        </div>
      )}

      <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
        {t('Showing')} {tasks.length} {t('dated tasks from')} {projects?.items.length ?? 0} {t('projects.')}
      </p>
    </>
  );
}