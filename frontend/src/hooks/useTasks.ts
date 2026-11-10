import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Comment, Paged, Task, TaskDetail } from '@/types';

export function useProjectTasks(projectId: string | undefined, filters: Record<string, string> = {}) {
  const params = new URLSearchParams({ pageSize: '200', ...filters });
  return useQuery({
    queryKey: ['tasks', projectId, params.toString()],
    queryFn: () => api<Paged<Task>>(`/tasks?projectId=${projectId}&${params.toString()}`),
    enabled: Boolean(projectId),
    placeholderData: (prev) => prev,
  });
}

export function useTaskDetail(taskId: string | null) {
  return useQuery({
    queryKey: ['task', taskId],
    queryFn: () => api<{ task: TaskDetail }>(`/tasks/${taskId}`),
    enabled: Boolean(taskId),
  });
}

export interface CreateTaskInput {
  projectId: string;
  title: string;
  description?: string;
  status?: string;
  priority?: string;
  columnId?: string | null;
  boardId?: string | null;
  dueDate?: string | null;
  startDate?: string | null;
  assigneeIds?: string[];
  tagIds?: string[];
  subtasks?: string[];
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTaskInput) => api<{ task: Task }>('/tasks', { method: 'POST', body: input }),
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: ['tasks', data.task.projectId] });
      void qc.invalidateQueries({ queryKey: ['project', data.task.projectId] });
      void qc.invalidateQueries({ queryKey: ['my-work'] });
    },
  });
}

export function useUpdateTask(projectId?: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Record<string, unknown> }) =>
      api<{ task: Task }>(`/tasks/${id}`, { method: 'PATCH', body: patch }),
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: ['task', data.task.id] });
      void qc.invalidateQueries({ queryKey: ['tasks', projectId ?? data.task.projectId] });
    },
  });
}

export function useMoveTask(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; status: string; columnId: string | null; beforeId?: string | null; afterId?: string | null }) =>
      api<{ task: Task }>(`/tasks/${input.id}/move`, { method: 'PATCH', body: input }),
    // Optimistic: the board already moved the card locally; refetch reconciles positions.
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['tasks', projectId] });
    },
  });
}

export function useDeleteTask(projectId?: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/tasks/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tasks', projectId ?? ''] });
    },
  });
}

export function useAddComment(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { body: string; parentId?: string | null }) =>
      api<{ comment: Comment }>(`/tasks/${taskId}/comments`, { method: 'POST', body: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['task', taskId] });
    },
  });
}

export function useMyWork() {
  return useQuery({
    queryKey: ['my-work'],
    queryFn: () => api<Paged<Task>>('/tasks?pageSize=60'),
    staleTime: 20_000,
  });
}
