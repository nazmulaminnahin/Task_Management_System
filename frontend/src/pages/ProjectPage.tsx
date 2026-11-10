import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import {
  ArrowLeft,
  BarChart3,
  CalendarDays,
  KanbanSquare,
  List,
  Pencil,
  Plus,
  Search,
  Users,
} from 'lucide-react';
import type { BoardColumn, ProjectMember, Tag, Task, TaskStatus } from '@/types';
import { useAddMembers, useProjectWorkspace, useUsers } from '@/hooks/useProjects';
import { useCreateTask, useMoveTask, useProjectTasks } from '@/hooks/useTasks';
import { useProjectAnalytics } from '@/hooks/useAnalytics';
import { useSocketEvent } from '@/hooks/useSocket';
import { useUiStore } from '@/store/ui.store';
import { useAuthStore } from '@/store/auth.store';
import { KanbanBoard, type MovePayload } from '@/components/board/KanbanBoard';
import { TaskListView } from '@/components/board/TaskListView';
import { CalendarView } from '@/components/board/CalendarView';
import { Avatar, AvatarStack, Badge, Button, Input, Label, Select, Skeleton, Textarea, ProgressBar } from '@/components/ui/primitives';
import { PRIORITY_META, STATUS_META, cn, fmtDate } from '@/lib/utils';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useTranslation } from '@/lib/i18n';

type Tab = 'workspace' | 'insights' | 'members';

