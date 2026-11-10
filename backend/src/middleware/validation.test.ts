import { describe, expect, it } from 'vitest';
import { z } from 'zod';

const moveSchema = z.object({
  status: z.enum(['BACKLOG', 'TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'CANCELLED']),
  columnId: z.string().uuid().nullable().optional(),
  beforeId: z.string().uuid().nullable().optional(),
  afterId: z.string().uuid().nullable().optional(),
});

const UUID = '805a949c-6b1b-4165-a8e8-a1252e42bf4a';

describe('move payload schema', () => {
  it('accepts a neighbour-based move', () => {
    expect(moveSchema.parse({ status: 'IN_PROGRESS', columnId: UUID, beforeId: null, afterId: UUID })).toBeTruthy();
  });
  it('rejects an unknown status', () => {
    expect(() => moveSchema.parse({ status: 'SHIPPED' })).toThrow();
  });
  it('rejects a non-uuid column', () => {
    expect(() => moveSchema.parse({ status: 'TODO', columnId: 'col-1' })).toThrow();
  });
});

const mentionRe = /@\[([^\]]+)\]\(([0-9a-f-]{36})\)/g;
describe('mention parser', () => {
  it('extracts unique uuid mentions', () => {
    const body = `ping @[Marco Rossi](${UUID}) and @[Marco Rossi](${UUID}) and @[Sofia](${UUID})`;
    expect([...new Set([...body.matchAll(mentionRe)].map((m) => m[2]))]).toHaveLength(1);
  });
  it('ignores free-text @handles without ids', () => {
    expect([...('hey @marco'.matchAll(mentionRe))]).toHaveLength(0);
  });
});
