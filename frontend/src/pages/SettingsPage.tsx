import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Mail, Monitor, ShieldCheck, UserRound } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { PageHeader } from '@/components/layout/AppShell';
import { Avatar, Badge, Button, Input, Label } from '@/components/ui/primitives';
import { fmtDate, roleLabel } from '@/lib/utils';
import type { User } from '@/types';
import { useTranslation } from '@/lib/i18n';

export function SettingsPage() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user)!;
  const setUser = useAuthStore((s) => s.setUser);
  const qc = useQueryClient();

  const [name, setName] = useState(user.name);
  const [emailNotifications, setEmailNotifications] = useState(user.emailNotifications);
  const [profileMsg, setProfileMsg] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pwMsg, setPwMsg] = useState('');

  const { data: sessions } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => api<{ sessions: Array<{ id: string; userAgent: string | null; ip: string | null; createdAt: string; expiresAt: string }> }>('/auth/sessions'),
  });

  const saveProfile = async () => {
    const res = await api<{ user: User }>('/users/me', { method: 'PATCH', body: { name, emailNotifications } });
    setUser(res.user);
    setProfileMsg(t('Profile updated.'));
    setTimeout(() => setProfileMsg(''), 2500);
  };

  const changePassword = async () => {
    setPwMsg('');
    try {
      await api('/users/me/password', { method: 'POST', body: { currentPassword, newPassword } });
      setPwMsg(t('Password updated — other sessions were revoked.'));
      setCurrentPassword('');
      setNewPassword('');
      void qc.invalidateQueries({ queryKey: ['sessions'] });
    } catch (e) {
      setPwMsg(e instanceof Error ? e.message : t('Could not update password'));
    }
  };

  return (
    <>
      <PageHeader title={t('Profile')} subtitle={t('Profile, notifications and account security.')} />

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="card p-5">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold"><UserRound size={15} /> {t('Profile')}</h3>
          <div className="mb-4 flex items-center gap-3">
            <Avatar name={user.name} src={user.avatarUrl} size={48} />
            <div>
              <div className="text-sm font-semibold">{user.name}</div>
              <div className="text-xs text-ink-muted">{user.email}</div>
              <Badge className="mt-1 bg-brand-50 text-brand-700">{roleLabel[user.role]}</Badge>
            </div>
          </div>
          <div className="space-y-3">
            <div>
              <Label>{t('DISPLAY NAME')}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <label className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2.5">
              <span className="flex items-center gap-2 text-sm"><Mail size={14} className="text-ink-faint" /> {t('Email notifications')}</span>
              <input type="checkbox" checked={emailNotifications} onChange={(e) => setEmailNotifications(e.target.checked)} className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 text-brand-600" />
            </label>
            {profileMsg && <p className="text-xs font-medium text-emerald-600">{profileMsg}</p>}
            <Button onClick={() => void saveProfile()}>{t('Save profile')}</Button>
          </div>
        </div>

        <div className="space-y-3">
          <div className="card p-5">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold"><KeyRound size={15} /> {t('Password')}</h3>
            <div className="space-y-3">
              <div>
                <Label>{t('CURRENT PASSWORD')}</Label>
                <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" />
              </div>
              <div>
                <Label>{t('NEW PASSWORD')}</Label>
                <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={8} autoComplete="new-password" />
              </div>
              {pwMsg && <p className="text-xs font-medium text-ink-muted">{pwMsg}</p>}
              <Button
                variant="outline"
                className="rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-medium px-4 py-2 hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors border-0"
                onClick={() => void changePassword()}
                disabled={!currentPassword || newPassword.length < 8}
              >
                {t('Update password')}
              </Button>
            </div>
          </div>

          <div className="card p-5">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Monitor size={15} /> {t('Active sessions')}</h3>
            <div className="space-y-1.5">
              {(sessions?.sessions ?? []).map((s) => (
                <div key={s.id} className="flex items-center justify-between rounded-lg border border-slate-100 dark:border-slate-800 px-2.5 py-2 text-[11px]">
                  <span className="truncate text-ink-muted">{s.userAgent?.slice(0, 60) ?? t('Unknown device')}</span>
                  <span className="ml-2 shrink-0 text-ink-faint">{fmtDate(s.createdAt, 'MMM d, HH:mm')}</span>
                </div>
              ))}
              {!sessions?.sessions.length && <p className="text-xs text-ink-faint">{t('No other active sessions.')}</p>}
            </div>
          </div>

          <div className="card flex items-start gap-3 p-4">
            <ShieldCheck size={18} className="mt-0.5 text-emerald-500" />
            <p className="text-[11px] leading-relaxed text-ink-muted">
              {t('Access tokens are short-lived (15 min) and held in memory only. Refresh tokens are http-only, rotated on every use, and hashed at rest. Changing your password revokes every other session.')}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}