import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, ShieldAlert, UserCog, UserRound } from 'lucide-react';
import { api } from '@/lib/api';
import type { Paged, Role, User } from '@/types';
import { PageHeader } from '@/components/layout/AppShell';
import { Avatar, Badge, Button, Input, Label, Select, Skeleton } from '@/components/ui/primitives';
import { ROLE_META, cn, fmtDate, roleLabel } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';
import { useTranslation } from '@/lib/i18n';

const ROLES: Role[] = ['ADMIN', 'MANAGER', 'EMPLOYEE', 'INDIVIDUAL'];

export function AdminUsersPage() {
  const { t } = useTranslation();
  const me = useAuthStore((s) => s.user)!;
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [roleFilter, setRoleFilter] = useState<'' | Role>('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [error, setError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users', q, roleFilter],
    queryFn: () => api<Paged<User>>(`/users?pageSize=100${q ? `&q=${encodeURIComponent(q)}` : ''}${roleFilter ? `&role=${roleFilter}` : ''}`),
  });

  const counts = useMemo(() => {
    const items = data?.items ?? [];
    return ROLES.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r]: items.filter((u) => u.role === r).length }), {});
  }, [data]);

  const changeRole = async (user: User, role: Role) => {
    setError('');
    try {
      await api(`/users/${user.id}/role`, { method: 'PATCH', body: { role } });
      void qc.invalidateQueries({ queryKey: ['admin-users'] });
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Could not change role'));
    }
  };

  const toggleActive = async (user: User) => {
    await api(`/users/${user.id}`, { method: 'PATCH', body: { isActive: !user.isActive } });
    void qc.invalidateQueries({ queryKey: ['admin-users'] });
  };

  return (
    <>
      <PageHeader
        title={t('Users & roles')}
        subtitle={t('Manage accounts, elevate privileges and deactivate access.')}
        badge={<Badge className="bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300"><ShieldAlert size={10} /> {t('Admin only')}</Badge>}
        actions={<Button onClick={() => setCreateOpen(true)}><Plus size={14} /> {t('New user')}</Button>}
      />

      <div className="mb-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
        {ROLES.map((r) => (
          <button
            key={r}
            onClick={() => setRoleFilter((f) => (f === r ? '' : r))}
            className={cn('card dark:bg-slate-900 dark:border-slate-800 flex items-center justify-between px-3 py-2.5 text-left transition-colors', roleFilter === r && 'ring-2 ring-brand-200 dark:ring-brand-800')}
          >
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">{roleLabel[r]}</div>
              <div className="text-lg font-semibold text-ink dark:text-white">{counts[r] ?? 0}</div>
            </div>
            <Badge className={ROLE_META[r].className}>{r.slice(0, 3)}</Badge>
          </button>
        ))}
      </div>

      <div className="mb-3 flex items-center gap-2">
        <div className="relative max-w-xs flex-1">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('Search name or email…')}
            className="h-9 pl-7 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border-slate-300 dark:border-slate-700"
          />
        </div>
        {roleFilter && (
          <Button variant="ghost" size="sm" onClick={() => setRoleFilter('')}>
            {t('Clear filter')}
          </Button>
        )}
        {error && <span className="text-xs font-medium text-rose-600 dark:text-rose-400">{error}</span>}
      </div>

      {isLoading ? (
        <Skeleton className="h-72 w-full" />
      ) : (
        <div className="card dark:bg-slate-900 dark:border-slate-800 overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                <th className="px-4 py-2.5">{t('User')}</th>
                <th className="px-3 py-2.5">{t('Role')}</th>
                <th className="px-3 py-2.5">{t('Status')}</th>
                <th className="px-3 py-2.5">{t('Joined')}</th>
                <th className="px-3 py-2.5 text-right">{t('Actions')}</th>
              </tr>
            </thead>
            <tbody>
              {(data?.items ?? []).map((u) => (
                <tr key={u.id} className="border-b border-slate-50 dark:border-slate-800/60 last:border-0 hover:bg-slate-50/60 dark:hover:bg-slate-800/30">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={u.name} src={u.avatarUrl} size={30} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 truncate text-[13px] font-medium text-slate-900 dark:text-white">
                          {u.name}
                          {u.id === me.id && <span className="rounded bg-brand-50 dark:bg-brand-950/70 px-1 text-[9px] font-bold text-brand-600 dark:text-brand-300">{t('YOU')}</span>}
                        </div>
                        <div className="truncate text-[11px] text-slate-500 dark:text-slate-400">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <Select
                      value={u.role}
                      onChange={(e) => void changeRole(u, e.target.value as Role)}
                      disabled={u.id === me.id}
                      className="h-7 w-40 text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border-slate-300 dark:border-slate-700"
                    >
                      {ROLES.map((r) => <option key={r} value={r} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">{roleLabel[r]}</option>)}
                    </Select>
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge className={u.isActive ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'} dot={u.isActive ? 'bg-emerald-500' : 'bg-slate-400'}>
                      {u.isActive ? t('Active') : t('Disabled')}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5 text-[11px] text-ink-muted">{fmtDate(u.createdAt, 'MMM d, yyyy')}</td>
                  <td className="px-3 py-2.5 text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setEditing(u)}><UserCog size={12} /> {t('Edit')}</Button>
                      <Button variant="ghost" size="sm" onClick={() => void toggleActive(u)} disabled={u.id === me.id}>
                        {u.isActive ? t('Disable') : t('Enable')}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CreateUserModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <EditUserModal key={editing?.id ?? 'none'} user={editing} onClose={() => setEditing(null)} />
    </>
  );
}

function CreateUserModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'EMPLOYEE' as Role });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const submit = async () => {
    setError('');
    setBusy(true);
    try {
      await api('/users', { method: 'POST', body: form });
      void qc.invalidateQueries({ queryKey: ['admin-users'] });
      setForm({ name: '', email: '', password: '', role: 'EMPLOYEE' });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Could not create user'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden text-slate-900 dark:text-slate-100">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">{t('Create user')}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{t('Admins can create any role, including other admins.')}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="px-6 py-4 max-h-[75vh] overflow-y-auto space-y-3.5 text-slate-900 dark:text-slate-100">
          <div>
            <Label className="text-slate-700 dark:text-slate-300">{t('Full name')}</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border-slate-300 dark:border-slate-700" />
          </div>
          <div>
            <Label className="text-slate-700 dark:text-slate-300">{t('Email')}</Label>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border-slate-300 dark:border-slate-700" />
          </div>
          <div>
            <Label className="text-slate-700 dark:text-slate-300">{t('Temporary password')}</Label>
            <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} minLength={8} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border-slate-300 dark:border-slate-700" />
          </div>
          <div>
            <Label className="text-slate-700 dark:text-slate-300">{t('Role')}</Label>
            {/* Custom Theme-Adaptive Role Selector */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 p-1 border border-slate-200 dark:border-slate-700">
              {ROLES.map((r) => {
                const active = form.role === r;
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setForm({ ...form, role: r })}
                    className={cn(
                      'rounded-lg px-2 py-1.5 text-xs font-medium transition-all truncate',
                      active
                        ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm font-semibold'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    )}
                  >
                    {roleLabel[r]}
                  </button>
                );
              })}
            </div>
          </div>
          {error && <p className="rounded-lg bg-rose-50 dark:bg-rose-950/60 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">{error}</p>}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <Button variant="outline" onClick={onClose} className="border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800">
            {t('Cancel')}
          </Button>
          <Button onClick={() => void submit()} loading={busy}>
            {t('Create')}
          </Button>
        </div>
      </div>
    </div>
  );
}

function EditUserModal({ user, onClose }: { user: User | null; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [name, setName] = useState(user?.name ?? '');
  const [error, setError] = useState('');

  if (!user) return null;

  const submit = async () => {
    setError('');
    try {
      await api(`/users/${user.id}`, { method: 'PATCH', body: { name } });
      void qc.invalidateQueries({ queryKey: ['admin-users'] });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Update failed'));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden text-slate-900 dark:text-slate-100">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">{t('Edit')} {user.name}</h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="px-6 py-4 max-h-[75vh] overflow-y-auto space-y-3.5 text-slate-900 dark:text-slate-100">
          <div className="flex items-center gap-2 rounded-lg bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs text-ink-muted">
            <UserRound size={14} /> {user.email} · {roleLabel[user.role]} · {t('joined')} {fmtDate(user.createdAt, 'MMM d, yyyy')}
          </div>
          <div>
            <Label className="text-slate-700 dark:text-slate-300">{t('Display name')}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border-slate-300 dark:border-slate-700" />
          </div>
          {error && <p className="rounded-lg bg-rose-50 dark:bg-rose-950/60 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">{error}</p>}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <Button variant="outline" onClick={onClose} className="border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800">
            {t('Cancel')}
          </Button>
          <Button onClick={() => void submit()}>
            {t('Save')}
          </Button>
        </div>
      </div>
    </div>
  );
}