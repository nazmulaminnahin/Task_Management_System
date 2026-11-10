import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';

/**
 * Renders task descriptions and comment bodies.
 * react-markdown does NOT allow raw HTML by default, which is the XSS boundary.
 * Mention tokens in the form @[Name](uuid) are converted to styled chips first.
 */
export function Markdown({ children, className }: { children: string; className?: string }) {
  const withMentions = children.replace(/@\[([^\]]+)\]\(([0-9a-f-]{36})\)/g, '**@$1**');
  return (
    <div
      className={cn(
        'prose-task text-sm leading-relaxed text-slate-700',
        '[&_p]:mb-2 [&_p:last-child]:mb-0 [&_ul]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-2 [&_ol]:list-decimal [&_ol]:pl-5',
        '[&_a]:font-medium [&_a]:text-brand-600 [&_a]:underline [&_code]:rounded [&_code]:bg-slate-100 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[12px]',
        '[&_blockquote]:border-l-2 [&_blockquote]:border-slate-200 [&_blockquote]:pl-3 [&_blockquote]:text-ink-muted',
        '[&_strong]:font-semibold [&_strong]:text-ink [&_h1]:text-base [&_h1]:font-semibold [&_h2]:text-sm [&_h2]:font-semibold',
        className,
      )}
    >
      <ReactMarkdown>{withMentions}</ReactMarkdown>
    </div>
  );
}

export function extractMentionIds(body: string): string[] {
  return [...new Set([...body.matchAll(/@\[([^\]]+)\]\(([0-9a-f-]{36})\)/g)].map((m) => m[2]!))];
}
