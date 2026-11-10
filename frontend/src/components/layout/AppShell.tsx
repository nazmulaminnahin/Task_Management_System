import { useEffect, useMemo, useState, useRef } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Bell,
  CalendarDays,
  CheckSquare,
  ChevronsLeft,
  ChevronsRight,
  FolderKanban,
  Globe,
  LayoutDashboard,
  LogOut,
  Moon,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Sun,
  Users,
  X,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { useUiStore } from '@/store/ui.store';
import { useSettingsStore, applyTheme, LanguageCode, t } from '@/store/settings.store';
import { useNotifications, useMarkNotificationsRead } from '@/hooks/useNotifications';
import { useProjects } from '@/hooks/useProjects';
import { Avatar, Skeleton } from '@/components/ui/primitives';
import { NotificationPanel } from '@/components/layout/NotificationPanel';
import { GlobalSearch } from '@/components/layout/GlobalSearch';
import { NewProjectModal } from '@/components/layout/NewProjectModal';
import { cn, roleLabel } from '@/lib/utils';
import { useSocketEvent, useSocketStatus } from '@/hooks/useSocket';

const LANGUAGES: Array<{ code: LanguageCode; label: string }> = [
  { code: 'default', label: 'Default' },
  { code: 'en', label: 'English (US)' },
  { code: 'bn', label: 'Bengali (বাংলা)' },
  { code: 'hi', label: 'Hindi (हिन्दी)' },
  { code: 'ru', label: 'Russian (Русский)' },
  { code: 'zh', label: 'Chinese (中文)' },
  { code: 'ar', label: 'Arabic (العربية)' },
  { code: 'fr', label: 'French (Français)' },
  { code: 'it', label: 'Italian (Italiano)' },
  { code: 'de', label: 'German (Deutsch)' },
  { code: 'es', label: 'Spanish (Español)' },
];

