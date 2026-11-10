import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, formatDistanceToNow, isToday, isTomorrow, isPast, differenceInCalendarDays } from 'date-fns';
import type { Priority, TaskStatus } from '@/types';

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

export const initials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase())
    .join('');

/** Deterministic avatar tint so a user keeps the same colour everywhere. */
const AVATAR_TINTS = [
  'bg-brand-100 text-brand-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
  'bg-sky-100 text-sky-700',
  'bg-violet-100 text-violet-700',
  'bg-teal-100 text-teal-700',
  'bg-orange-100 text-orange-700',
];
export const avatarTint = (seed: string) => {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) % 997;
  return AVATAR_TINTS[hash % AVATAR_TINTS.length]!;
};

export const PRIORITY_META: Record<Priority, { label: string; className: string; dot: string; weight: number }> = {
  LOW: { label: 'Low', className: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400', weight: 1 },
  MEDIUM: { label: 'Medium', className: 'bg-sky-50 text-sky-700', dot: 'bg-sky-500', weight: 2 },
  HIGH: { label: 'High', className: 'bg-amber-50 text-amber-700', dot: 'bg-amber-500', weight: 3 },
  URGENT: { label: 'Urgent', className: 'bg-rose-50 text-rose-700', dot: 'bg-rose-500', weight: 4 },
};

export const STATUS_META: Record<TaskStatus, { label: string; className: string; dot: string }> = {
  BACKLOG: { label: 'Backlog', className: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' },
  TODO: { label: 'To do', className: 'bg-slate-100 text-slate-700', dot: 'bg-slate-500' },
  IN_PROGRESS: { label: 'In progress', className: 'bg-brand-50 text-brand-700', dot: 'bg-brand-500' },
  IN_REVIEW: { label: 'In review', className: 'bg-amber-50 text-amber-700', dot: 'bg-amber-500' },
  DONE: { label: 'Done', className: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' },
  CANCELLED: { label: 'Cancelled', className: 'bg-slate-100 text-slate-500', dot: 'bg-slate-300' },
};

export function dueLabel(date?: string | null): { text: string; tone: 'normal' | 'today' | 'overdue' } {
  if (!date) return { text: '', tone: 'normal' };
  const d = new Date(date);
  if (isToday(d)) return { text: 'Today', tone: 'today' };
  if (isTomorrow(d)) return { text: 'Tomorrow', tone: 'normal' };
  if (isPast(d)) {
    const days = Math.abs(differenceInCalendarDays(d, new Date()));
    return { text: days === 0 ? 'Today' : `${days}d overdue`, tone: 'overdue' };
  }
  const days = differenceInCalendarDays(d, new Date());
  if (days < 7) return { text: format(d, 'EEE'), tone: 'normal' };
  return { text: format(d, 'MMM d'), tone: 'normal' };
}

export const fromNow = (date: string) => formatDistanceToNow(new Date(date), { addSuffix: true });
export const fmtDate = (date?: string | null, pattern = 'MMM d, yyyy') => (date ? format(new Date(date), pattern) : '—');

export const roleLabel: Record<string, string> = {
  ADMIN: 'System Admin',
  MANAGER: 'Team Manager',
  EMPLOYEE: 'Employee',
  INDIVIDUAL: 'Individual',
};

export const ROLE_META: Record<string, { className: string }> = {
  ADMIN: { className: 'bg-rose-50 text-rose-700 border-rose-100' },
  MANAGER: { className: 'bg-brand-50 text-brand-700 border-brand-100' },
  EMPLOYEE: { className: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
  INDIVIDUAL: { className: 'bg-slate-100 text-slate-700 border-slate-200' },
};

/** Stable colour from an arbitrary string (project chips, tags). */
export const colorFromString = (s: string) => {
  const palette = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6', '#ef4444'];
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) % 997;
  return palette[hash % palette.length]!;
};
