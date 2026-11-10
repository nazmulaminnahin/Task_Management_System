import { describe, expect, it } from 'vitest';
import { moveTask, positionBetween, renormalizeColumn, taskProgress } from './task.service';

// These are pure-math / pure-shape units; DB-backed move paths are covered by
// the integration suite that runs against a migrated test database.
describe('positionBetween (fractional ranking)', () => {
  it('places the first card in an empty column', () => {
    expect(positionBetween(null, null)).toBe(1000);
  });
  it('appends after the last card', () => {
    expect(positionBetween(3000, null)).toBe(4000);
  });
  it('prepends before the first card', () => {
    expect(positionBetween(null, 1000)).toBe(0);
  });
  it('bisects between neighbours', () => {
    expect(positionBetween(1000, 2000)).toBe(1500);
    expect(positionBetween(1000, 1500)).toBe(1250);
  });
  it('converges without colliding', () => {
    let before = 1000;
    const after = 2000;
    const seen = new Set<number>();
    for (let i = 0; i < 20; i++) {
      before = positionBetween(before, after);
      expect(seen.has(before)).toBe(false);
      seen.add(before);
    }
  });
});

describe('taskProgress', () => {
  it('derives progress from subtasks when present', () => {
    expect(taskProgress({ status: 'IN_PROGRESS', subtasks: [{ isDone: true }, { isDone: false }] })).toBe(50);
    expect(taskProgress({ status: 'TODO', subtasks: [{ isDone: true }, { isDone: true }] })).toBe(100);
  });
  it('falls back to status buckets without subtasks', () => {
    expect(taskProgress({ status: 'IN_REVIEW', subtasks: [] })).toBe(80);
    expect(taskProgress({ status: 'DONE', subtasks: [] })).toBe(100);
    expect(taskProgress({ status: 'BACKLOG', subtasks: [] })).toBe(0);
  });
});

describe('renormalizeColumn / moveTask contracts', () => {
  it('are exported for the route layer', () => {
    expect(typeof renormalizeColumn).toBe('function');
    expect(typeof moveTask).toBe('function');
  });
});
