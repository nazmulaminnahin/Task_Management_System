import { describe, expect, it } from 'vitest';
import { HttpError, forbidden, notFound } from './errors';

describe('HttpError factories', () => {
  it('carries status and code', () => {
    const err = forbidden('nope');
    expect(err).toBeInstanceOf(HttpError);
    expect(err.status).toBe(403);
    expect(err.code).toBe('FORBIDDEN');
    expect(err.message).toBe('nope');
  });

  it('404 is distinct from 403 (existence must not leak)', () => {
    expect(notFound().status).toBe(404);
  });
});
