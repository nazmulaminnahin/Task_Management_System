import { forwardRef, type ButtonHTMLAttributes, type LabelHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------ Button */
type ButtonVariant = 'primary' | 'outline' | 'ghost' | 'danger' | 'subtle';
type ButtonSize = 'sm' | 'md' | 'icon';

const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 shadow-sm',
  outline: 'border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-ink dark:text-slate-100 hover:border-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800',
  ghost: 'text-ink-muted dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-ink dark:hover:text-white',
  danger: 'bg-rose-600 text-white hover:bg-rose-700',
  subtle: 'bg-brand-50 dark:bg-brand-950/50 text-brand-700 dark:text-brand-300 hover:bg-brand-100 dark:hover:bg-brand-900/60',
};
const buttonSizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-2.5 text-xs gap-1.5',
  md: 'h-9 px-3.5 text-sm gap-2',
  icon: 'h-8 w-8 p-0',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, children, disabled, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200 disabled:cursor-not-allowed disabled:opacity-50',
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      {...props}
    >
      {loading && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  ),
);
Button.displayName = 'Button';

/* -------------------------------------------------------------------- Input */
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={cn('input bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border-slate-300 dark:border-slate-700', className)} {...props} />,
);
Input.displayName = 'Input';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea ref={ref} className={cn('input min-h-[80px] py-2 leading-relaxed bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border-slate-300 dark:border-slate-700', className)} {...props} />
  ),
);
Textarea.displayName = 'Textarea';

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select ref={ref} className={cn('input cursor-pointer pr-8 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border-slate-300 dark:border-slate-700', className)} {...props}>
      {children}
    </select>
  ),
);
Select.displayName = 'Select';

export const Label = ({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) => (
  <label className={cn('label text-slate-700 dark:text-slate-300', className)} {...props} />
);

/* -------------------------------------------------------------------- Badge */
export function Badge({
  className,
  children,
  dot,
}: {
  className?: string;
  children: ReactNode;
  dot?: string;
}) {
  return (
    <span className={cn('chip border border-transparent', className)}>
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full', dot)} />}
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------- Avatar */
export function Avatar({
  name,
  src,
  size = 28,
  className,
}: {
  name: string;
  src?: string | null;
  size?: number;
  className?: string;
}) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase())
    .join('');
  const tints = ['bg-brand-100 text-brand-700', 'bg-emerald-100 text-emerald-700', 'bg-amber-100 text-amber-700', 'bg-rose-100 text-rose-700', 'bg-sky-100 text-sky-700', 'bg-violet-100 text-violet-700'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) % 997;
  return src ? (
    <img
      src={src}
      alt={name}
      style={{ width: size, height: size }}
      className={cn('rounded-full object-cover ring-2 ring-white dark:ring-slate-800', className)}
    />
  ) : (
    <span
      title={name}
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.38) }}
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full font-semibold ring-2 ring-white dark:ring-slate-800', tints[hash % tints.length], className)}
    >
      {initials}
    </span>
  );
}

export function AvatarStack({ people, max = 4 }: { people: Array<{ id: string; name: string; avatarUrl?: string | null }>; max?: number }) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <div className="flex -space-x-2">
      {shown.map((p) => (
        <Avatar key={p.id} name={p.name} src={p.avatarUrl} size={24} />
      ))}
      {rest > 0 && (
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-[10px] font-semibold text-slate-600 dark:text-slate-300 ring-2 ring-white dark:ring-slate-800">
          +{rest}
        </span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------- Modal */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = 'max-w-lg',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 pt-[8vh] backdrop-blur-[2px]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
        className={cn('w-full animate-fade-in rounded-2xl bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-800 shadow-pop', width)}
      >
        <div className="flex items-start justify-between border-b border-slate-100 dark:border-slate-800 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-ink dark:text-white">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-ink-muted dark:text-slate-400">{description}</p>}
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-ink-faint dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-ink dark:hover:text-white" aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800 px-6 py-3.5 bg-slate-50/50 dark:bg-slate-900/50">{footer}</div>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Skeleton */
export const Skeleton = ({ className }: { className?: string }) => (
  <div className={cn('animate-pulse rounded-md bg-slate-200/70 dark:bg-slate-800', className)} />
);

/* ----------------------------------------------------------------- Empty state */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-900/60 px-6 py-14 text-center">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">{icon}</div>
      <h3 className="text-sm font-semibold text-ink dark:text-white">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-ink-muted dark:text-slate-400">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------- Progress */
export function ProgressBar({ value, className, tone = 'brand' }: { value: number; className?: string; tone?: 'brand' | 'emerald' | 'amber' | 'rose' }) {
  const tones = { brand: 'bg-brand-500', emerald: 'bg-emerald-500', amber: 'bg-amber-500', rose: 'bg-rose-500' };
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800', className)}>
      <div className={cn('h-full rounded-full transition-all duration-300', tones[tone])} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

/* --------------------------------------------------------------------- Tabs */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
}: {
  options: Array<{ value: T; label: string; icon?: ReactNode }>;
  value: T;
  onChange: (v: T) => void;
  size?: 'sm' | 'md';
}) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md font-medium transition-colors',
            size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-sm',
            value === o.value
              ? 'bg-white dark:bg-slate-700 text-ink dark:text-white shadow-sm ring-1 ring-slate-200 dark:ring-slate-600'
              : 'text-ink-muted dark:text-slate-400 hover:text-ink dark:hover:text-white',
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}