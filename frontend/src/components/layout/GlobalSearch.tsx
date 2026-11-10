import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, FolderKanban, Search, SquareArrowOutUpRight } from 'lucide-react';
import { api } from '@/lib/api';
import type { Paged, ProjectSummary, Task } from '@/types';
import { useUiStore } from '@/store/ui.store';
import { PRIORITY_META } from '@/lib/utils';

export function GlobalSearch({
  open,
  onClose,
  projects,
}: {
  open: boolean;
  onClose: () => void;
  projects: ProjectSummary[];
}) {
  const [q, setQ] = useState('');
  const navigate = useNavigate();
  const openTask = useUiStore((s) => s.openTask);

  useEffect(() => {
    if (!open) setQ('');
  }, [open]);

  const { data: tasks, isFetching } = useQuery({
    queryKey: ['search-tasks', q],
    queryFn: () => api<Paged<Task>>(`/tasks?q=${encodeURIComponent(q)}&pageSize=8`),
    enabled: open && q.trim().length >= 2,
    staleTime: 10_000,
  });

  const projectHits = useMemo(
    () => (q.trim() ? projects.filter((p) => p.name.toLowerCase().includes(q.toLowerCase())).slice(0, 4) : projects.slice(0, 4)),
    [projects, q],
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-xl rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden text-slate-900 dark:text-slate-100 p-5">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">Search</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Tasks and projects across your workspace</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Modal Body / Search Input */}
        <div className="pt-3">
          <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
            <Search size={16} className="text-slate-400 dark:text-slate-500" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Type at least 2 characters…"
              className="w-full border-0 bg-transparent text-sm outline-none text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
            />
            {isFetching && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />}
          </div>

          {projectHits.length > 0 && (
            <div className="pt-3">
              <div className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">Projects</div>
              {projectHits.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    navigate(`/projects/${p.id}`);
                    onClose();
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm text-slate-900 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-md text-white" style={{ backgroundColor: p.color }}>
                    <FolderKanban size={12} />
                  </span>
                  <span className="flex-1 truncate">{p.name}</span>
                  <ArrowRight size={13} className="text-slate-400 dark:text-slate-500" />
                </button>
              ))}
            </div>
          )}

          {tasks?.items.length ? (
            <div className="pt-3">
              <div className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">Tasks</div>
              {tasks.items.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    openTask(t.id);
                    onClose();
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm text-slate-900 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${PRIORITY_META[t.priority].dot}`} />
                  <span className="flex-1 truncate">{t.title}</span>
                  {t.project && <span className="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:text-slate-300">{t.project.key}</span>}
                  <SquareArrowOutUpRight size={13} className="text-slate-400 dark:text-slate-500" />
                </button>
              ))}
            </div>
          ) : (
            q.trim().length >= 2 && !isFetching && <p className="px-2 py-6 text-center text-sm text-slate-500 dark:text-slate-400">No tasks match “{q}”.</p>
          )}
        </div>
      </div>
    </div>
  );
}