import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface AdminAnalytics {
  kpis: { totalUsers: number; activeUsers: number; totalProjects: number; totalTasks: number; completionRate: number };
  roleDistribution: Array<{ role: string; count: number }>;
  tasksByStatus: Array<{ status: string; count: number }>;
  signups: Array<{ date: string; count: number }>;
  logins: Array<{ date: string; count: number }>;
  topProjects: Array<{ id: string; name: string; color: string; _count: { tasks: number; members: number } }>;
}

export interface ProjectAnalytics {
  kpis: { total: number; done: number; open: number; overdue: number; progress: number; velocity: number };
  statusMix: Array<{ status: string; count: number }>;
  priorityMix: Array<{ priority: string; count: number }>;
  velocity: Array<{ week: string; completed: number }>;
  workload: Array<{ userId: string; name: string; avatarUrl: string | null; open: number; done: number }>;
  overdueTasks: Array<{
    id: string;
    title: string;
    dueDate: string;
    priority: string;
    assignees: Array<{ user: { id: string; name: string } }>;
  }>;
}

export interface MeAnalytics {
  kpis: { open: number; dueToday: number; overdue: number; completed30d: number; streak: number };
  todayTasks: Array<{
    id: string;
    title: string;
    status: string;
    priority: string;
    dueDate: string | null;
    project: { id: string; name: string; color: string; key: string };
  }>;
  upcoming: Array<{ id: string; title: string; dueDate: string; priority: string }>;
  completionSeries: Array<{ date: string; count: number }>;
  recentActivity: Array<{ id: string; action: string; entityType: string; entityId: string | null; metadata: Record<string, unknown>; createdAt: string }>;
}

export const useAdminAnalytics = () =>
  useQuery({ queryKey: ['analytics', 'admin'], queryFn: () => api<AdminAnalytics>('/analytics/admin') });

export const useProjectAnalytics = (projectId?: string) =>
  useQuery({
    queryKey: ['analytics', 'project', projectId],
    queryFn: () => api<ProjectAnalytics>(`/analytics/project/${projectId}`),
    enabled: Boolean(projectId),
  });

export const useMeAnalytics = () =>
  useQuery({ queryKey: ['analytics', 'me'], queryFn: () => api<MeAnalytics>('/analytics/me') });

export const useWorkload = () =>
  useQuery({
    queryKey: ['analytics', 'workload'],
    queryFn: () => api<{ items: Array<{ userId: string; name: string; openTasks: number; overdue: number; inProgress: number; avatarUrl: string | null }> }>('/analytics/workload'),
  });
