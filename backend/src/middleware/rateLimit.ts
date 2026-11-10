import type { Request, Response, NextFunction } from 'express';
import { tooMany } from '../lib/errors';

interface Bucket { count: number; resetAt: number }

/**
 * Tiny in-memory fixed-window limiter — good for a single node.
 * In production, swap this for rate-limiter-flexible backed by Redis.
 */
export function rateLimit(opts: { windowMs: number; max: number; key?: (req: Request) => string }) {
  const buckets = new Map<string, Bucket>();
  const keyOf = opts.key ?? ((req: Request) => req.ip ?? 'unknown');

  return (req: Request, _res: Response, next: NextFunction) => {
    const key = `${req.path}:${keyOf(req)}`;
    const now = Date.now();
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt < now) {
      buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
      return next();
    }
    bucket.count += 1;
    if (bucket.count > opts.max) return next(tooMany());
    next();
  };
}
