import { useRef, useState } from 'react';
import { CornerDownRight, MoreHorizontal, Send } from 'lucide-react';
import type { Comment, ProjectMember } from '@/types';
import { Avatar, Button } from '@/components/ui/primitives';
import { fromNow, cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';
import { Markdown } from './Markdown';
import { useAddComment } from '@/hooks/useTasks';

/** Insert a mention token at the caret and keep focus. */
function insertMention(textarea: HTMLTextAreaElement, name: string, id: string) {
  const token = `@[${name}](${id}) `;
  const start = textarea.selectionStart ?? textarea.value.length;
  const next = textarea.value.slice(0, start) + token + textarea.value.slice(textarea.selectionEnd ?? start);
  return next;
}

export function CommentThread({
  taskId,
  comments,
  members,
}: {
  taskId: string;
  comments: Comment[];
  members: ProjectMember[];
}) {
  const user = useAuthStore((s) => s.user);
  const addComment = useAddComment(taskId);
  const [body, setBody] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  const submit = async () => {
    if (!body.trim()) return;
    await addComment.mutateAsync({ body: body.trim(), parentId: replyTo });
    setBody('');
    setReplyTo(null);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void submit();
    }
    if (e.key === '@') {
      setMentionOpen(true);
      setMentionQuery('');
    } else if (mentionOpen) {
      if (e.key === 'Escape') setMentionOpen(false);
      else if (/^[a-zA-Z ]$/.test(e.key)) setMentionQuery((q) => q + e.key);
    }
  };

  const mentionCandidates = members
    .filter((m) => m.id !== user?.id)
    .filter((m) => m.name.toLowerCase().includes(mentionQuery.toLowerCase()))
    .slice(0, 5);

  const Composer = ({ placeholder }: { placeholder: string }) => (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus-within:border-brand-400 dark:focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100 dark:focus-within:ring-brand-950 shadow-sm">
      <textarea
        ref={composerRef}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={onKeyDown}
        rows={3}
        placeholder={placeholder}
        className="w-full resize-none rounded-t-lg border-0 bg-transparent px-3 py-2.5 text-sm outline-none text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
      />
      <div className="relative flex items-center justify-between border-t border-slate-100 dark:border-slate-700 px-2 py-1.5">
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              composerRef.current?.focus();
              setBody((b) => `${b}@`);
              setMentionOpen(true);
              setMentionQuery('');
            }}
            className="rounded px-1.5 py-0.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
            type="button"
          >
            @ Mention
          </button>
          <span className="text-[10px] text-slate-400 dark:text-slate-400">Markdown supported · ⌘↵ to send</span>
        </div>
        <Button size="sm" onClick={() => void submit()} loading={addComment.isPending} disabled={!body.trim()}>
          <Send size={12} /> Comment
        </Button>

        {mentionOpen && mentionCandidates.length > 0 && (
          <div className="absolute bottom-10 left-2 z-20 w-56 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-pop">
            {mentionCandidates.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  const composerEl = composerRef.current;
                  if (composerEl) {
                    const caret = composerEl.selectionStart;
                    const trimmed = body.replace(/@$/, '');
                    const token = `@[${m.name}](${m.id}) `;
                    setBody(trimmed.slice(0, Math.max(0, caret - 1)) + token + trimmed.slice(Math.max(0, caret - 1)));
                  }
                  setMentionOpen(false);
                }}
                className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                <Avatar name={m.name} src={m.avatarUrl} size={20} />
                <span className="truncate">{m.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {replyTo && (
        <div className="flex items-center justify-between rounded-lg bg-brand-50 dark:bg-brand-950/60 border border-brand-200 dark:border-brand-800 px-3 py-1.5 text-xs text-brand-700 dark:text-brand-300">
          <span className="inline-flex items-center gap-1">
            <CornerDownRight size={12} /> Replying to a comment
          </span>
          <button onClick={() => setReplyTo(null)} className="font-semibold hover:underline">
            Cancel
          </button>
        </div>
      )}
      <Composer placeholder={replyTo ? 'Write a reply…' : 'Add a comment — use @ to mention a teammate'} />

      <div className="space-y-3">
        {comments.length === 0 && <p className="py-4 text-center text-sm text-slate-400 dark:text-slate-500">No comments yet — start the discussion.</p>}
        {comments.map((c) => (
          <div key={c.id} className="space-y-2">
            <CommentBubble comment={c} onReply={() => setReplyTo(c.id)} canReply={!c.parentId} />
            {c.replies?.map((r) => (
              <div key={r.id} className="ml-9">
                <CommentBubble comment={r} canReply={false} compact />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function CommentBubble({
  comment,
  onReply,
  canReply,
  compact,
}: {
  comment: Comment;
  onReply?: () => void;
  canReply?: boolean;
  compact?: boolean;
}) {
  const user = useAuthStore((s) => s.user);
  const isMine = comment.authorId === user?.id;
  return (
    <div className={cn(
      'rounded-lg border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-800/80 p-3 shadow-sm', 
      compact && 'bg-slate-50/60 dark:bg-slate-800/40'
    )}>
      <div className="mb-1.5 flex items-center gap-2">
        <Avatar name={comment.author.name} src={comment.author.avatarUrl} size={compact ? 20 : 24} />
        <span className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">{comment.author.name}</span>
        {isMine && <span className="rounded bg-brand-50 dark:bg-brand-950 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-brand-600 dark:text-brand-400 border border-brand-200 dark:border-brand-800">You</span>}
        <span className="text-[11px] text-slate-400 dark:text-slate-500">{fromNow(comment.createdAt)}</span>
        {comment.editedAt && <span className="text-[10px] italic text-slate-400 dark:text-slate-500">edited</span>}
        <div className="ml-auto flex items-center gap-1">
          {canReply && (
            <button onClick={onReply} className="rounded px-1.5 py-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white">
              Reply
            </button>
          )}
          <button className="rounded p-0.5 text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-300" aria-label="More">
            <MoreHorizontal size={14} />
          </button>
        </div>
      </div>
      {comment.deletedAt ? (
        <p className="text-sm italic text-slate-400 dark:text-slate-500">This comment was deleted.</p>
      ) : (
        <div className="text-[13px] text-slate-800 dark:text-slate-200">
          <Markdown>{comment.body}</Markdown>
        </div>
      )}
    </div>
  );
}