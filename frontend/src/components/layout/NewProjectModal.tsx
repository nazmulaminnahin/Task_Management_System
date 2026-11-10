import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/auth.store';
import { useCreateProject, useUsers } from '@/hooks/useProjects';
import { Button, Input, Label, Modal, Textarea, Avatar } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';

const COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6', '#ef4444'];

export function NewProjectModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const createProject = useCreateProject();
  const { data: users } = useUsers();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'TEAM' | 'PERSONAL'>(user?.role === 'INDIVIDUAL' ? 'PERSONAL' : 'TEAM');
  const [color, setColor] = useState(COLORS[0]!);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [error, setError] = useState('');

  const canCreateTeam = user?.role === 'ADMIN' || user?.role === 'MANAGER';

  const submit = async () => {
    if (name.trim().length < 2) return setError('Give your project a name (2+ characters).');
    setError('');
    try {
      const res = await createProject.mutateAsync({
        name: name.trim(),
        description: description.trim() || undefined,
        type: canCreateTeam ? type : 'PERSONAL',
        color,
        memberIds: type === 'TEAM' ? memberIds : [],
      });
      onClose();
      setName('');
      setDescription('');
      setMemberIds([]);
      navigate(`/projects/${res.project.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create project');
    }
  };

  const candidates = (users?.items ?? []).filter((u) => u.id !== user?.id);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New project"
      description="Projects hold boards, tasks and team conversations."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={createProject.isPending}>
            Create project
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {canCreateTeam && (
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { value: 'TEAM', title: 'Team project', hint: 'Shared board with members & reporting' },
                { value: 'PERSONAL', title: 'Personal', hint: 'Private to you only' },
              ] as const
            ).map((o) => (
              <button
                key={o.value}
                onClick={() => setType(o.value)}
                className={cn(
                  'rounded-lg border p-3 text-left transition-colors',
                  type === o.value ? 'border-brand-400 bg-brand-50/50 ring-1 ring-brand-200' : 'border-slate-200 hover:border-slate-300',
                )}
              >
                <div className="text-sm font-semibold text-ink">{o.title}</div>
                <div className="mt-0.5 text-xs text-ink-muted">{o.hint}</div>
              </button>
            ))}
          </div>
        )}

        <div>
          <Label htmlFor="project-name">Project name</Label>
          <Input id="project-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Apollo — Mobile App v2" autoFocus />
        </div>

        <div>
          <Label htmlFor="project-desc">Description</Label>
          <Textarea id="project-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this project about?" rows={3} />
        </div>

        <div>
          <Label>Accent colour</Label>
          <div className="flex gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                style={{ backgroundColor: c }}
                className={cn('h-7 w-7 rounded-full transition-transform', color === c ? 'scale-110 ring-2 ring-offset-2 ring-slate-400' : 'hover:scale-105')}
                aria-label={`Colour ${c}`}
              />
            ))}
          </div>
        </div>

        {type === 'TEAM' && (
          <div>
            <Label>Team members</Label>
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-1.5 scrollbar-thin">
              {candidates.map((u) => {
                const selected = memberIds.includes(u.id);
                return (
                  <button
                    key={u.id}
                    onClick={() => setMemberIds((prev) => (selected ? prev.filter((id) => id !== u.id) : [...prev, u.id]))}
                    className={cn('flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm', selected ? 'bg-brand-50' : 'hover:bg-slate-50')}
                  >
                    <Avatar name={u.name} src={u.avatarUrl} size={22} />
                    <span className="flex-1 truncate">{u.name}</span>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">{u.role}</span>
                    <span className={cn('flex h-4 w-4 items-center justify-center rounded border text-[10px]', selected ? 'border-brand-500 bg-brand-500 text-white' : 'border-slate-300')}>
                      {selected ? '✓' : ''}
                    </span>
                  </button>
                );
              })}
              {candidates.length === 0 && <p className="px-2 py-3 text-xs text-ink-faint">No other users available.</p>}
            </div>
          </div>
        )}

        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
      </div>
    </Modal>
  );
}