export function ProjectPage() {
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
  const [searchParams] = useSearchParams();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user)!;
  const { viewMode, setViewMode, openTask } = useUiStore();

  const { data: workspace, isLoading } = useProjectWorkspace(projectId);
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<Tab>('workspace');
  const [creating, setCreating] = useState<{ column: BoardColumn } | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const filters = useMemo(
    () => ({
      ...(assigneeFilter ? { assigneeId: assigneeFilter } : {}),
      ...(priorityFilter ? { priority: priorityFilter } : {}),
      ...(search.trim() ? { q: search.trim() } : {}),
    }),
    [assigneeFilter, priorityFilter, search],
  );

  const { data: tasksData } = useProjectTasks(projectId, filters);
  const tasks = tasksData?.items ?? [];
  const moveTask = useMoveTask(projectId!);

  const accessLevel = workspace?.accessLevel ?? 'VIEW';
  const canEdit = accessLevel !== 'VIEW';
  const canManage = accessLevel === 'MANAGE';
  const board = workspace?.boards[0];
  const columns = board?.columns ?? [];

  /* Deep link: /projects/:id?task=<taskId> opens the drawer */
  useEffect(() => {
    const taskId = searchParams.get('task');
    if (taskId) openTask(taskId);
  }, [searchParams, openTask]);

  /* ------------------------------------------------- Realtime cache patching */
  const patchTaskLists = useCallback(
    (updater: (items: Task[]) => Task[]) => {
      qc.setQueriesData<{ items: Task[]; total: number }>({ queryKey: ['tasks', projectId] }, (old) =>
        old ? { ...old, items: updater(old.items) } : old,
      );
    },
    [qc, projectId],
  );

  useSocketEvent<Task & { actorId: string; from?: TaskStatus }>('task:moved', (payload) => {
    patchTaskLists((items) =>
      items.map((t) =>
        t.id === payload.id
          ? { ...t, status: payload.status, columnId: payload.columnId, position: payload.position, updatedAt: payload.updatedAt, progress: payload.progress }
          : t,
      ),
    );
  });

  useSocketEvent<Task>('task:created', (payload) => {
    patchTaskLists((items) => (items.some((t) => t.id === payload.id) ? items : [...items, payload]));
    void qc.invalidateQueries({ queryKey: ['project', projectId] });
  });

  useSocketEvent<Task>('task:updated', (payload) => {
    patchTaskLists((items) => items.map((t) => (t.id === payload.id ? { ...t, ...payload } : t)));
    void qc.invalidateQueries({ queryKey: ['task', payload.id] });
  });

  useSocketEvent<{ id: string }>('task:deleted', (payload) => {
    patchTaskLists((items) => items.filter((t) => t.id !== payload.id));
  });

  useSocketEvent<{ taskId: string }>('comment:created', (payload) => {
    void qc.invalidateQueries({ queryKey: ['task', payload.taskId] });
  });

  const handleMove = (payload: MovePayload) => {
    patchTaskLists((items) =>
      items.map((t) =>
        t.id === payload.taskId
          ? { ...t, status: payload.status, columnId: payload.columnId, progress: payload.status === 'DONE' ? 100 : t.progress }
          : t,
      ),
    );
    moveTask.mutate({ id: payload.taskId, status: payload.status, columnId: payload.columnId, beforeId: payload.beforeId, afterId: payload.afterId });
  };

  if (isLoading || !workspace) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 w-full" />
        <div className="flex gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-72 w-[292px]" />)}
        </div>
      </div>
    );
  }

  const { project, members, tags } = workspace;
  const doneCount = tasks.filter((t) => t.status === 'DONE').length;
  const overallProgress = tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0;

  return (
    <>
      {/* ------------------------------------------------------ Project header */}
      <div className="mb-4">
        <Link to="/projects" className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white">
          <ArrowLeft size={12} /> {t('All projects')}
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold" style={{ backgroundColor: `${project.color}1a`, color: project.color }}>
              {project.key.slice(0, 2)}
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">{project.name}</h1>
                <Badge className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">{project.key}</Badge>
                <Badge className={project.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'} dot={project.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-slate-400'}>
                  {project.status.replace('_', ' ').toLowerCase()}
                </Badge>
                <Badge className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 font-medium">
                  {accessLevel.toLowerCase()} {t('access')}
                </Badge>
              </div>
              <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-300">{project.description}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <AvatarStack people={members} max={4} />
            {canManage && (
              <Button variant="outline" size="sm" onClick={() => setEditOpen(true)} className="border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200">
                <Pencil size={12} /> {t('Edit project')}
              </Button>
            )}
            {canManage && <ManageMembersButton projectId={project.id} members={members} />}
            {canEdit && (
              <Button onClick={() => setCreating({ column: columns[1] ?? columns[0]! })}>
                <Plus size={14} /> {t('New task')}
              </Button>
            )}
          </div>
        </div>

        {/* Project progress & view toggle header bar */}
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-2.5 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">{t('Progress')}</span>
            <ProgressBar value={overallProgress} tone={overallProgress === 100 ? 'emerald' : 'brand'} className="w-32" />
            <span className="text-[11px] font-semibold text-slate-900 dark:text-slate-100">{overallProgress}%</span>
          </div>
          <span className="hidden text-slate-300 dark:text-slate-700 sm:block">|</span>
          <span className="text-[11px] text-slate-600 dark:text-slate-400">{doneCount}/{tasks.length} {t('tasks done')}</span>
          <span className="hidden text-slate-300 dark:text-slate-700 sm:block">|</span>
          <span className="text-[11px] text-slate-600 dark:text-slate-400">{t('Due')} {fmtDate(project.dueDate, 'MMM d, yyyy')}</span>

          <div className="ml-auto flex items-center gap-2">
            {tab === 'workspace' && (
              <div className="flex rounded-lg bg-slate-200 p-1 dark:bg-slate-800 border border-slate-300 dark:border-slate-700">
                {[
                  { value: 'board', label: t('Board'), icon: <KanbanSquare size={12} /> },
                  { value: 'list', label: t('List'), icon: <List size={12} /> },
                  { value: 'calendar', label: t('Calendar'), icon: <CalendarDays size={12} /> },
                ].map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setViewMode(item.value as any)}
                    className={cn(
                      'flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold transition-all',
                      viewMode === item.value
                        ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                        : 'text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                    )}
                  >
                    {item.icon} {item.label}
                  </button>
                ))}
              </div>
            )}
            <div className="flex rounded-lg bg-slate-200 p-1 dark:bg-slate-800 border border-slate-300 dark:border-slate-700">
              {[
                { value: 'workspace', label: t('Workspace') },
                { value: 'insights', label: t('Insights'), icon: <BarChart3 size={12} /> },
                { value: 'members', label: t('Members'), icon: <Users size={12} /> },
              ].map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setTab(item.value as Tab)}
                  className={cn(
                    'flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold transition-all',
                    tab === item.value
                      ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                      : 'text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                  )}
                >
                  {item.icon} {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {tab === 'workspace' && (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('Search tasks…')} className="h-8 w-56 pl-7 text-[13px] bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border-slate-300 dark:border-slate-700" />
            </div>
            
            <Button
              variant={filtersOpen || assigneeFilter || priorityFilter ? 'subtle' : 'outline'}
              size="sm"
              onClick={() => setFiltersOpen((v) => !v)}
              className="border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Users size={12} /> {t('Filters')}
              {(assigneeFilter || priorityFilter) && <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />}
            </Button>

            {filtersOpen && (
              <>
                <Select value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)} className="h-8 w-44 text-[13px] bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border-slate-300 dark:border-slate-700">
                  <option value="">{t('All assignees')}</option>
                  {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </Select>
                <Select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} className="h-8 w-36 text-[13px] bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border-slate-300 dark:border-slate-700">
                  <option value="">{t('All priorities')}</option>
                  {(['URGENT', 'HIGH', 'MEDIUM', 'LOW'] as const).map((p) => <option key={p} value={p}>{PRIORITY_META[p].label}</option>)}
                </Select>
                {(assigneeFilter || priorityFilter) && (
                  <button onClick={() => { setAssigneeFilter(''); setPriorityFilter(''); }} className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline">
                    {t('Clear')}
                  </button>
                )}
              </>
            )}
            <span className="ml-auto text-[11px] text-slate-500 dark:text-slate-400">{tasks.length} {t('tasks')}</span>
          </div>

          {viewMode === 'board' && (
            <KanbanBoard
              columns={columns}
              tasks={tasks}
              accentColor={project.color}
              canEdit={canEdit}
              onCreateTask={(column) => setCreating({ column })}
              onMove={handleMove}
            />
          )}
          {viewMode === 'list' && <TaskListView tasks={tasks} />}
          {viewMode === 'calendar' && <CalendarView tasks={tasks} />}
        </>
      )}

      {tab === 'insights' && <ProjectInsights projectId={project.id} />}

      {tab === 'members' && (
        <div className="card divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-3 px-4 py-3">
              <Avatar name={m.name} src={m.avatarUrl} size={32} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-slate-900 dark:text-white">{m.name}</div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">{m.email}</div>
              </div>
              <Badge className={m.projectRole === 'LEAD' ? 'bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}>{m.projectRole.toLowerCase()}</Badge>
              <Badge className="bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-400">{m.role.toLowerCase()}</Badge>
            </div>
          ))}
        </div>
      )}

      {creating && (
        <CreateTaskModal
          projectId={project.id}
          column={creating.column}
          columns={columns}
          members={members}
          tags={tags}
          onClose={() => setCreating(null)}
        />
      )}

      {editOpen && (
        <EditProjectModal
          project={project}
          onClose={() => setEditOpen(false)}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------ Edit Project Modal */
function EditProjectModal({
  project,
  onClose,
}: {
  project: any;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? '');
  const [status, setStatus] = useState(project.status);
  const [dueDate, setDueDate] = useState(project.dueDate ? project.dueDate.split('T')[0] : '');
  const [error, setError] = useState('');

  const updateProject = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed to update project');
      return res.json();
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['project', project.id] });
      void qc.invalidateQueries({ queryKey: ['projects'] });
      onClose();
    },
    onError: (e: any) => setError(e.message || t('Could not update project')),
  });

  const submit = () => {
    if (!name.trim()) return setError(t('Project name is required.'));
    updateProject.mutate({
      name: name.trim(),
      description: description.trim() || null,
      status,
      dueDate: dueDate ? new Date(dueDate).toISOString() : null,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden text-slate-900 dark:text-slate-100">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">{t('Edit project')}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{t('Update project details and deadline.')}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 transition-colors">
            ✕
          </button>
        </div>

        <div className="px-6 py-4 space-y-3.5">
          <div>
            <Label className="text-slate-700 dark:text-slate-300">{t('Project name')}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border-slate-300 dark:border-slate-700" />
          </div>
          <div>
            <Label className="text-slate-700 dark:text-slate-300">{t('Description')}</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border-slate-300 dark:border-slate-700" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-slate-700 dark:text-slate-300">{t('Status')}</Label>
              <Select value={status} onChange={(e) => setStatus(e.target.value)} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border-slate-300 dark:border-slate-700">
                <option value="ACTIVE" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">{t('Active')}</option>
                <option value="ON_HOLD" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">{t('On hold')}</option>
                <option value="COMPLETED" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">{t('Completed')}</option>
              </Select>
            </div>
            <div>
              <Label className="text-slate-700 dark:text-slate-300">{t('Deadline (Due date)')}</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border-slate-300 dark:border-slate-700" />
            </div>
          </div>
          {error && <p className="rounded-lg bg-rose-50 dark:bg-rose-950/60 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <Button variant="outline" onClick={onClose} className="border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800">
            {t('Cancel')}
          </Button>
          <Button onClick={submit} loading={updateProject.isPending}>
            {t('Save changes')}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ Create task */
function CreateTaskModal({
  projectId,
  column,
  columns,
  members,
  tags,
  onClose,
}: {
  projectId: string;
  column: BoardColumn;
  columns: BoardColumn[];
  members: ProjectMember[];
  tags: Tag[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const createTask = useCreateTask();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'>('MEDIUM');
  const [columnId, setColumnId] = useState(column.id);
  const [dueDate, setDueDate] = useState('');
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [error, setError] = useState('');

  const submit = async () => {
    if (title.trim().length < 2) return setError(t('Task needs a title.'));
    const status = (columns.find((c) => c.id === columnId)?.status ?? 'TODO') as TaskStatus;
    try {
      await createTask.mutateAsync({
        projectId,
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        status,
        columnId,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
        assigneeIds,
        tagIds,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Could not create task'));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-xl rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden text-slate-900 dark:text-slate-100">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">{t('New task')}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {`${t('Adding to')} ${columns.find((c) => c.id === columnId)?.name ?? column.name}`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="px-6 py-4 max-h-[75vh] overflow-y-auto space-y-3.5 text-slate-900 dark:text-slate-100">
          <div>
            <Label className="text-slate-700 dark:text-slate-300">{t('Title')}</Label>
            <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('What needs to be done?')} onKeyDown={(e) => e.key === 'Enter' && void submit()} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border-slate-300 dark:border-slate-700" />
          </div>
          <div>
            <Label className="text-slate-700 dark:text-slate-300">{t('Description (Markdown)')}</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder={t('Context, acceptance criteria, links…')} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border-slate-300 dark:border-slate-700" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-slate-700 dark:text-slate-300">{t('Column')}</Label>
              <Select value={columnId} onChange={(e) => setColumnId(e.target.value)} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border-slate-300 dark:border-slate-700">
                {columns.map((c) => <option key={c.id} value={c.id} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">{c.name}</option>)}
              </Select>
            </div>
            <div>
              <Label className="text-slate-700 dark:text-slate-300">{t('Priority')}</Label>
              <Select value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border-slate-300 dark:border-slate-700">
                {(['URGENT', 'HIGH', 'MEDIUM', 'LOW'] as const).map((p) => <option key={p} value={p} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">{PRIORITY_META[p].label}</option>)}
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-slate-700 dark:text-slate-300">{t('Due date')}</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border-slate-300 dark:border-slate-700" />
          </div>
          <div>
            <Label className="text-slate-700 dark:text-slate-300">{t('Assignees')}</Label>
            <div className="flex flex-wrap gap-1.5">
              {members.map((m) => {
                const active = assigneeIds.includes(m.id);
                return (
                  <button
                    key={m.id}
                    onClick={() => setAssigneeIds((prev) => (active ? prev.filter((id) => id !== m.id) : [...prev, m.id]))}
                    className={cn('flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs', active ? 'border-brand-300 bg-brand-50 text-brand-700 dark:bg-brand-950/70 dark:text-brand-300' : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800')}
                  >
                    <Avatar name={m.name} src={m.avatarUrl} size={16} /> {m.name.split(' ')[0]}
                  </button>
                );
              })}
            </div>
          </div>
          {tags.length > 0 && (
            <div>
              <Label className="text-slate-700 dark:text-slate-300">{t('Tags')}</Label>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((t) => {
                  const active = tagIds.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      onClick={() => setTagIds((prev) => (active ? prev.filter((id) => id !== t.id) : [...prev, t.id]))}
                      className={cn('chip border', active ? 'border-transparent' : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300')}
                      style={active ? { backgroundColor: `${t.color}18`, color: t.color } : undefined}
                    >
                      {t.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {error && <p className="rounded-lg bg-rose-50 dark:bg-rose-950/60 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <Button variant="outline" onClick={onClose} className="border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800">
            {t('Cancel')}
          </Button>
          <Button onClick={() => void submit()} loading={createTask.isPending}>{t('Create task')}</Button>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------- Manage members */
function ManageMembersButton({ projectId, members }: { projectId: string; members: ProjectMember[] }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { data: users } = useUsers();
  const addMembers = useAddMembers(projectId);
  const [selected, setSelected] = useState<string[]>([]);
  const [role, setRole] = useState<'MEMBER' | 'LEAD' | 'VIEWER'>('MEMBER');

  const candidates = (users?.items ?? []).filter((u) => !members.some((m) => m.id === u.id));

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200">
        <Users size={13} /> {t('Members')}
      </Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden text-slate-900 dark:text-slate-100">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">{t('Project members')}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {`${members.length} ${t('people have access')}`}
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="px-6 py-4 max-h-[75vh] overflow-y-auto space-y-4 text-slate-900 dark:text-slate-100">
              <div>
                <Label className="text-slate-700 dark:text-slate-300">{t('Current members')}</Label>
                <div className="space-y-1">
                  {members.map((m) => (
                    <div key={m.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-900 dark:text-slate-100">
                      <Avatar name={m.name} src={m.avatarUrl} size={22} />
                      <span className="flex-1 truncate">{m.name}</span>
                      <span className="text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400">{m.projectRole}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <Label className="text-slate-700 dark:text-slate-300">{t('Add people')}</Label>
                <div className="max-h-44 space-y-1 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 p-1.5 scrollbar-thin bg-white dark:bg-slate-900">
                  {candidates.map((u) => {
                    const active = selected.includes(u.id);
                    return (
                      <button
                        key={u.id}
                        onClick={() => setSelected((prev) => (active ? prev.filter((id) => id !== u.id) : [...prev, u.id]))}
                        className={cn('flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-slate-900 dark:text-slate-100', active ? 'bg-brand-50 dark:bg-brand-950/70 text-brand-900 dark:text-brand-100' : 'hover:bg-slate-100 dark:hover:bg-slate-800')}
                      >
                        <Avatar name={u.name} src={u.avatarUrl} size={22} />
                        <span className="flex-1 truncate">{u.name}</span>
                        <span className="text-[10px] uppercase text-slate-500 dark:text-slate-400">{u.role}</span>
                      </button>
                    );
                  })}
                  {!candidates.length && <p className="px-2 py-3 text-xs text-slate-500 dark:text-slate-400">{t('Everyone is already a member.')}</p>}
                </div>
              </div>
              <div>
                <Label className="text-slate-700 dark:text-slate-300">{t('Access level')}</Label>
                <Select value={role} onChange={(e) => setRole(e.target.value as typeof role)} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border-slate-300 dark:border-slate-700">
                  <option value="MEMBER" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">{t('Member — can create and edit tasks')}</option>
                  <option value="LEAD" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">{t('Lead — full project management')}</option>
                  <option value="VIEWER" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">{t('Viewer — read-only')}</option>
                </Select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
              <Button variant="outline" onClick={() => setOpen(false)} className="border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800">
                {t('Close')}
              </Button>
              <Button
                disabled={!selected.length}
                loading={addMembers.isPending}
                onClick={() => void addMembers.mutateAsync({ userIds: selected, projectRole: role }).then(() => { setSelected([]); setOpen(false); })}
              >
                {t('Add')} {selected.length || ''}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* -------------------------------------------------------------- Insights */
function ProjectInsights({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const { data, isLoading } = useProjectAnalytics(projectId);
  const tools = { borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12 };

  if (isLoading) return <Skeleton className="h-72 w-full" />;

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <div className="card p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">{t('Status mix')}</h3>
        <ResponsiveContainer width="100%" height={240}>
          <PieChart>
            <Pie data={data?.statusMix} dataKey="count" nameKey="status" innerRadius={55} outerRadius={85} paddingAngle={3} strokeWidth={0}>
              {(data?.statusMix ?? []).map((s, i) => (
                <Cell key={s.status} fill={['#64748b', '#6366f1', '#0ea5e9', '#f59e0b', '#10b981', '#cbd5e1'][i % 6]} />
              ))}
            </Pie>
            <Tooltip contentStyle={tools} formatter={(v: number, n: string) => [`${v} tasks`, STATUS_META[n as TaskStatus]?.label ?? n]} />
          </PieChart>
        </ResponsiveContainer>
        <div className="mt-1 flex flex-wrap justify-center gap-2">
          {(data?.statusMix ?? []).map((s, i) => (
            <span key={s.status} className="inline-flex items-center gap-1 text-[10px] text-slate-600 dark:text-slate-400">
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: ['#64748b', '#6366f1', '#0ea5e9', '#f59e0b', '#10b981', '#cbd5e1'][i % 6] }} />
              {STATUS_META[s.status as TaskStatus]?.label ?? s.status} ({s.count})
            </span>
          ))}
        </div>
      </div>

      <div className="card p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">{t('Priority distribution')}</h3>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data?.priorityMix} margin={{ left: -24, right: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="priority" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip contentStyle={tools} />
            <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={38}>
              {(data?.priorityMix ?? []).map((p) => (
                <Cell key={p.priority} fill={p.priority === 'URGENT' ? '#f43f5e' : p.priority === 'HIGH' ? '#f59e0b' : p.priority === 'MEDIUM' ? '#0ea5e9' : '#94a3b8'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="card p-4 lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">{t('Team workload')}</h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {(data?.workload ?? []).map((w) => (
            <div key={w.userId} className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 bg-slate-50/50 dark:bg-slate-800/40">
              <div className="flex items-center gap-2">
                <Avatar name={w.name} src={w.avatarUrl} size={24} />
                <span className="truncate text-xs font-medium text-slate-900 dark:text-slate-100">{w.name}</span>
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-lg font-semibold text-slate-900 dark:text-white">{w.open}</span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400">{w.done} {t('done')}</span>
              </div>
              <ProgressBar value={w.open + w.done ? (w.done / (w.open + w.done)) * 100 : 0} className="mt-1.5" tone="emerald" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}