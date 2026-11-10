import { useTranslation } from '@/lib/i18n';
import { Link } from 'react-router-dom';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  CircleDot,
  Flame,
  FolderKanban,
  ListChecks,
  ShieldCheck,
  TrendingUp,
  Users,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { useAdminAnalytics, useMeAnalytics, useProjectAnalytics, useWorkload } from '@/hooks/useAnalytics';
import { useProjects } from '@/hooks/useProjects';
import { PageHeader, StatCard } from '@/components/layout/AppShell';
import { Avatar, Badge, EmptyState, ProgressBar, Skeleton } from '@/components/ui/primitives';
import { PRIORITY_META, STATUS_META, cn, dueLabel, fromNow, roleLabel } from '@/lib/utils';
import { useUiStore } from '@/store/ui.store';
import { useProjectTasks } from '@/hooks/useTasks';

const CHART_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'];

const tooltipStyle = {
  borderRadius: 10,
  border: '1px solid #e2e8f0',
  fontSize: 12,
  boxShadow: '0 8px 24px -8px rgb(15 23 42 / 0.2)',
};

/** Router between the four role-specific dashboards. */
export function DashboardPage() {
  const user = useAuthStore((s) => s.user)!;
  if (user.role === 'ADMIN') return <AdminDashboard />;
  if (user.role === 'MANAGER') return <ManagerDashboard />;
  return <PersonalDashboard />;
}

