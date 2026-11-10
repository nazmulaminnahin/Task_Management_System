import { memo } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CalendarDays, CheckSquare, GripVertical, MessageSquare, Paperclip, Plus } from 'lucide-react';
import type { Task } from '@/types';
import { AvatarStack, Badge, ProgressBar } from '@/components/ui/primitives';
import { PRIORITY_META, cn, dueLabel } from '@/lib/utils';

interface TaskCardProps {
  task: Task;
  onOpen: (id: string) => void;
  dragDisabled?: boolean;
  isActive?: boolean;
}

export const TaskCardView = memo(function TaskCardView({ task, onOpen, isActive }: Omit<TaskCardProps, 'dragDisabled'>) {
  const completed = task.status === 'DONE' || task.status === 'CANCELLED';
  const rawDue = dueLabel(task.dueDate);
  const due = completed ? { ...rawDue, tone: 'normal' as const } : rawDue;
  const doneSubtasks = task.subtasks?.filter((s) => s.isDone).length ?? 0;
  const totalSubtasks = task.subtasks?.length ?? 0;
  const priority = PRIORITY_META[task.priority];

  return (
    <div
      onClick={() => onOpen(task.id)}
      className={cn(
        'group relative cursor-pointer rounded-lg border border-slate-200 bg-white p-3 shadow-card transition-all hover:border-slate-300 hover:shadow-pop dark:bg-slate-900 dark:border-slate-800 dark:hover:border-slate-700',
        isActive && 'rotate-[1.5deg] border-brand-300 shadow-pop ring-2 ring-brand-200 dark:border-brand-600 dark:ring-brand-900',
      )}
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', priority.dot)} />
          <span className="truncate text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{priority.label}</span>
          {task.status === 'DONE' && <CheckSquare size={11} className="text-emerald-500" />}
        </div>
        {task.tags?.slice(0, 2).map((tag) => (
          <span key={tag.id} className="chip shrink-0" style={{ backgroundColor: `${tag.color}14`, color: tag.color }}>
            {tag.name}
          </span>
        ))}
      </div>

      <h4 className="line-clamp-2 text-[13px] font-medium leading-snug text-slate-900 dark:text-white">{task.title}</h4>

      {totalSubtasks > 0 && (
        <div className="mt-2.5">
          <div className="mb-1 flex items-center justify-between text-[10px] font-medium text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1">
              <CheckSquare size={10} /> {doneSubtasks}/{totalSubtasks}
            </span>
            <span>{Math.round((doneSubtasks / totalSubtasks) * 100)}%</span>
          </div>
          <ProgressBar value={(doneSubtasks / totalSubtasks) * 100} tone={doneSubtasks === totalSubtasks ? 'emerald' : 'brand'} />
        </div>
      )}

      <div className="mt-2.5 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          {task.dueDate && (
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold',
                due.tone === 'overdue' && 'bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-300',
                due.tone === 'today' && 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
                due.tone === 'normal' && 'text-slate-500 dark:text-slate-400',
              )}
            >
              <CalendarDays size={10} /> {due.text}
            </span>
          )}
          {(task._count?.comments ?? 0) > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-slate-500 dark:text-slate-400">
              <MessageSquare size={10} /> {task._count?.comments}
            </span>
          )}
          {(task._count?.attachments ?? 0) > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-slate-500 dark:text-slate-400">
              <Paperclip size={10} /> {task._count?.attachments}
            </span>
          )}
        </div>
        {task.assignees?.length > 0 && <AvatarStack people={task.assignees.map((a) => a.user)} max={3} />}
      </div>
    </div>
  );
});

export function SortableTaskCard({ task, onOpen, dragDisabled }: TaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled: dragDisabled,
    data: { type: 'task', columnId: task.columnId, status: task.status },
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition, opacity: isDragging ? 0.35 : 1 }}
      className="relative touch-none"
      {...attributes}
      {...listeners}
    >
      <TaskCardView task={task} onOpen={onOpen} />
      <span className="absolute right-2 top-1/2 hidden -translate-y-1/2 cursor-grab text-slate-300 dark:text-slate-600 group-hover:block">
        <GripVertical size={13} />
      </span>
    </div>
  );
}

export function AddTaskButton({ onClick, compact }: { onClick: () => void; compact?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400 transition-colors hover:border-brand-300 dark:hover:border-slate-700 hover:bg-brand-50/40 dark:hover:bg-slate-800/50 hover:text-brand-700 dark:hover:text-slate-200',
        compact ? 'py-1.5' : 'py-2',
      )}
    >
      <Plus size={13} /> Add task
    </button>
  );
}