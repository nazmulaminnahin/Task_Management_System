import { useState, useEffect, useRef } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ArrowRight, CheckCircle2, KanbanSquare, ShieldCheck, Sparkles, Users, Zap, Sun, Moon, Globe } from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { useSettingsStore, applyTheme, LanguageCode, t } from '@/store/settings.store';
import { Button, Input, Label, SegmentedControl } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import type { User } from '@/types';
import { cn } from '@/lib/utils';

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

export function LoginPage() {
  const { login, status } = useAuthStore();
  const { theme, setTheme, language, setLanguage } = useSettingsStore();
  const navigate = useNavigate();

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [accountType, setAccountType] = useState<'EMPLOYEE' | 'INDIVIDUAL'>('EMPLOYEE');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const [langMenuOpen, setLangMenuOpen] = useState(false);

  const themeRef = useRef<HTMLDivElement>(null);
  const langRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    const handleUpdate = () => {
      setBusy((prev) => prev);
    };
    window.addEventListener('languagechange', handleUpdate);
    return () => window.removeEventListener('languagechange', handleUpdate);
  }, []);

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

  if (status === 'authenticated') return <Navigate to="/" replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'signup') {
        await api<{ user: User }>('/auth/register', {
          method: 'POST',
          body: { email, password, name, role: accountType },
        });
      }
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative grid min-h-screen lg:grid-cols-[1.05fr_1fr] dark:bg-slate-950 dark:text-white">
      {/* Absolute Header Controls on Login Page */}
      <div className="absolute top-5 right-6 z-30 flex items-center gap-2">
        {/* Theme Selector */}
        <div className="relative" ref={themeRef}>
          <button
            type="button"
            onClick={() => {
              setThemeMenuOpen(!themeMenuOpen);
              setLangMenuOpen(false);
            }}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white/80 dark:bg-slate-800 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all shadow-sm"
            title="Select Theme"
          >
            {theme === 'dark' ? <Moon size={16} /> : <Sun size={16} />}
          </button>
          {themeMenuOpen && (
            <div className="absolute right-0 mt-2 w-36 rounded-xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-800 p-1.5 shadow-xl z-50 text-xs text-slate-800 dark:text-slate-200">
              <button type="button" onClick={() => { setTheme('light'); setThemeMenuOpen(false); }} className={cn('w-full rounded-lg px-3 py-2 text-left font-medium hover:bg-slate-100 dark:hover:bg-slate-800', theme === 'light' && 'bg-brand-50 dark:bg-brand-950/50 text-brand-600')}>Light</button>
              <button type="button" onClick={() => { setTheme('dark'); setThemeMenuOpen(false); }} className={cn('w-full rounded-lg px-3 py-2 text-left font-medium hover:bg-slate-100 dark:hover:bg-slate-800', theme === 'dark' && 'bg-brand-50 dark:bg-brand-950/50 text-brand-600')}>Dark</button>
              <button type="button" onClick={() => { setTheme('system'); setThemeMenuOpen(false); }} className={cn('w-full rounded-lg px-3 py-2 text-left font-medium hover:bg-slate-100 dark:hover:bg-slate-800', theme === 'system' && 'bg-brand-50 dark:bg-brand-950/50 text-brand-600')}>System</button>
            </div>
          )}
        </div>

        {/* Language Selector */}
        <div className="relative" ref={langRef}>
          <button
            type="button"
            onClick={() => {
              setLangMenuOpen(!langMenuOpen);
              setThemeMenuOpen(false);
            }}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white/80 dark:bg-slate-800 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all shadow-sm"
            title="Select Language"
          >
            <Globe size={16} />
          </button>
          {langMenuOpen && (
            <div className="absolute right-0 mt-2 w-48 rounded-xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-800 p-1.5 shadow-xl z-50 max-h-64 overflow-y-auto text-xs text-slate-800 dark:text-slate-200">
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
      </div>

      {/* Brand pane */}
      <div className="relative hidden overflow-hidden bg-slate-900 p-10 text-white lg:flex lg:flex-col lg:justify-center">
        <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-brand-600/30 blur-3xl" />
        <div className="absolute -bottom-32 right-0 h-80 w-80 rounded-full bg-sky-500/20 blur-3xl" />
        
        <div className="absolute top-10 left-10 flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500 shadow-lg shadow-brand-500/30">
            <Sparkles size={18} />
          </div>
          <div>
            <div className="text-base font-bold tracking-tight">TaskForge</div>
            <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-slate-400">Task Management System</div>
          </div>
        </div>

        <div className="relative max-w-md my-auto">
          <h1 className="text-2xl font-semibold leading-tight tracking-tight uppercase">
            PLAN, EXECUTE AND SHIP — WITH YOUR WHOLE TEAM IN REAL TIME.
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-300">
            Kanban, list and calendar views over one source of truth. Socket.io keeps every board, comment and
            notification in sync the moment it happens.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {[
              { icon: <KanbanSquare size={15} />, title: 'Drag & drop boards', body: 'Fractional ranking, WIP limits' },
              { icon: <Zap size={15} />, title: 'Live collaboration', body: 'Socket.io task & comment sync' },
              { icon: <ShieldCheck size={15} />, title: 'RBAC + audit trail', body: '4 roles, immutable activity log' },
              { icon: <Users size={15} />, title: 'Team insights', body: 'Velocity, workload, overdue alerts' },
            ].map((f) => (
              <div key={f.title} className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
                <div className="mb-1 flex items-center gap-1.5 text-brand-300">{f.icon}<span className="text-xs font-semibold text-white">{f.title}</span></div>
                <p className="text-[11px] text-slate-400">{f.body}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="absolute bottom-10 left-10 flex items-center gap-2 text-[11px] text-slate-400">
          <CheckCircle2 size={13} className="text-emerald-400" />
          Express · Prisma · PostgreSQL · React · TypeScript
        </div>
      </div>

      {/* Form pane */}
      <div className="flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-5 py-10">
        <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 p-8 sm:p-12 shadow-2xl border border-slate-100 dark:border-slate-800 flex flex-col items-center">
          <div className="mb-6 flex items-center gap-2 lg:hidden w-full">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white"><Sparkles size={15} /></div>
            <span className="text-base font-bold dark:text-white">TaskForge</span>
          </div>

          <div className="w-full flex justify-center mb-6">
            <div className="inline-block">
              <SegmentedControl
                options={[
                  { value: 'signin', label: t('Sign in', language) },
                  { value: 'signup', label: t('Create account', language) },
                ]}
                value={mode}
                onChange={setMode}
              />
            </div>
          </div>

          <div className="w-full">
            <h2 className="text-xl font-semibold tracking-tight text-ink dark:text-white">
              {t('Welcome back', language)}
            </h2>
            <p className="mt-1 text-sm text-ink-muted dark:text-slate-400">
              {t('Sign in to your workspace to continue.', language)}
            </p>

            <form onSubmit={(e) => void submit(e)} className="mt-5 space-y-4">
              {mode === 'signup' && (
                <div>
                  <Label htmlFor="name">Full name</Label>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Cooper" required minLength={2} />
                </div>
              )}
              <div>
                <Label htmlFor="email">{t('WORK EMAIL', language)}</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@taskforge.com" required autoComplete="email" />
              </div>
              <div>
                <Label htmlFor="password">{t('PASSWORD', language)}</Label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={8} autoComplete="current-password" />
              </div>
              {mode === 'signup' && (
                <div>
                  <Label>Account type</Label>
                  <SegmentedControl
                    size="sm"
                    options={[
                      { value: 'EMPLOYEE', label: 'Employee' },
                      { value: 'INDIVIDUAL', label: 'Individual' },
                    ]}
                    value={accountType}
                    onChange={setAccountType}
                  />
                  <p className="mt-1.5 text-[11px] text-ink-faint">Admins can promote accounts to Manager or Admin later.</p>
                </div>
              )}

              {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">{error}</p>}

              <Button type="submit" className="w-full" loading={busy}>
                {t(mode === 'signin' ? 'Sign in' : 'Create account', language)} <ArrowRight size={14} />
              </Button>
            </form>
          </div>
        </div>
      </div>

      <div className="absolute bottom-4 right-6 px-3.5 py-1.5 rounded-lg bg-white/80 dark:bg-slate-900/80 backdrop-blur-md shadow-sm border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 z-10 hidden lg:block">
        Developed by <span className="text-indigo-600 dark:text-indigo-400 font-bold">Nazmul Amin</span>
      </div>
    </div>
  );
}