import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useAdminAnalytics, useWorkload } from '@/hooks/useAnalytics';
import { PageHeader } from '@/components/layout/AppShell';
import { Avatar, Badge, ProgressBar, Skeleton } from '@/components/ui/primitives';
import { STATUS_META, roleLabel } from '@/lib/utils';
import type { TaskStatus } from '@/types';
import { useTranslation } from '@/lib/i18n';

const COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'];
const tooltipStyle = { borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12 };

export function AdminAnalyticsPage() {
  const { t } = useTranslation();
  const { data, isLoading } = useAdminAnalytics();
  const { data: workload } = useWorkload();

  return (
    <>
      <PageHeader title={t('Platform analytics')} subtitle={t('Resource usage, adoption and engagement across tenants.')} />

      {isLoading ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="card p-4 dark:bg-slate-900 dark:border-slate-800">
            <h3 className="mb-3 text-sm font-semibold">{t('Daily logins (14d)')}</h3>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={data?.logins} margin={{ left: -24, right: 8 }}>
                <defs>
                  <linearGradient id="loginFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="date" tickFormatter={(v: string) => v.slice(5)} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Area type="monotone" dataKey="count" name={t('Logins')} stroke="#0ea5e9" strokeWidth={2} fill="url(#loginFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="card p-4 dark:bg-slate-900 dark:border-slate-800">
            <h3 className="mb-3 text-sm font-semibold">{t('Tasks by status')}</h3>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={data?.tasksByStatus} margin={{ left: -24, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="status" tickFormatter={(v: string) => STATUS_META[v as TaskStatus]?.label ?? v} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={42}>
                  {(data?.tasksByStatus ?? []).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="card p-4 dark:bg-slate-900 dark:border-slate-800">
            <h3 className="mb-3 text-sm font-semibold">{t('Role distribution')}</h3>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={data?.roleDistribution} dataKey="count" nameKey="role" outerRadius={85} innerRadius={50} paddingAngle={3} strokeWidth={0}>
                  {(data?.roleDistribution ?? []).map((r, i) => <Cell key={r.role} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number, n: string) => [`${v} ${t('users')}`, roleLabel[n] ?? n]} />
                <Legend iconType="circle" iconSize={7} formatter={(v) => <span className="text-[11px] text-ink-muted">{roleLabel[v as string] ?? v}</span>} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="card p-4 dark:bg-slate-900 dark:border-slate-800">
            <h3 className="mb-3 text-sm font-semibold">{t('Resource usage — workload by user')}</h3>
            <div className="space-y-2.5">
              {(workload?.items ?? []).slice(0, 8).map((w) => (
                <div key={w.userId} className="flex items-center gap-2.5">
                  <Avatar name={w.name} src={w.avatarUrl} size={24} />
                  <span className="w-28 truncate text-xs font-medium text-ink">{w.name}</span>
                  <ProgressBar value={Math.min(100, w.openTasks * 8)} className="flex-1" tone={w.overdue > 0 ? 'rose' : 'brand'} />
                  <span className="w-16 text-right text-[10px] text-ink-muted">{w.openTasks} {t('open')}</span>
                  {w.overdue > 0 && <Badge className="bg-rose-50 text-rose-700">{w.overdue} {t('late')}</Badge>}
                </div>
              ))}
              {!workload?.items.length && <p className="py-6 text-center text-xs text-ink-faint">{t('No workload data yet.')}</p>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}