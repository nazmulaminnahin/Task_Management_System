import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, FolderKanban, LayoutGrid, List, Plus, Search, Users } from 'lucide-react';
import { useProjects, useCreateProject, useUsers } from '@/hooks/useProjects';
import { useAuthStore } from '@/store/auth.store';
import { PageHeader } from '@/components/layout/AppShell';
import { Avatar, AvatarStack, Badge, Button, EmptyState, Input, Label, ProgressBar, Skeleton, Textarea } from '@/components/ui/primitives';
import { cn, fmtDate } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n';

export function ProjectsPage() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user)!;
  const [scope, setScope] = useState<'mine' | 'all'>(user.role === 'ADMIN' ? 'all' : 'mine');
  const { data, isLoading } = useProjects(scope);
  const [q, setQ] = useState('');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [createOpen, setCreateOpen] = useState(false);

  const projects = useMemo(
    () => (data?.items ?? []).filter((p) => p.name.toLowerCase().includes(q.toLowerCase()) || p.key.includes(q.toUpperCase())),
    [data, q],
  );

  const canCreate = user.role === 'ADMIN' || user.role === 'MANAGER' || user.role === 'INDIVIDUAL';

  return (
    <>
      <PageHeader
        title={t('Projects')}
        subtitle={t('Every board you own or collaborate on.')}
        actions={
          <div className="flex items-center gap-2">
            {user.role === 'ADMIN' && (
              <div className="flex rounded-lg bg-slate-200 p-1 dark:bg-slate-800 border border-slate-300 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setScope('all')}
                  className={cn(
                    'rounded-md px-3 py-1 text-xs font-semibold transition-all',
                    scope === 'all'
                      ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                      : 'text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                  )}
                >
                  {t('All')}
                </button>
                <button
                  type="button"
                  onClick={() => setScope('mine')}
                  className={cn(
                    'rounded-md px-3 py-1 text-xs font-semibold transition-all',
                    scope === 'mine'
                      ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                      : 'text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                  )}
                >
                  {t('Mine')}
                </button>
              </div>
            )}
            <div className="flex rounded-lg bg-slate-200 p-1 dark:bg-slate-800 border border-slate-300 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setView('grid')}
                className={cn(
                  'flex items-center gap-1 rounded-md px-3 py-1 text-xs font-semibold transition-all',
                  view === 'grid'
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                    : 'text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                )}
              >
                <LayoutGrid size={12} /> {t('Grid')}
              </button>
              <button
                type="button"
                onClick={() => setView('list')}
                className={cn(
                  'flex items-center gap-1 rounded-md px-3 py-1 text-xs font-semibold transition-all',
                  view === 'list'
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                    : 'text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                )}
              >
                <List size={12} /> {t('List')}
              </button>
            </div>
            {canCreate && (
              <Button onClick={() => setCreateOpen(true)}>
                <Plus size={14} /> {t('New project')}
              </Button>
            )}
          </div>
        }
      />

      <div className="relative mb-4 max-w-sm">
        <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Filter projects…')} className="pl-8 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border-slate-300 dark:border-slate-700" />
      </div>

      {isLoading && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[164px] w-full" />)}
        </div>
      )}

      {!isLoading && projects.length === 0 && (
        <EmptyState
          icon={<FolderKanban size={20} />}
          title={t('No projects found')}
          description={q ? t('Try a different search term.') : t('Create your first project to start planning work.')}
          action={canCreate ? <Button onClick={() => setCreateOpen(true)}><Plus size={14} /> {t('New project')}</Button> : undefined}
        />
      )}

      {view === 'grid' ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => (
            <Link
              key={p.id}
              to={`/projects/${p.id}`}
              className="group card relative overflow-hidden p-4 dark:bg-slate-900 dark:border-slate-800 transition-shadow hover:shadow-pop"
            >
              <span className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: p.color }} />
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg text-xs font-bold" style={{ backgroundColor: `${p.color}1a`, color: p.color }}>
                    {p.key.slice(0, 2)}
                  </span>
                  <div>
                    <div className="text-sm font-semibold leading-tight text-ink group-hover:text-brand-700">{p.name}</div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">{p.key} · {p.type.toLowerCase()}</div>
                  </div>
                </div>
                <ArrowUpRight size={14} className="text-slate-300 dark:text-slate-600 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-600" />
              </div>

              <p className="mt-2.5 line-clamp-2 min-h-[32px] text-xs leading-relaxed text-ink-muted">
                {p.description ?? t('No description yet.')}
              </p>

              <div className="mt-3 flex items-center justify-between">
                <Badge className={p.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'} dot={p.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-slate-400'}>
                  {t(p.status.replace('_', ' ').toLowerCase())}
                </Badge>
                <div className="flex items-center gap-1 text-[11px] text-ink-muted">
                  <Users size={11} /> {p._count.members}
                  <span className="mx-0.5 text-slate-300">·</span>
                  {p._count.tasks} {t('tasks')}
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-slate-50 dark:border-slate-800 pt-2.5">
                <span className="text-[10px] text-ink-faint">{t('Due')} {fmtDate(p.dueDate, 'MMM d')}</span>
                <AvatarStack people={[p.owner]} max={1} />
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="card divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden dark:bg-slate-900 dark:border-slate-800">
          {projects.map((p) => (
            <Link key={p.id} to={`/projects/${p.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <span className="h-2.5 w-2.5 rounded" style={{ backgroundColor: p.color }} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-ink">{p.name}</div>
                <div className="text-[10px] uppercase tracking-wider text-ink-faint">{p.key}</div>
              </div>
              <div className="hidden w-40 items-center gap-2 sm:flex">
                <ProgressBar value={Math.min(100, p._count.tasks)} className="flex-1" />
                <span className="text-[10px] text-ink-faint">{p._count.tasks}</span>
              </div>
              <Badge className={cn(p.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400')}>{t(p.status.toLowerCase())}</Badge>
              <span className="hidden text-[11px] text-ink-muted md:block">{p._count.members} {t('members')}</span>
            </Link>
          ))}
        </div>
      )}

      {createOpen && <NewProjectModal open={createOpen} onClose={() => setCreateOpen(false)} />}
    </>
  );
}

/* ------------------------------------------------------------ Fully Theme-Adaptive New Project Modal */
function NewProjectModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const createProject = useCreateProject();
  const { data: usersData } = useUsers();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('#6366f1');
  const [isPersonal, setIsPersonal] = useState(false);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [error, setError] = useState('');

  const users = usersData?.items ?? [];
  const COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#ef4444', '#14b8a6'];

  if (!open) return null;

  const submit = async () => {
    if (!name.trim()) return setError(t('Project name is required.'));
    try {
      await createProject.mutateAsync({
        name: name.trim(),
        description: description.trim() || undefined,
        color,
        type: isPersonal ? 'PERSONAL' : 'TEAM',
        memberIds: isPersonal ? undefined : memberIds,
      });
      void qc.invalidateQueries({ queryKey: ['projects'] });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Could not create project'));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-xl rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden text-slate-900 dark:text-slate-100">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">{t('New project')}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{t('Projects hold boards, tasks and team conversations.')}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="px-6 py-4 max-h-[75vh] overflow-y-auto space-y-4">
          {/* Project Type Toggles */}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setIsPersonal(false)}
              className={cn(
                'rounded-xl border p-3 text-left transition-all',
                !isPersonal
                  ? 'border-brand-500 bg-brand-50/50 dark:bg-brand-950/40 text-slate-900 dark:text-white'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
              )}
            >
              <div className="text-xs font-semibold">{t('Team project')}</div>
              <div className="text-[11px] opacity-80 mt-0.5">{t('Shared board with members & reporting')}</div>
            </button>
            <button
              type="button"
              onClick={() => setIsPersonal(true)}
              className={cn(
                'rounded-xl border p-3 text-left transition-all',
                isPersonal
                  ? 'border-brand-500 bg-brand-50/50 dark:bg-brand-950/40 text-slate-900 dark:text-white'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
              )}
            >
              <div className="text-xs font-semibold">{t('Personal')}</div>
              <div className="text-[11px] opacity-80 mt-0.5">{t('Private to you only')}</div>
            </button>
          </div>

          <div>
            <Label className="text-slate-700 dark:text-slate-300">{t('Project name')}</Label>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Apollo — Mobile App v2"
              className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border-slate-300 dark:border-slate-700"
            />
          </div>

          <div>
            <Label className="text-slate-700 dark:text-slate-300">{t('Description')}</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder={t('What is this project about?')}
              className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border-slate-300 dark:border-slate-700"
            />
          </div>

          <div>
            <Label className="text-slate-700 dark:text-slate-300">{t('Accent colour')}</Label>
            <div className="flex flex-wrap gap-2 mt-1.5">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={cn(
                    'h-7 w-7 rounded-full transition-transform',
                    color === c ? 'scale-110 ring-2 ring-offset-2 ring-brand-500 dark:ring-offset-slate-900' : 'hover:scale-105'
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {!isPersonal && users.length > 0 && (
            <div>
              <Label className="text-slate-700 dark:text-slate-300">{t('Team members')}</Label>
              <div className="max-h-44 space-y-1 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 p-1.5 bg-white dark:bg-slate-900">
                {users.map((u) => {
                  const active = memberIds.includes(u.id);
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => setMemberIds((prev) => (active ? prev.filter((id) => id !== u.id) : [...prev, u.id]))}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-slate-900 dark:text-slate-100 transition-colors',
                        active ? 'bg-brand-50 dark:bg-brand-950/70 text-brand-900 dark:text-brand-100' : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                      )}
                    >
                      <Avatar name={u.name} src={u.avatarUrl} size={22} />
                      <span className="flex-1 truncate">{u.name}</span>
                      <span className="text-[10px] uppercase text-slate-500 dark:text-slate-400">{u.role}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {error && <p className="rounded-lg bg-rose-50 dark:bg-rose-950/60 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">{error}</p>}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <Button variant="outline" onClick={onClose} className="border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800">
            {t('Cancel')}
          </Button>
          <Button onClick={() => void submit()} loading={createProject.isPending}>
            {t('Create project')}
          </Button>
        </div>
      </div>
    </div>
  );
}