import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Paged, ProjectSummary, ProjectWorkspace, User } from '@/types';

export function useProjects(scope: 'mine' | 'all' | 'personal' = 'mine') {
  return useQuery({
    queryKey: ['projects', scope],
    queryFn: () => api<Paged<ProjectSummary>>(`/projects?scope=${scope}`),
    staleTime: 30_000,
  });
}

export function useProjectWorkspace(projectId?: string) {
  return useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api<ProjectWorkspace>(`/projects/${projectId}`),
    enabled: Boolean(projectId),
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      name: string;
      key?: string;
      description?: string;
      type: 'TEAM' | 'PERSONAL';
      color?: string;
      memberIds?: string[];
    }) => api<{ project: ProjectSummary }>('/projects', { method: 'POST', body: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useAddMembers(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { userIds: string[]; projectRole?: 'LEAD' | 'MEMBER' | 'VIEWER' }) =>
      api(`/projects/${projectId}/members`, { method: 'POST', body: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['project', projectId] });
    },
  });
}

export function useUsers(q?: string) {
  return useQuery({
    queryKey: ['users', q ?? ''],
    queryFn: () => api<Paged<User>>(`/users?pageSize=100${q ? `&q=${encodeURIComponent(q)}` : ''}`),
    staleTime: 60_000,
  });
}
