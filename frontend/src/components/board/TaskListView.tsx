import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, CheckCircle2, Circle, Clock3, ListFilter } from 'lucide-react';
import type { Task, TaskStatus } from '@/types';
import { AvatarStack, Badge } from '@/components/ui/primitives';
import { PRIORITY_META, STATUS_META, cn, dueLabel } from '@/lib/utils';
import { useUiStore } from '@/store/ui.store';

type SortKey = 'dueDate' | 'priority' | 'title' | 'status';
type GroupKey = 'status' | 'priority' | 'assignee';

export function TaskListView({ tasks }: { tasks: Task[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('dueDate');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [groupBy, setGroupBy] = useState<GroupKey>('status');
  const openTask = useUiStore((s) => s.openTask);

  const grouped = useMemo(() => {
    const sorted = [...tasks].sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      switch (sortKey) {
        case 'priority':
          return (PRIORITY_META[a.priority].weight - PRIORITY_META[b.priority].weight) * dir;
        case 'title':
          return a.title.localeCompare(b.title) * dir;
        case 'status':
          return a.status.localeCompare(b.status) * dir;
        default:
          const ad = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
          const bd = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
          return (ad - bd) * dir;
      }
    });

    const buckets = new Map<string, Task[]>();
    for (const t of sorted) {
      const key =
        groupBy === 'status'
          ? t.status
          : groupBy === 'priority'
            ? t.priority
            : t.assignees[0]?.user.name ?? 'Unassigned';
      buckets.set(key, [...(buckets.get(key) ?? []), t]);
    }
    return [...buckets.entries()];
  }, [tasks, sortKey, sortDir, groupBy]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const SortHeader = ({ label, k, className }: { label: string; k: SortKey; className?: string }) => (
    <button onClick={() => toggleSort(k)} className={cn('inline-flex items-center gap-1 text-left', className)}>
      {label}
      {sortKey === k ? sortDir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} /> : null}
    </button>
  );

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
        <div className="flex items-center gap-2 text-xs text-ink-muted">
          <ListFilter size={13} />
          <span className="font-medium">Group by</span>
          <div className="inline-flex rounded-md border border-slate-200 p-0.5">
            {(['status', 'priority', 'assignee'] as GroupKey[]).map((g) => (
              <button
                key={g}
                onClick={() => setGroupBy(g)}
                className={cn('rounded px-2 py-0.5 text-[11px] font-medium capitalize', groupBy === g ? 'bg-slate-900 text-white' : 'text-ink-muted hover:text-ink')}
              >
                {g}
              </button>
            ))}
          </div>
        </div>
        <span className="text-[11px] text-ink-faint">{tasks.length} tasks</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
              <th className="px-4 py-2"><SortHeader label="Task" k="title" /></th>
              <th className="px-3 py-2"><SortHeader label="Status" k="status" /></th>
              <th className="px-3 py-2"><SortHeader label="Priority" k="priority" /></th>
              <th className="px-3 py-2"><SortHeader label="Due" k="dueDate" /></th>
              <th className="px-3 py-2">Progress</th>
              <th className="px-3 py-2">Assignees</th>
            </tr>
          </thead>
          <tbody>
            {grouped.map(([group, groupTasks]) => (
              <>
                <tr key={`group-${group}`} className="bg-slate-50/70">
                  <td colSpan={6} className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest text-ink-faint">
                    {group.replace('_', ' ')} · {groupTasks.length}
                  </td>
                </tr>
                {groupTasks.map((t) => {
                  const completed = t.status === 'DONE' || t.status === 'CANCELLED';
                  const rawDue = dueLabel(t.dueDate);
                  const due = completed ? { ...rawDue, tone: 'normal' as const } : rawDue;
                  return (
                    <tr
                      key={t.id}
                      onClick={() => openTask(t.id)}
                      className="cursor-pointer border-b border-slate-50 transition-colors last:border-0 hover:bg-brand-50/30"
                    >
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          {t.status === 'DONE' ? <CheckCircle2 size={14} className="shrink-0 text-emerald-500" /> : <Circle size={14} className="shrink-0 text-slate-300" />}
                          <span className={cn('max-w-[340px] truncate font-medium text-ink', t.status === 'DONE' && 'text-ink-faint line-through')}>{t.title}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge className={STATUS_META[t.status].className} dot={STATUS_META[t.status].dot}>
                          {STATUS_META[t.status].label}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge className={PRIORITY_META[t.priority].className} dot={PRIORITY_META[t.priority].dot}>
                          {PRIORITY_META[t.priority].label}
                        </Badge>
                      </td>
                      <td className={cn('px-3 py-2.5 text-xs font-medium', due.tone === 'overdue' ? 'text-rose-600' : due.tone === 'today' ? 'text-amber-600' : 'text-ink-muted')}>
                        {t.dueDate ? (
                          <span className="inline-flex items-center gap-1">
                            <Clock3 size={11} /> {due.text}
                          </span>
                        ) : (
                          <span className="text-ink-faint">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="h-1 w-14 overflow-hidden rounded-full bg-slate-100">
                            <div className={cn('h-full rounded-full', t.progress === 100 ? 'bg-emerald-500' : 'bg-brand-500')} style={{ width: `${t.progress}%` }} />
                          </div>
                          <span className="text-[10px] font-medium text-ink-faint">{t.progress}%</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">{t.assignees.length ? <AvatarStack people={t.assignees.map((a) => a.user)} max={3} /> : <span className="text-xs text-ink-faint">—</span>}</td>
                    </tr>
                  );
                })}
              </>
            ))}
            {tasks.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-ink-faint">
                  No tasks match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
