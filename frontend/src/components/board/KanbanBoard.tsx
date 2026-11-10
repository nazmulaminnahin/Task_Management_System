import { useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  pointerWithin,
  rectIntersection,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Plus } from 'lucide-react';
import type { BoardColumn, Task, TaskStatus } from '@/types';
import { SortableTaskCard, TaskCardView, AddTaskButton } from './TaskCard';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/store/ui.store';

export interface MovePayload {
  taskId: string;
  status: TaskStatus;
  columnId: string;
  beforeId: string | null;
  afterId: string | null;
}

interface KanbanBoardProps {
  columns: BoardColumn[];
  tasks: Task[];
  accentColor?: string;
  canEdit: boolean;
  onCreateTask: (column: BoardColumn) => void;
  onMove: (payload: MovePayload) => void;
}

type Grouped = Record<string, Task[]>;

/**
 * Collision strategy: `pointerWithin` feels natural for nested sortables and
 * avoids the classic "nearest card in another column" flicker; it falls back to
 * closestCorners for keyboard-driven drags (no pointer coordinates available).
 */
const collisionDetection: CollisionDetection = (args) => {
  const pointerHits = pointerWithin(args);
  if (pointerHits.length) return pointerHits;
  const rectHits = rectIntersection(args);
  if (rectHits.length) return rectHits;
  return closestCorners(args);
};

function groupByColumn(tasks: Task[], columns: BoardColumn[]): Grouped {
  const grouped: Grouped = {};
  for (const col of columns) grouped[col.id] = [];
  for (const task of tasks) {
    const key = task.columnId && grouped[task.columnId] !== undefined ? task.columnId : columns.find((c) => c.status === task.status)?.id;
    if (key) grouped[key]!.push(task);
  }
  for (const key of Object.keys(grouped)) grouped[key]!.sort((a, b) => a.position - b.position);
  return grouped;
}

