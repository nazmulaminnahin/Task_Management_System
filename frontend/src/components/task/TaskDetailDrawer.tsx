import { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  ChevronDown,
  Clock,
  Hash,
  Paperclip,
  Plus,
  Tag as TagIcon,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { Priority, TaskStatus } from '@/types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Avatar, Badge, Button, Input, ProgressBar, SegmentedControl, Skeleton } from '@/components/ui/primitives';
import { PRIORITY_META, STATUS_META, cn, dueLabel, fmtDate, fromNow } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';
import { useProjectWorkspace } from '@/hooks/useProjects';
import { useDeleteTask, useTaskDetail, useUpdateTask } from '@/hooks/useTasks';
import { api } from '@/lib/api';
import { useUiStore } from '@/store/ui.store';
import { CommentThread } from './CommentThread';
import { Markdown } from './Markdown';

const STATUSES: TaskStatus[] = ['BACKLOG', 'TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'CANCELLED'];
const PRIORITIES: Priority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

export function TaskDetailDrawer() {
  const { openTaskId, closeTask } = useUiStore();
  const { data, isLoading } = useTaskDetail(openTaskId);
  const task = data?.task;
  const { data: workspace } = useProjectWorkspace(task?.projectId);
  const updateTask = useUpdateTask(task?.projectId);
  const deleteTask = useDeleteTask(task?.projectId);
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);

  const [tab, setTab] = useState<'overview' | 'activity'>('overview');
  const [titleDraft, setTitleDraft] = useState('');
  const [descDraft, setDescDraft] = useState('');
  const [descEditing, setDescEditing] = useState(false);
  const [subtaskDraft, setSubtaskDraft] = useState('');
  const [newTag, setNewTag] = useState('');
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (task) {
      setTitleDraft(task.title);
      setDescDraft(task.description ?? '');
      setDescEditing(false);
    }
  }, [task?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && closeTask();
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [closeTask]);

  const members = useMemo(() => workspace?.members ?? [], [workspace]);
  const tags = useMemo(() => workspace?.tags ?? [], [workspace]);
  const canEdit = (workspace?.accessLevel ?? 'VIEW') !== 'VIEW';

  if (!openTaskId) return null;

  const patch = (payload: Record<string, unknown>) => {
    if (!task) return;
    void updateTask.mutateAsync({ id: task.id, patch: payload });
  };

  const saveTitle = () => {
    if (task && titleDraft.trim() && titleDraft.trim() !== task.title) patch({ title: titleDraft.trim() });
  };

  const toggleSubtask = (subtaskId: string, isDone: boolean) => {
    if (!task) return;
    patch({
      subtasks: task.subtasks.map((s) => ({ id: s.id, title: s.title, isDone: s.id === subtaskId ? isDone : s.isDone })),
    });
  };

  const addSubtask = () => {
    if (!task || !subtaskDraft.trim()) return;
    patch({
      subtasks: [
        ...task.subtasks.map((s) => ({ id: s.id, title: s.title, isDone: s.isDone })),
        { title: subtaskDraft.trim(), isDone: false },
      ],
    });
    setSubtaskDraft('');
  };

  const removeSubtask = (id: string) => {
    if (!task) return;
    patch({ subtasks: task.subtasks.filter((s) => s.id !== id).map((s) => ({ id: s.id, title: s.title, isDone: s.isDone })) });
  };

  const toggleAssignee = (userId: string) => {
    if (!task) return;
    const ids = task.assignees.map((a) => a.userId);
    patch({ assigneeIds: ids.includes(userId) ? ids.filter((id) => id !== userId) : [...ids, userId] });
  };

  const toggleTag = (tagId: string) => {
    if (!task) return;
    const ids = task.tags.map((t) => t.id);
    patch({ tagIds: ids.includes(tagId) ? ids.filter((id) => id !== tagId) : [...ids, tagId] });
  };

  const uploadFiles = async (files: FileList | null) => {
    if (!files?.length || !task) return;
    setUploading(true);
    try {
      const form = new FormData();
      Array.from(files)
        .slice(0, 5)
        .forEach((f) => form.append('files', f));
      await api(`/uploads/tasks/${task.id}`, { method: 'POST', body: form });
      await qc.invalidateQueries({ queryKey: ['task', task.id] });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/50 backdrop-blur-[1px]" onMouseDown={closeTask}>
      <aside
        onMouseDown={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-[720px] animate-slide-in flex-col bg-white text-slate-900 shadow-2xl dark:bg-slate-900 dark:text-slate-100 dark:border-l dark:border-slate-800"
        role="dialog"
        aria-modal="true"
        aria-label="Task details"
      >
        {/* Header */}
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-6 py-3.5 dark:border-slate-800">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-2 text-[11px] font-medium text-slate-500 dark:text-slate-400">
              {task?.project && (
                <span className="inline-flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: task.project.color }} />
                  {task.project.key} · {task.project.name}
                </span>
              )}
              <Hash size={10} /> {(openTaskId ?? '').slice(0, 8)}
            </div>
            {isLoading || !task ? (
              <Skeleton className="h-6 w-3/4" />
            ) : (
              <input
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                disabled={!canEdit}
                className="w-full border-0 bg-transparent p-0 text-lg font-semibold tracking-tight text-slate-900 dark:text-white outline-none focus:ring-0 disabled:cursor-default"
              />
            )}
          </div>
          <div className="flex items-center gap-1">
            {canEdit && task && (
              <Button
                variant="ghost"
                size="icon"
                title="Delete task"
                onClick={() => {
                  if (!confirm('Delete this task permanently?')) return;
                  void deleteTask.mutateAsync(task.id).then(closeTask);
                }}
              >
                <Trash2 size={15} className="text-slate-400 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400" />
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={closeTask} aria-label="Close" className="text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200">
              <X size={17} />
            </Button>
          </div>
        </header>

        {isLoading || !task ? (
          <div className="space-y-3 p-6">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-9 w-2/3" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto scrollbar-thin">
            <div className="grid grid-cols-1 gap-6 px-6 py-4 lg:grid-cols-[1fr_224px]">
              {/* Left column */}
              <div className="min-w-0 space-y-5">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <select
                      value={task.status}
                      onChange={(e) => void moveStatus(task.id, e.target.value as TaskStatus).then(() => qc.invalidateQueries({ queryKey: ['task', task.id] }))}
                      disabled={!canEdit}
                      className={cn('h-7 cursor-pointer appearance-none rounded-md border-0 pl-2 pr-7 text-xs font-semibold', STATUS_META[task.status].className)}
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s} className="bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100">
                          {STATUS_META[s].label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={12} className="pointer-events-none absolute right-2 top-2" />
                  </div>
                  <div className="relative">
                    <select
                      value={task.priority}
                      onChange={(e) => patch({ priority: e.target.value })}
                      disabled={!canEdit}
                      className={cn('h-7 cursor-pointer appearance-none rounded-md border-0 pl-2 pr-7 text-xs font-semibold', PRIORITY_META[task.priority].className)}
                    >
                      {PRIORITIES.map((p) => (
                        <option key={p} value={p} className="bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100">
                          {PRIORITY_META[p].label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={12} className="pointer-events-none absolute right-2 top-2" />
                  </div>
                  {task.dueDate && (
                    <Badge className={dueLabel(task.dueDate).tone === 'overdue' ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}>
                      <CalendarDays size={10} /> {fmtDate(task.dueDate, 'MMM d')}
                    </Badge>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Progress</span>
                  <ProgressBar value={task.progress} tone={task.progress === 100 ? 'emerald' : 'brand'} className="flex-1" />
                  <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">{task.progress}%</span>
                </div>

                {/* Description - Fixed High Contrast text color for both themes */}
                <section>
                  <div className="mb-1.5 flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Description</h3>
                    {canEdit && (
                      <button onClick={() => setDescEditing((v) => !v)} className="text-[11px] font-medium text-brand-600 dark:text-brand-400 hover:underline">
                        {descEditing ? 'Preview' : 'Edit'}
                      </button>
                    )}
                  </div>
                  {descEditing ? (
                    <div className="space-y-2">
                      <textarea
                        value={descDraft}
                        onChange={(e) => setDescDraft(e.target.value)}
                        rows={6}
                        placeholder="Markdown supported — **bold**, - lists, `code`…"
                        className="input h-auto min-h-[120px] py-2 leading-relaxed bg-white text-slate-900 border border-slate-300 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 rounded-lg px-3"
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => { patch({ description: descDraft }); setDescEditing(false); }}>
                          Save
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => { setDescDraft(task.description ?? ''); setDescEditing(false); }} className="border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : task.description ? (
                    <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 text-sm text-slate-900 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-100 leading-relaxed [&_*]:!text-slate-900 dark:[&_*]:!text-slate-100">
                      <Markdown>{task.description}</Markdown>
                    </div>
                  ) : (
                    <p className="rounded-lg bg-slate-50 dark:bg-slate-800/60 px-3 py-4 text-center text-sm text-slate-400 dark:text-slate-400">No description yet.</p>
                  )}
                </section>

                {/* Subtasks */}
                <section>
                  <div className="mb-1.5 flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                      Subtasks {task.subtasks.length > 0 && <span className="ml-1 text-slate-400 dark:text-slate-400">({task.subtasks.filter((s) => s.isDone).length}/{task.subtasks.length})</span>}
                    </h3>
                  </div>
                  <div className="space-y-1">
                    {task.subtasks.map((s) => (
                      <div key={s.id} className="group flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-slate-100 dark:hover:bg-slate-800/60">
                        <input
                          type="checkbox"
                          checked={s.isDone}
                          onChange={(e) => toggleSubtask(s.id, e.target.checked)}
                          disabled={!canEdit}
                          className="h-3.5 w-3.5 rounded border-slate-300 dark:border-slate-700 text-brand-600 focus:ring-brand-200 dark:bg-slate-800"
                        />
                        <span className={cn('flex-1 text-sm', s.isDone ? 'text-slate-400 line-through dark:text-slate-500' : 'text-slate-900 dark:text-slate-100')}>{s.title}</span>
                        {canEdit && (
                          <button onClick={() => removeSubtask(s.id)} className="hidden text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 group-hover:block">
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  {canEdit && (
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <Input
                        value={subtaskDraft}
                        onChange={(e) => setSubtaskDraft(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && addSubtask()}
                        placeholder="Add a subtask…"
                        className="h-8 text-[13px] bg-white text-slate-900 border-slate-300 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                      />
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={addSubtask} 
                        disabled={!subtaskDraft.trim()} 
                        className="bg-slate-100 hover:bg-slate-200 text-slate-900 border-slate-300 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-700 shadow-sm"
                      >
                        <Plus size={12} />
                      </Button>
                    </div>
                  )}
                </section>

                {/* Attachments */}
                <section>
                  <h3 className="mb-1.5 text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Attachments</h3>
                  <div className="space-y-1">
                    {task.attachments.map((a) => (
                      <a
                        key={a.id}
                        href={`/api/uploads/${a.storageKey}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2 rounded-md border border-slate-200 dark:border-slate-800 px-2 py-1.5 text-sm hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-900 dark:text-slate-100"
                      >
                        <Paperclip size={13} className="text-slate-400 dark:text-slate-400" />
                        <span className="flex-1 truncate">{a.fileName}</span>
                        <span className="text-[10px] text-slate-400 dark:text-slate-400">{(a.sizeBytes / 1024).toFixed(0)} KB</span>
                      </a>
                    ))}
                  </div>
                  {canEdit && (
                    <label className="mt-1.5 inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:border-brand-400 dark:hover:border-slate-600 hover:text-brand-700 dark:hover:text-slate-100 bg-white dark:bg-slate-800/40">
                      <Upload size={12} /> {uploading ? 'Uploading…' : 'Upload files'}
                      <input type="file" multiple className="hidden" onChange={(e) => void uploadFiles(e.target.files)} />
                    </label>
                  )}
                </section>

                {/* Comments & Activity Tabs - Fixed Button and Container styling for both themes */}
                <section className="border-t border-slate-200 dark:border-slate-800 pt-4">
                  <div className="flex rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
                    <button
                      type="button"
                      onClick={() => setTab('overview')}
                      className={cn(
                        'flex-1 rounded-md py-1.5 text-xs font-semibold transition-all',
                        tab === 'overview'
                          ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                          : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                      )}
                    >
                      Comments ({task.comments.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setTab('activity')}
                      className={cn(
                        'flex-1 rounded-md py-1.5 text-xs font-semibold transition-all',
                        tab === 'activity'
                          ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                          : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                      )}
                    >
                      Activity
                    </button>
                  </div>
                  <div className="mt-3">
                    {tab === 'overview' ? (
                      <CommentThread taskId={task.id} comments={task.comments} members={members} />
                    ) : (
                      <ActivityFeed taskId={task.id} />
                    )}
                  </div>
                </section>
              </div>

              {/* Right column */}
              <aside className="space-y-5 lg:border-l lg:border-slate-200 lg:dark:border-slate-800 lg:pl-5">
                <div>
                  <h4 className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Assignees</h4>
                  <div className="space-y-0.5">
                    {members.map((m) => {
                      const assigned = task.assignees.some((a) => a.userId === m.id);
                      return (
                        <button
                          key={m.id}
                          onClick={() => canEdit && toggleAssignee(m.id)}
                          className={cn(
                            'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-all',
                            assigned 
                              ? 'bg-indigo-50 text-indigo-950 font-semibold border border-indigo-200 shadow-sm dark:bg-indigo-950/70 dark:text-indigo-100 dark:border-indigo-800' 
                              : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200'
                          )}
                        >
                          <Avatar name={m.name} src={m.avatarUrl} size={22} />
                          <span className="flex-1 truncate">{m.name}</span>
                          {assigned && <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">✓</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <h4 className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Tags</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {tags.map((t) => {
                      const active = task.tags.some((x) => x.id === t.id);
                      return (
                        <button
                          key={t.id}
                          onClick={() => canEdit && toggleTag(t.id)}
                          className={cn('chip border transition-colors', active ? 'border-transparent' : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700')}
                          style={active ? { backgroundColor: `${t.color}18`, color: t.color } : undefined}
                        >
                          <TagIcon size={9} /> {t.name}
                        </button>
                      );
                    })}
                  </div>
                  {canEdit && (
                    <div className="mt-2 flex gap-1">
                      <Input value={newTag} onChange={(e) => setNewTag(e.target.value)} placeholder="New tag" className="h-7 text-xs bg-white text-slate-900 border-slate-300 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100" />
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!newTag.trim()}
                        onClick={() => {
                          void api(`/projects/${task.projectId}/tags`, { method: 'POST', body: { name: newTag.trim() } })
                            .then(() => qc.invalidateQueries({ queryKey: ['project', task.projectId] }))
                            .then(() => setNewTag(''));
                        }}
                        className="bg-slate-100 hover:bg-slate-200 text-slate-900 border-slate-300 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-700 shadow-sm"
                      >
                        <Plus size={11} />
                      </Button>
                    </div>
                  )}
                </div>

                <div className="space-y-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 p-3 text-[11px] text-slate-700 dark:text-slate-300">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1"><CalendarDays size={11} /> Start</span>
                    <span className="font-semibold text-slate-900 dark:text-slate-100">{fmtDate(task.startDate, 'MMM d')}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1"><CalendarDays size={11} /> Due</span>
                    <input
                      type="date"
                      value={task.dueDate ? task.dueDate.slice(0, 10) : ''}
                      onChange={(e) => patch({ dueDate: e.target.value ? new Date(e.target.value).toISOString() : null })}
                      disabled={!canEdit}
                      className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-1.5 py-0.5 text-[11px] text-slate-900 dark:text-slate-100 font-medium"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1"><Clock size={11} /> Created</span>
                    <span className="font-semibold text-slate-900 dark:text-slate-100">{fmtDate(task.createdAt, 'MMM d, yyyy')}</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-700 pt-1.5">
                    <span>Logged time</span>
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      {task.timeEntries.reduce((sum, e) => sum + e.minutes, 0)} min
                    </span>
                  </div>
                </div>
              </aside>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

async function moveStatus(taskId: string, status: TaskStatus) {
  await api(`/tasks/${taskId}/move`, { method: 'PATCH', body: { status } });
}

interface ActivityItem {
  id: string;
  action: string;
  entityType: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  actor: { id: string; name: string; avatarUrl: string | null } | null;
}

const ACTION_COPY: Record<string, string> = {
  TASK_CREATED: 'created this task',
  TASK_UPDATED: 'updated this task',
  TASK_MOVED: 'moved this task',
  TASK_ASSIGNED: 'changed assignees',
  TASK_DELETED: 'deleted this task',
  COMMENT_CREATED: 'commented',
};

function ActivityFeed({ taskId }: { taskId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['task-activity', taskId],
    queryFn: () => api<{ items: ActivityItem[] }>(`/tasks/${taskId}/activity`),
  });

  if (isLoading) return <Skeleton className="h-24 w-full" />;
  const items = data?.items ?? [];
  if (!items.length) return <p className="py-4 text-center text-xs text-slate-400 dark:text-slate-400">No activity recorded yet.</p>;

  return (
    <ol className="relative space-y-3 border-l border-slate-200 dark:border-slate-700 pl-4">
      {items.map((a) => (
        <li key={a.id} className="relative">
          <span className="absolute -left-[22px] top-1 h-2 w-2 rounded-full bg-slate-300 dark:bg-slate-600 ring-4 ring-white dark:ring-slate-900" />
          <div className="flex items-center gap-1.5 text-[13px]">
            {a.actor && <Avatar name={a.actor.name} src={a.actor.avatarUrl} size={18} />}
            <span className="font-semibold text-slate-900 dark:text-slate-100">{a.actor?.name ?? 'System'}</span>
            <span className="text-slate-700 dark:text-slate-300">{ACTION_COPY[a.action] ?? a.action.toLowerCase().replace('_', ' ')}</span>
          </div>
          <span className="text-[10px] text-slate-400 dark:text-slate-500">{fromNow(a.createdAt)}</span>
        </li>
      ))}
    </ol>
  );
}