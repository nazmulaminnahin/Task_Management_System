import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileClock, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api';
import type { Paged } from '@/types';
import { PageHeader } from '@/components/layout/AppShell';
import { Avatar, Badge, Button, EmptyState, Select, Skeleton } from '@/components/ui/primitives';
import { fmtDate } from '@/lib/utils';

interface AuditRow {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown>;
  ipAddress: string | null;
  createdAt: string;
  actor: { id: string; name: string; email: string; role: string } | null;
  project: { id: string; name: string } | null;
}

const ACTION_TONE: Record<string, string> = {
  AUTH_LOGIN: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  AUTH_FAILED: 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400',
  ROLE_CHANGED: 'bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-400',
  USER_DEACTIVATED: 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400',
  USER_CREATED: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400',
  TASK_DELETED: 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400',
  PROJECT_ARCHIVED: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400',
};

export function AdminAuditPage() {
  const [action, setAction] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['audit', action, page],
    queryFn: () => api<Paged<AuditRow> & { pageSize: number }>(`/audit?page=${page}&pageSize=50${action ? `&action=${action}` : ''}`),
  });

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / 50));

  return (
    <>
      <PageHeader
        title="Audit log"
        subtitle="Immutable, append-only record of every privileged action."
        badge={<Badge className="bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400"><ShieldCheck size={10} /> Compliance</Badge>}
        actions={
          <Select value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} className="h-8 w-48 text-xs">
            <option value="">All actions</option>
            {['AUTH_LOGIN', 'AUTH_FAILED', 'USER_CREATED', 'USER_UPDATED', 'USER_DEACTIVATED', 'ROLE_CHANGED', 'PROJECT_CREATED', 'PROJECT_UPDATED', 'PROJECT_ARCHIVED', 'TASK_CREATED', 'TASK_MOVED', 'TASK_DELETED', 'COMMENT_CREATED'].map((a) => (
              <option key={a} value={a}>{a.replaceAll('_', ' ').toLowerCase()}</option>
            ))}
          </Select>
        }
      />

      {isLoading ? (
        <Skeleton className="h-80 w-full" />
      ) : !data?.items.length ? (
        <EmptyState icon={<FileClock size={20} />} title="No audit entries" description="Activity will appear here as users interact with the system." />
      ) : (
        <>
          <div className="card overflow-hidden dark:bg-slate-900 dark:border-slate-800">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 text-[10px] font-semibold uppercase tracking-wider border-b border-slate-200 dark:border-slate-700">
                  <th className="px-4 py-3 text-left">When</th>
                  <th className="px-4 py-3 text-left">Actor</th>
                  <th className="px-4 py-3 text-left">Action</th>
                  <th className="px-4 py-3 text-left">Entity</th>
                  <th className="px-4 py-3 text-left">Project</th>
                  <th className="px-4 py-3 text-left">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {data.items.map((row) => (
                  <tr
                    key={row.id}
                    className="bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-900 dark:text-slate-100 transition-colors"
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-slate-500 dark:text-slate-400 text-[11px]">{fmtDate(row.createdAt, 'MMM d, HH:mm:ss')}</td>
                    <td className="px-4 py-3">
                      {row.actor ? (
                        <div className="flex items-center gap-1.5">
                          <Avatar name={row.actor.name} size={20} />
                          <span className="font-medium text-slate-900 dark:text-white text-[12px]">{row.actor.name}</span>
                        </div>
                      ) : (
                        <span className="text-[11px] italic text-slate-400 dark:text-slate-500">anonymous</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${ACTION_TONE[row.action] ?? 'bg-brand-50 text-brand-700 dark:bg-brand-950/50 dark:text-brand-300'}`}>
                        {row.action.replaceAll('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300 text-[11px]">
                      {row.entityType}
                      {row.entityId && <span className="ml-1 text-slate-400 dark:text-slate-500">#{row.entityId.slice(0, 8)}</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-[11px]">{row.project?.name ?? '—'}</td>
                    <td className="px-4 py-3 font-mono text-slate-500 dark:text-slate-400 text-[10px]">{row.ipAddress ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
            <span>{data.total} entries · page {page} of {totalPages}</span>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </div>
        </>
      )}
    </>
  );
}