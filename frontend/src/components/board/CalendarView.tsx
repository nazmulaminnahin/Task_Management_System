import { useMemo, useState } from 'react';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Task } from '@/types';
import { Button } from '@/components/ui/primitives';
import { PRIORITY_META, cn } from '@/lib/utils';
import { useUiStore } from '@/store/ui.store';

/** Month grid with up to 3 task chips per day; clicking a chip opens the task drawer. */
export function CalendarView({ tasks }: { tasks: Task[] }) {
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const openTask = useUiStore((s) => s.openTask);

  const days = useMemo(
    () =>
      eachDayOfInterval({
        start: startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 }),
        end: endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 }),
      }),
    [cursor],
  );

  const byDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasks) {
      if (!t.dueDate) continue;
      const key = format(new Date(t.dueDate), 'yyyy-MM-dd');
      map.set(key, [...(map.get(key) ?? []), t]);
    }
    return map;
  }, [tasks]);

  return (
    <div className="card overflow-hidden dark:bg-slate-900 dark:border-slate-800">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
        <h2 className="text-sm font-semibold text-ink dark:text-white">{format(cursor, 'MMMM yyyy')}</h2>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => setCursor(subMonths(cursor, 1))} aria-label="Previous month" className="text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800">
            <ChevronLeft size={16} />
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setCursor(startOfMonth(new Date()))}
            className="border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700 shadow-sm"
          >
            Today
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setCursor(addMonths(cursor, 1))} aria-label="Next month" className="text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800">
            <ChevronRight size={16} />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-800/90">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
          <div key={d} className="px-2 py-2 text-center text-xs font-bold uppercase tracking-wider text-ink-faint dark:text-slate-300">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 bg-slate-200 dark:bg-slate-800 gap-px">
        {days.map((day) => {
          const key = format(day, 'yyyy-MM-dd');
          const dayTasks = byDay.get(key) ?? [];
          const overdue = dayTasks.some((t) => t.status !== 'DONE' && t.dueDate && new Date(t.dueDate) < new Date() && !isToday(day));
          return (
            <div
              key={key}
              className={cn(
                'min-h-[120px] p-2 transition-colors',
                isSameMonth(day, cursor) 
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100' 
                  : 'bg-slate-50/50 dark:bg-slate-950/70 text-slate-400 dark:text-slate-500',
              )}
            >
              <div className="mb-1.5 flex items-center justify-between px-0.5">
                <span
                  className={cn(
                    'flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold',
                    isToday(day) 
                      ? 'bg-brand-600 text-white' 
                      : isSameMonth(day, cursor) 
                        ? 'text-ink dark:text-slate-100' 
                        : 'text-ink-faint dark:text-slate-500',
                  )}
                >
                  {format(day, 'd')}
                </span>
                {dayTasks.length > 3 && <span className="text-[10px] font-semibold text-ink-faint dark:text-slate-400">+{dayTasks.length - 3}</span>}
              </div>
              <div className="space-y-1">
                {dayTasks.slice(0, 3).map((t) => (
                  <button
                    key={t.id}
                    onClick={() => openTask(t.id)}
                    className={cn(
                      'flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-xs font-medium leading-tight transition-colors',
                      t.status === 'DONE' 
                        ? 'text-ink-faint line-through dark:text-slate-500' 
                        : overdue 
                          ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300' 
                          : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700',
                    )}
                  >
                    <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', PRIORITY_META[t.priority].dot)} />
                    <span className="truncate">{t.title}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}