export function AppShell() {
  const { user, logout } = useAuthStore();
  const { sidebarCollapsed, toggleSidebar, notificationsOpen, setNotificationsOpen } = useUiStore();
  const { theme, setTheme, language, setLanguage } = useSettingsStore();

  const [searchOpen, setSearchOpen] = useState(false);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const [langMenuOpen, setLangMenuOpen] = useState(false);

  const themeRef = useRef<HTMLDivElement>(null);
  const langRef = useRef<HTMLDivElement>(null);

  const navigate = useNavigate();
  const location = useLocation();

  const { data: projects } = useProjects(user?.role === 'ADMIN' ? 'all' : 'mine');
  const { data: notifications } = useNotifications();
  const markRead = useMarkNotificationsRead();
  const { connected } = useSocketStatus();

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Handle RTL direction for Arabic language
  useEffect(() => {
    if (language === 'ar') {
      document.documentElement.dir = 'rtl';
    } else {
      document.documentElement.dir = 'ltr';
    }
  }, [language]);

  useEffect(() => {
    const handleUpdate = () => {
      setThemeMenuOpen(false);
    };
    window.addEventListener('languagechange', handleUpdate);
    return () => window.removeEventListener('languagechange', handleUpdate);
  }, []);

  // Close dropdown menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (themeRef.current && !themeRef.current.contains(event.target as Node)) {
        setThemeMenuOpen(false);
      }
      if (langRef.current && !langRef.current.contains(event.target as Node)) {
        setLangMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useSocketEvent('notification:new', () => {});

  // ⌘K / Ctrl+K global search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => setMobileNav(false), [location.pathname]);

  const unread = notifications?.unreadCount ?? 0;
  const visibleProjects = useMemo(() => (projects?.items ?? []).slice(0, 6), [projects]);

  if (!user) return null;

  const NAV = [
    { to: '/', label: t('Dashboard', language), icon: LayoutDashboard, end: true },
    { to: '/my-work', label: t('My work', language), icon: CheckSquare },
    { to: '/projects', label: t('Projects', language), icon: FolderKanban },
    { to: '/calendar', label: t('Calendar', language), icon: CalendarDays },
  ];

  const ADMIN_NAV = [
    { to: '/admin/users', label: t('Users & roles', language), icon: Users, roles: ['ADMIN'] },
    { to: '/admin/audit', label: t('Audit log', language), icon: ShieldCheck, roles: ['ADMIN'] },
    { to: '/admin/analytics', label: t('Platform analytics', language), icon: BarChart3, roles: ['ADMIN'] },
  ];

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* ---------------------------------------------------------- Sidebar */}
      <aside
        className={cn(
          'sticky top-0 z-30 hidden h-screen shrink-0 flex-col border-r border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-800 transition-[width] duration-200 md:flex',
          sidebarCollapsed ? 'w-[68px]' : 'w-60',
        )}
      >
        <div className={cn('flex h-14 items-center gap-2.5 border-b border-slate-100 dark:border-slate-800 px-4', sidebarCollapsed && 'justify-center px-0')}>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white shadow-sm">
            <Sparkles size={16} />
          </div>
          {!sidebarCollapsed && (
            <div className="leading-tight">
              <div className="text-sm font-bold tracking-tight dark:text-white">TaskForge</div>
              <div className="text-[10px] font-medium uppercase tracking-widest text-ink-faint">Task Management</div>
            </div>
          )}
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2.5 py-3 scrollbar-thin">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              title={label}
              className={({ isActive }) =>
                cn(
                  'group flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium transition-colors',
                  isActive ? 'bg-brand-50 dark:bg-brand-950/50 text-brand-700 dark:text-brand-400' : 'text-ink-muted hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-ink dark:hover:text-white',
                  sidebarCollapsed && 'justify-center px-0',
                )
              }
            >
              <Icon size={17} className="shrink-0" />
              {!sidebarCollapsed && label}
            </NavLink>
          ))}

          {user.role === 'ADMIN' && (
            <>
              {!sidebarCollapsed && <div className="px-2.5 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-widest text-ink-faint">{t('Administration', language)}</div>}
              {ADMIN_NAV.filter((n) => n.roles.includes(user.role)).map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  title={label}
                  className={({ isActive }) =>
                    cn(
                      'flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium transition-colors',
                      isActive ? 'bg-brand-50 dark:bg-brand-950/50 text-brand-700 dark:text-brand-400' : 'text-ink-muted hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-ink dark:hover:text-white',
                      sidebarCollapsed && 'justify-center px-0',
                    )
                  }
                >
                  <Icon size={17} className="shrink-0" />
                  {!sidebarCollapsed && label}
                </NavLink>
              ))}
            </>
          )}

          {!sidebarCollapsed && (
            <div className="pt-4">
              <div className="flex items-center justify-between px-2.5 pb-1">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-ink-faint">
                  {user.role === 'INDIVIDUAL' ? 'Workspace' : t('Projects', language)}
                </span>
                {user.role !== 'INDIVIDUAL' && user.role !== 'EMPLOYEE' && (
                  <button onClick={() => setNewProjectOpen(true)} className="rounded p-0.5 text-ink-faint hover:bg-slate-100 hover:text-ink" aria-label="New project">
                    <Plus size={13} />
                  </button>
                )}
              </div>
              <div className="space-y-0.5">
                {visibleProjects.map((p) => (
                  <Link
                    key={p.id}
                    to={`/projects/${p.id}`}
                    className="flex h-8 items-center gap-2 rounded-lg px-2.5 text-[13px] text-ink-muted dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-ink dark:hover:text-white"
                  >
                    <span className="h-2 w-2 shrink-0 rounded-[3px]" style={{ backgroundColor: p.color }} />
                    <span className="truncate">{p.name}</span>
                  </Link>
                ))}
                {projects?.items.length === 0 && <p className="px-2.5 text-xs text-ink-faint">No projects yet</p>}
              </div>
            </div>
          )}
        </nav>

        {/* Sidebar Footer: Collapse button first, Developer Credit card at the bottom */}
        <div className="border-t border-slate-100 dark:border-slate-800 p-2.5 space-y-2">
          <button
            onClick={toggleSidebar}
            className={cn('flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-xs font-medium text-ink-faint hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-ink', sidebarCollapsed && 'justify-center px-0')}
          >
            {sidebarCollapsed ? <ChevronsRight size={15} /> : <ChevronsLeft size={15} />}
            {!sidebarCollapsed && t('Collapse', language)}
          </button>

          {!sidebarCollapsed && (
            <div className="mx-1 px-3 py-2 rounded-lg bg-white/80 dark:bg-slate-900/80 backdrop-blur-md shadow-sm border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 text-center">
              Developed by <span className="text-indigo-600 dark:text-indigo-400 font-bold">Nazmul Amin</span>
            </div>
          )}
        </div>
      </aside>

      {/* ------------------------------------------------------------- Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 px-4 backdrop-blur md:px-6">
          <button className="rounded-lg p-2 text-ink-muted hover:bg-slate-100 dark:hover:bg-slate-800 md:hidden" onClick={() => setMobileNav(true)} aria-label="Menu">
            <LayoutDashboard size={18} />
          </button>

          {/* Wider Search Trigger Button matching user's requirement */}
          <div className="relative group">
            <button
              onClick={() => setSearchOpen(true)}
              className="flex h-9 w-full w-96 max-w-xl items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800 px-3 text-sm text-ink-faint dark:text-slate-300 hover:border-slate-300 hover:bg-white dark:hover:bg-slate-700"
            >
              <Search size={15} />
              <span className="flex-1 text-left">{t('Search tasks, projects…', language)}</span>
              <kbd className="hidden rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-1.5 py-0.5 text-[10px] font-semibold text-ink-muted dark:text-slate-300 sm:block">⌘K</kbd>
            </button>
            <span className="pointer-events-none absolute -bottom-8 left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[10px] font-medium text-white opacity-0 shadow-lg transition-all group-hover:opacity-100">
              Open Command Search (Ctrl + K)
            </span>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <span
              className={cn('mr-1 hidden items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-medium sm:flex', connected ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700')}
              title={connected ? 'Real-time connected' : 'Reconnecting…'}
            >
              <span className={cn('h-1.5 w-1.5 rounded-full', connected ? 'animate-pulse-dot bg-emerald-500' : 'bg-amber-500')} />
              {connected ? 'Live' : 'Offline'}
            </span>

            {/* --- ROUND THEME SELECTOR BUTTON --- */}
            <div className="relative" ref={themeRef}>
              <button
                type="button"
                onClick={() => {
                  setThemeMenuOpen(!themeMenuOpen);
                  setLangMenuOpen(false);
                }}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 dark:border-slate-700 bg-slate-100/80 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all shadow-sm"
                title="Select Theme"
              >
                {theme === 'dark' ? <Moon size={16} /> : <Sun size={16} />}
              </button>
              {themeMenuOpen && (
                <div className="absolute right-0 mt-2 w-36 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1.5 shadow-xl z-50 text-xs text-slate-800 dark:text-slate-200">
                  <button type="button" onClick={() => { setTheme('light'); setThemeMenuOpen(false); }} className={cn('w-full rounded-lg px-3 py-2 text-left font-medium hover:bg-slate-100 dark:hover:bg-slate-800', theme === 'light' && 'bg-brand-50 dark:bg-brand-950/50 text-brand-600')}>Light</button>
                  <button type="button" onClick={() => { setTheme('dark'); setThemeMenuOpen(false); }} className={cn('w-full rounded-lg px-3 py-2 text-left font-medium hover:bg-slate-100 dark:hover:bg-slate-800', theme === 'dark' && 'bg-brand-50 dark:bg-brand-950/50 text-brand-600')}>Dark</button>
                  <button type="button" onClick={() => { setTheme('system'); setThemeMenuOpen(false); }} className={cn('w-full rounded-lg px-3 py-2 text-left font-medium hover:bg-slate-100 dark:hover:bg-slate-800', theme === 'system' && 'bg-brand-50 dark:bg-brand-950/50 text-brand-600')}>System</button>
                </div>
              )}
            </div>

            {/* --- ROUND LANGUAGE SELECTOR BUTTON --- */}
            <div className="relative" ref={langRef}>
              <button
                type="button"
                onClick={() => {
                  setLangMenuOpen(!langMenuOpen);
                  setThemeMenuOpen(false);
                }}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 dark:border-slate-700 bg-slate-100/80 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all shadow-sm"
                title="Select Language"
              >
                <Globe size={16} />
              </button>
              {langMenuOpen && (
                <div className="absolute right-0 mt-2 w-48 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1.5 shadow-xl z-50 max-h-64 overflow-y-auto text-xs text-slate-800 dark:text-slate-200">
                  {LANGUAGES.map((l) => (
                    <button
                      key={l.code}
                      type="button"
                      onClick={() => { setLanguage(l.code); setLangMenuOpen(false); }}
                      className={cn('w-full rounded-lg px-3 py-2 text-left font-medium hover:bg-slate-100 dark:hover:bg-slate-800', language === l.code && 'bg-brand-50 dark:bg-brand-950/50 text-brand-600')}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="relative">
              <button
                onClick={() => setNotificationsOpen(!notificationsOpen)}
                className="relative rounded-lg p-2 text-ink-muted dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-ink"
                aria-label="Notifications"
              >
                <Bell size={18} />
                {unread > 0 && (
                  <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </button>
              {notificationsOpen && (
                <NotificationPanel
                  notifications={notifications?.items ?? []}
                  onClose={() => setNotificationsOpen(false)}
                  onMarkAll={() => markRead.mutate({ all: true })}
                  onMarkOne={(id) => markRead.mutate({ ids: [id] })}
                />
              )}
            </div>

            <div className="mx-1 h-6 w-px bg-slate-200 dark:bg-slate-800" />

            <Link to="/settings" className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 hover:bg-slate-100 dark:hover:bg-slate-800">
              <Avatar name={user.name} src={user.avatarUrl} size={28} />
              <span className="hidden text-left leading-tight sm:block">
                <span className="block text-[13px] font-semibold text-ink dark:text-white">{user.name}</span>
                <span className="block text-[10px] font-medium uppercase tracking-wider text-ink-faint">{roleLabel[user.role]}</span>
              </span>
            </Link>

            <button
              onClick={() => void logout().then(() => navigate('/login'))}
              className="rounded-lg p-2 text-ink-faint hover:bg-rose-50 hover:text-rose-600"
              title="Sign out"
            >
              <LogOut size={17} />
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-5 md:px-6">
          <Outlet />
        </main>
      </div>

      {/* Mobile drawer */}
      {mobileNav && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 md:hidden" onClick={() => setMobileNav(false)}>
          <div className="h-full w-72 animate-slide-in bg-white dark:bg-slate-900 p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm font-bold dark:text-white">TaskForge</span>
              <button onClick={() => setMobileNav(false)} className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-800">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-1">
              {NAV.map(({ to, label, icon: Icon }) => (
                <NavLink key={to} to={to} className="flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium text-ink-muted hover:bg-slate-50 dark:hover:bg-slate-800">
                  <Icon size={17} /> {label}
                </NavLink>
              ))}
              {user.role === 'ADMIN' &&
                ADMIN_NAV.map(({ to, label, icon: Icon }) => (
                  <NavLink key={to} to={to} className="flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium text-ink-muted hover:bg-slate-50 dark:hover:bg-slate-800">
                    <Icon size={17} /> {label}
                  </NavLink>
                ))}
              <NavLink to="/settings" className="flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium text-ink-muted hover:bg-slate-50 dark:hover:bg-slate-800">
                <Settings size={17} /> Settings
              </NavLink>
            </div>
          </div>
        </div>
      )}

      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} projects={projects?.items ?? []} />
      <NewProjectModal open={newProjectOpen} onClose={() => setNewProjectOpen(false)} />
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
  badge,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  badge?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight text-ink dark:text-white">{title}</h1>
          {badge}
        </div>
        {subtitle && <p className="mt-0.5 text-sm text-ink-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'brand',
  loading,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon: React.ReactNode;
  tone?: 'brand' | 'emerald' | 'amber' | 'rose' | 'slate';
  loading?: boolean;
}) {
  const tones = {
    brand: 'bg-brand-50 text-brand-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    rose: 'bg-rose-50 text-rose-600',
    slate: 'bg-slate-100 text-slate-600',
  };
  return (
    <div className="card p-4 dark:bg-slate-900 dark:border-slate-800">
      <div className="flex items-start justify-between">
        <span className="text-xs font-medium text-ink-muted">{label}</span>
        <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg', tones[tone])}>{icon}</span>
      </div>
      {loading ? <Skeleton className="mt-2 h-7 w-16" /> : <div className="mt-1.5 text-2xl font-semibold tracking-tight text-ink dark:text-white">{value}</div>}
      {hint && <div className="mt-0.5 text-xs text-ink-faint">{hint}</div>}
    </div>
  );
}