export function KanbanBoard({ columns, tasks, accentColor = '#6366f1', canEdit, onCreateTask, onMove }: KanbanBoardProps) {
  const [grouped, setGrouped] = useState<Grouped>(() => groupByColumn(tasks, columns));
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const openTask = useUiStore((s) => s.openTask);

  // Re-sync whenever the query layer hands us new data (including socket patches).
  useEffect(() => {
    if (activeTask) return; // don't yank the board mid-drag
    setGrouped(groupByColumn(tasks, columns));
  }, [tasks, columns, activeTask]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const allTaskIds = useMemo(() => Object.values(grouped).flat().map((t) => t.id), [grouped]);

  const findContainer = (id: string): string | undefined => {
    if (grouped[id]) return id;
    return Object.keys(grouped).find((key) => grouped[key]!.some((t) => t.id === id));
  };

  const handleDragStart = (event: DragStartEvent) => {
    const id = String(event.active.id);
    setActiveTask(Object.values(grouped).flat().find((t) => t.id === id) ?? null);
  };

  /** Move the card between columns while dragging so the drop preview is accurate. */
  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    const from = findContainer(activeId);
    const to = findContainer(overId);
    if (!from || !to || from === to) return;

    setGrouped((prev) => {
      const fromItems = [...(prev[from] ?? [])];
      const toItems = [...(prev[to] ?? [])];
      const index = fromItems.findIndex((t) => t.id === activeId);
      if (index < 0) return prev;
      const [moved] = fromItems.splice(index, 1);
      if (!moved) return prev;

      const overIndex = toItems.findIndex((t) => t.id === overId);
      const insertAt = overIndex >= 0 ? overIndex : toItems.length;
      toItems.splice(insertAt, 0, { ...moved, columnId: to, status: (columns.find((c) => c.id === to)?.status ?? moved.status) as TaskStatus });
      return { ...prev, [from]: fromItems, [to]: toItems };
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    const activeId = String(active.id);
    setActiveTask(null);
    if (!over) {
      setGrouped(groupByColumn(tasks, columns));
      return;
    }

    const overId = String(over.id);
    const container = findContainer(activeId);
    if (!container) return;
    const column = columns.find((c) => c.id === container);
    if (!column) return;

    setGrouped((prev) => {
      const items = [...(prev[container] ?? [])];
      const oldIndex = items.findIndex((t) => t.id === activeId);
      const newIndex = items.findIndex((t) => t.id === overId);
      const nextItems = oldIndex >= 0 && newIndex >= 0 && oldIndex !== newIndex ? arrayMove(items, oldIndex, newIndex) : items;

      // Neighbours drive the fractional position calculation on the server.
      const finalIndex = nextItems.findIndex((t) => t.id === activeId);
      const beforeId = nextItems[finalIndex - 1]?.id ?? null;
      const afterId = nextItems[finalIndex + 1]?.id ?? null;

      const original = tasks.find((t) => t.id === activeId);
      const changed = !original || original.columnId !== container || original.status !== column.status;
      if ((changed || oldIndex !== newIndex) && canEdit) {
        queueMicrotask(() =>
          onMove({ taskId: activeId, status: column.status, columnId: container, beforeId, afterId }),
        );
      }
      return { ...prev, [container]: nextItems };
    });
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={() => {
        setActiveTask(null);
        setGrouped(groupByColumn(tasks, columns));
      }}
    >
      <div className="flex h-full gap-3 overflow-x-auto pb-4 scrollbar-thin">
        {columns.map((column) => (
          <KanbanColumn
            key={column.id}
            column={column}
            tasks={grouped[column.id] ?? []}
            accentColor={accentColor}
            canEdit={canEdit}
            onOpen={openTask}
            onCreateTask={() => onCreateTask(column)}
            allTaskIds={allTaskIds}
          />
        ))}
      </div>

      <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)' }}>
        {activeTask ? (
          <div className="w-[280px] cursor-grabbing">
            <TaskCardView task={activeTask} onOpen={() => undefined} isActive />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function KanbanColumn({
  column,
  tasks,
  accentColor,
  canEdit,
  onOpen,
  onCreateTask,
}: {
  column: BoardColumn;
  tasks: Task[];
  accentColor: string;
  canEdit: boolean;
  onOpen: (id: string) => void;
  onCreateTask: () => void;
  allTaskIds: string[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id, data: { type: 'column', columnId: column.id } });
  const overLimit = column.wipLimit != null && tasks.length > column.wipLimit;

  return (
    <section className="flex w-[292px] shrink-0 flex-col rounded-xl bg-slate-100/70 dark:bg-slate-900/60 dark:border dark:border-slate-800">
      <header className="flex items-center justify-between gap-2 px-3 pb-2 pt-3">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: accentColor }} />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">{column.name}</h3>
          <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-bold', overLimit ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300' : 'bg-white text-slate-500 dark:bg-slate-800 dark:text-slate-400')}>
            {tasks.length}
            {column.wipLimit != null && <span className="font-medium text-slate-400 dark:text-slate-500">/{column.wipLimit}</span>}
          </span>
        </div>
        {canEdit && (
          <button onClick={onCreateTask} className="rounded p-1 text-slate-400 hover:bg-white hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200" aria-label={`Add task to ${column.name}`}>
            <Plus size={14} />
          </button>
        )}
      </header>

      <div
        ref={setNodeRef}
        className={cn(
          'flex-1 space-y-2 overflow-y-auto px-2 pb-2 pt-0.5 transition-colors scrollbar-thin',
          isOver && 'rounded-lg bg-brand-50/50 ring-2 ring-inset ring-brand-200/70 dark:bg-brand-950/50 dark:ring-brand-800/70',
        )}
        style={{ minHeight: 120, maxHeight: 'calc(100vh - 250px)' }}
      >
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <SortableTaskCard key={task.id} task={task} onOpen={onOpen} dragDisabled={!canEdit} />
          ))}
        </SortableContext>

        {tasks.length === 0 && (
          <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-slate-200 dark:border-slate-800 text-[11px] font-medium text-slate-400 dark:text-slate-500">
            Drop tasks here
          </div>
        )}
      </div>

      {canEdit && (
        <div className="px-2 pb-2">
          <AddTaskButton onClick={onCreateTask} compact />
        </div>
      )}
    </section>
  );
}