/* ------------------------------------------------------------------ Admin */
function AdminDashboard() {
  const { t } = useTranslation();
  const { data, isLoading } = useAdminAnalytics();
  const { data: workload } = useWorkload();

  return (
    <>
      <PageHeader
        title={t('Platform overview')}
        subtitle={t('System-wide activity, adoption and health across every workspace.')}
        badge={<Badge className="bg-rose-50 text-rose-700"><ShieldCheck size={10} />{t('System Admin')}</Badge>}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label={<span className="text-xs font-bold text-slate-700 dark:text-slate-100">{t('Total users')}</span>} value={data?.kpis.totalUsers ?? '—'} icon={<Users size={15} />} loading={isLoading} hint={`${data?.kpis.activeUsers ?? 0} ${t('active')}`} />
        <StatCard label={<span className="text-xs font-bold text-slate-700 dark:text-slate-100">{t('Projects')}</span>} value={data?.kpis.totalProjects ?? '—'} icon={<FolderKanban size={15} />} tone="emerald" loading={isLoading} hint={t('non-archived')} />
        <StatCard label={<span className="text-xs font-bold text-slate-700 dark:text-slate-100">{t('Tasks')}</span>} value={data?.kpis.totalTasks ?? '—'} icon={<ListChecks size={15} />} tone="amber" loading={isLoading} hint={t('all time')} />
        <StatCard label={<span className="text-xs font-bold text-slate-700 dark:text-slate-100">{t('Completion rate')}</span>} value={`${data?.kpis.completionRate ?? 0}%`} icon={<CheckCircle2 size={15} />} tone="brand" loading={isLoading} hint={t('tasks marked done')} />
        <StatCard label={<span className="text-xs font-bold text-slate-700 dark:text-slate-100">{t('Signups (30d)')}</span>} value={data?.signups.reduce((s, d) => s + d.count, 0) ?? '—'} icon={<TrendingUp size={15} />} tone="rose" loading={isLoading} hint={t('new accounts')} />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <div className="card p-4 dark:bg-slate-900 dark:border-slate-800 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink">{t('Signups & logins')}</h3>
            <span className="text-[10px] font-medium uppercase tracking-widest text-ink-faint">{t('Last 30 / 14 days')}</span>
          </div>
          {isLoading ? <Skeleton className="h-56 w-full" /> : (
            <ResponsiveContainer width="100%" height={224}>
              <AreaChart data={data?.signups} margin={{ left: -20, right: 8, top: 4 }}>
                <defs>
                  <linearGradient id="signupFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="date" tickFormatter={(v: string) => v.slice(5)} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} interval={6} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Area type="monotone" dataKey="count" name={t("Signups")} stroke="#6366f1" strokeWidth={2} fill="url(#signupFill)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card p-4 dark:bg-slate-900 dark:border-slate-800">
          <h3 className="mb-3 text-sm font-semibold text-ink">{t('Role distribution')}</h3>
          {isLoading ? <Skeleton className="h-56 w-full" /> : (
            <ResponsiveContainer width="100%" height={224}>
              <PieChart>
                <Pie data={data?.roleDistribution} dataKey="count" nameKey="role" innerRadius={52} outerRadius={78} paddingAngle={3} strokeWidth={0}>
                  {(data?.roleDistribution ?? []).map((entry, i) => (
                    <Cell key={entry.role} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number, n: string) => [`${v} ${t("users")}`, t(roleLabel[n] ?? n)]} />
                <Legend iconType="circle" iconSize={7} formatter={(v) => <span className="text-[11px] text-ink-muted">{t(roleLabel[v as string] ?? String(v))}</span>} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <div className="card p-4 dark:bg-slate-900 dark:border-slate-800 lg:col-span-2">
          <h3 className="mb-3 text-sm font-semibold text-ink">{t('Largest projects')}</h3>
          <div className="space-y-2">
            {(data?.topProjects ?? []).map((p) => (
              <Link key={p.id} to={`/projects/${p.id}`} className="flex items-center gap-3 rounded-lg border border-slate-100 dark:border-slate-800 px-3 py-2 hover:border-slate-200 dark:hover:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <span className="h-7 w-7 rounded-md" style={{ backgroundColor: `${p.color}22`, color: p.color }}>
                  <span className="flex h-full w-full items-center justify-center text-[11px] font-bold">{p.name.slice(0, 2).toUpperCase()}</span>
                </span>
                <span className="flex-1 truncate text-sm font-medium text-ink">{p.name}</span>
                <span className="text-[11px] text-ink-muted">{p._count.members} {t('members')}</span>
                <Badge className="bg-slate-100 text-slate-600">{p._count.tasks} {t('tasks')}</Badge>
                <ArrowUpRight size={13} className="text-ink-faint" />
              </Link>
            ))}
            {!data?.topProjects.length && <p className="py-6 text-center text-sm text-ink-faint">{t('No projects yet.')}</p>}
          </div>
        </div>

        <div className="card p-4 dark:bg-slate-900 dark:border-slate-800">
          <h3 className="mb-3 text-sm font-semibold text-ink">{t('Workload watch')}</h3>
          <div className="space-y-2.5">
            {(workload?.items ?? []).slice(0, 6).map((w) => (
              <div key={w.userId} className="flex items-center gap-2">
                <Avatar name={w.name} src={w.avatarUrl} size={22} />
                <span className="flex-1 truncate text-xs font-medium text-ink">{w.name}</span>
                <span className="text-[10px] font-semibold text-ink-muted">{w.openTasks} {t('open')}</span>
                {w.overdue > 0 && <span className="rounded bg-rose-50 px-1 text-[10px] font-bold text-rose-600">{w.overdue} {t('late')}</span>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- Manager */
function ManagerDashboard() {
  const { t } = useTranslation();
  const { data: projects } = useProjects('mine');
  const firstProject = projects?.items[0];
  const { data: analytics, isLoading } = useProjectAnalytics(firstProject?.id);
  const { data: workload } = useWorkload();

  return (
    <>
      <PageHeader
        title={t('Team command centre')}
        subtitle={t('Portfolio progress, delivery velocity and workload balance.')}
        actions={<Link to="/projects" className="btn-outline">{t('All projects')} <ArrowUpRight size={14} /></Link>}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={<span className="text-xs font-bold text-slate-700 dark:text-slate-100">{t('Tracked projects')}</span>} value={projects?.items.length ?? '—'} icon={<FolderKanban size={15} />} loading={!projects} />
        <StatCard label={<span className="text-xs font-bold text-slate-700 dark:text-slate-100">{t('Open tasks')}</span>} value={analytics?.kpis.open ?? '—'} icon={<CircleDot size={15} />} tone="amber" loading={isLoading} hint={firstProject?.name} />
        <StatCard label={<span className="text-xs font-bold text-slate-700 dark:text-slate-100">{t('Weekly velocity')}</span>} value={analytics?.kpis.velocity ?? '—'} icon={<TrendingUp size={15} />} tone="emerald" loading={isLoading} hint={t('tasks completed this week')} />
        <StatCard label={<span className="text-xs font-bold text-slate-700 dark:text-slate-100">{t('Overdue')}</span>} value={analytics?.kpis.overdue ?? '—'} icon={<AlertTriangle size={15} />} tone="rose" loading={isLoading} hint={t('needs attention today')} />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <div className="card p-4 dark:bg-slate-900 dark:border-slate-800 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink">{t('Delivery velocity')} — {firstProject?.key ?? '—'}</h3>
            <span className="text-[10px] font-medium uppercase tracking-widest text-ink-faint">{t('8 weeks')}</span>
          </div>
          {isLoading ? <Skeleton className="h-56 w-full" /> : (
            <ResponsiveContainer width="100%" height={224}>
              <BarChart data={analytics?.velocity} margin={{ left: -22, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="week" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v} ${t("completed")}`, t("Velocity")]} />
                <Bar dataKey="completed" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={34} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card p-4 dark:bg-slate-900 dark:border-slate-800">
          <h3 className="mb-3 text-sm font-semibold text-ink">{t('Project health')}</h3>
          <div className="space-y-3">
            {(projects?.items ?? []).slice(0, 5).map((p) => (
              <Link key={p.id} to={`/projects/${p.id}`} className="block rounded-lg border border-slate-100 dark:border-slate-800 p-2.5 hover:border-slate-200 dark:hover:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-[13px] font-medium text-ink">
                    <span className="h-2 w-2 rounded" style={{ backgroundColor: p.color }} />
                    {p.name}
                  </span>
                  <Badge className={p.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}>{t(p.status.replace('_', ' ').toLowerCase())}</Badge>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <ProgressBar value={Math.min(100, (p._count.tasks / 20) * 100)} className="flex-1" />
                  <span className="text-[10px] text-ink-faint">{p._count.tasks} {t('tasks')}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <div className="card p-4 dark:bg-slate-900 dark:border-slate-800">
          <h3 className="mb-3 text-sm font-semibold text-ink">{t('Workload distribution')}</h3>
          {isLoading ? <Skeleton className="h-56 w-full" /> : (
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={analytics?.workload} layout="vertical" margin={{ left: 8, right: 12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={92} tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="open" name={t("Open")} stackId="a" fill="#6366f1" radius={[0, 0, 0, 0]} maxBarSize={18} />
                <Bar dataKey="done" name={t("Done")} stackId="a" fill="#a5b4fc" radius={[0, 4, 4, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card p-4 dark:bg-slate-900 dark:border-slate-800">
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink">
            <AlertTriangle size={14} className="text-rose-500" /> {t('Overdue watchlist')}
          </h3>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {(analytics?.overdueTasks ?? []).map((t) => (
              <OverdueRow key={t.id} id={t.id} title={t.title} dueDate={t.dueDate} priority={t.priority} people={t.assignees.map((a) => a.user)} />
            ))}
            {!analytics?.overdueTasks.length && (
              <div className="flex flex-col items-center gap-1 py-10 text-center">
                <CheckCircle2 size={20} className="text-emerald-400" />
                <p className="text-sm font-medium text-ink">{t('Nothing overdue')}</p>
                <p className="text-xs text-ink-faint">{t('Your team is on top of deadlines.')}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-3 card p-4 dark:bg-slate-900 dark:border-slate-800">
        <h3 className="mb-3 text-sm font-semibold text-ink">{t('Company workload — all teams')}</h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {(workload?.items ?? []).slice(0, 9).map((w) => (
            <div key={w.userId} className="flex items-center gap-2 rounded-lg border border-slate-100 dark:border-slate-800 px-2.5 py-2">
              <Avatar name={w.name} src={w.avatarUrl} size={24} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium text-ink">{w.name}</div>
                <div className="text-[10px] text-ink-faint">{w.inProgress} {t('in progress')} · {w.overdue} {t('overdue')}</div>
              </div>
              <span className="text-[11px] font-semibold text-ink-muted">{w.openTasks}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function OverdueRow({ id, title, dueDate, priority, people }: { id: string; title: string; dueDate: string; priority: string; people: Array<{ id: string; name: string }> }) {
  const openTask = useUiStore((s) => s.openTask);
  const due = dueLabel(dueDate);
  return (
    <button onClick={() => openTask(id)} className="flex w-full items-center gap-2 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50">
      <span className={cn('h-1.5 w-1.5 rounded-full', PRIORITY_META[priority as keyof typeof PRIORITY_META]?.dot ?? 'bg-slate-300')} />
      <span className="flex-1 truncate text-[13px] text-ink">{title}</span>
      <span className="text-[10px] font-semibold text-rose-600">{due.text}</span>
      {people.slice(0, 1).map((p) => <Avatar key={p.id} name={p.name} size={20} />)}
    </button>
  );
}

/* --------------------------------------------------------------- Personal */
function PersonalDashboard() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user)!;
  const { data, isLoading } = useMeAnalytics();
  const { data: recent } = useProjectTasks(undefined);
  void recent;
  const openTask = useUiStore((s) => s.openTask);

  const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <>
      <PageHeader
        title={`${t(greeting)}, ${user.name.split(' ')[0]}`}
        subtitle={user.role === 'INDIVIDUAL' ? t('Your private workspace and personal productivity.') : t('Everything on your plate today.')}
        badge={<Badge className="bg-slate-100 text-slate-700">{t(roleLabel[user.role])}</Badge>}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={<span className="text-xs font-bold text-slate-700 dark:text-slate-100">{t('Due today')}</span>} value={data?.kpis.dueToday ?? '—'} icon={<CalendarClock size={15} />} tone="amber" loading={isLoading} hint={t('scheduled for today')} />
        <StatCard label={<span className="text-xs font-bold text-slate-700 dark:text-slate-100">{t('Open tasks')}</span>} value={data?.kpis.open ?? '—'} icon={<ListChecks size={15} />} tone="brand" loading={isLoading} hint={t('assigned to you')} />
        <StatCard label={<span className="text-xs font-bold text-slate-700 dark:text-slate-100">{t('Overdue')}</span>} value={data?.kpis.overdue ?? '—'} icon={<AlertTriangle size={15} />} tone="rose" loading={isLoading} hint={t('past due date')} />
        <StatCard label={<span className="text-xs font-bold text-slate-700 dark:text-slate-100">{t('Streak')}</span>} value={`${data?.kpis.streak ?? 0}d`} icon={<Flame size={15} />} tone="emerald" loading={isLoading} hint={`${data?.kpis.completed30d ?? 0} ${t('completed in 30d')}`} />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <div className="card p-4 dark:bg-slate-900 dark:border-slate-800 lg:col-span-2">
          <h3 className="mb-3 text-sm font-semibold text-ink">{t("Today's schedule")}</h3>
          <div className="space-y-1.5">
            {(data?.todayTasks ?? []).map((t) => (
              <button
                key={t.id}
                onClick={() => openTask(t.id)}
                className="flex w-full items-center gap-2.5 rounded-lg border border-slate-100 dark:border-slate-800 px-3 py-2 text-left hover:border-slate-200 dark:hover:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50"
              >
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: t.project.color }} />
                <span className="flex-1 truncate text-sm text-ink">{t.title}</span>
                <Badge className={STATUS_META[t.status as keyof typeof STATUS_META].className}>{STATUS_META[t.status as keyof typeof STATUS_META].label}</Badge>
                <span className="text-[10px] font-semibold uppercase text-ink-faint">{t.project.key}</span>
              </button>
            ))}
            {!data?.todayTasks.length && !isLoading && (
              <EmptyState icon={<CheckCircle2 size={18} />} title={t("Nothing due today")} description={t("Enjoy the clear runway — or pull something forward from your backlog.")} />
            )}
            {isLoading && <Skeleton className="h-24 w-full" />}
          </div>

          <h3 className="mb-2 mt-5 text-sm font-semibold text-ink">{t('Upcoming this week')}</h3>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {(data?.upcoming ?? []).slice(0, 5).map((t) => {
              const due = dueLabel(t.dueDate);
              return (
                <button key={t.id} onClick={() => openTask(t.id)} className="flex w-full items-center gap-2 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <span className={cn('h-1.5 w-1.5 rounded-full', PRIORITY_META[t.priority as keyof typeof PRIORITY_META].dot)} />
                  <span className="flex-1 truncate text-[13px] text-ink">{t.title}</span>
                  <span className={cn('text-[11px] font-medium', 'text-ink-muted')}>{due.text}</span>
                </button>
              );
            })}
            {!data?.upcoming.length && <p className="py-3 text-xs text-ink-faint">{t('No deadlines in the next 7 days.')}</p>}
          </div>
        </div>

        <div className="space-y-3">
          <div className="card p-4 dark:bg-slate-900 dark:border-slate-800">
            <h3 className="mb-3 text-sm font-semibold text-ink">{t('Completion trend')}</h3>
            {isLoading ? <Skeleton className="h-40 w-full" /> : (
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={data?.completionSeries} margin={{ left: -28, right: 4, top: 4 }}>
                  <defs>
                    <linearGradient id="doneFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tickFormatter={(v: string) => v.slice(8)} tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} interval={6} />
                  <Tooltip contentStyle={tooltipStyle} labelFormatter={(v) => `${t("Day")} ${String(v).slice(5)}`} />
                  <Area type="monotone" dataKey="count" stroke="#10b981" strokeWidth={2} fill="url(#doneFill)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="card p-4 dark:bg-slate-900 dark:border-slate-800">
            <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink"><Activity size={14} className="text-brand-500" /> {t('Recent activity')}</h3>
            <div className="space-y-2">
              {(data?.recentActivity ?? []).slice(0, 6).map((a) => (
                <div key={wId(a.id)} className="flex items-start gap-2 text-[12px]">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
                  <div className="min-w-0">
                    <span className="text-ink-muted">{t(a.action.toLowerCase().replaceAll('_', ' '))}</span>
                    <span className="ml-1 text-[10px] text-ink-faint">{fromNow(a.createdAt)}</span>
                  </div>
                </div>
              ))}
              {!data?.recentActivity.length && <p className="text-xs text-ink-faint">{t('No activity yet.')}</p>}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function wId(id: string) {
  return id;
}