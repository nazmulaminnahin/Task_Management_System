import type { NextFunction, Request, Response } from 'express';
import type { Role } from '@prisma/client';
import { forbidden, unauthorized } from '../lib/errors';
import { verifyAccessToken } from '../lib/tokens';

/**
 * Verifies the Bearer access token and attaches a minimal principal to req.user.
 * Deliberately stateless — role changes take effect on the next token refresh
 * (≤15 min), and destructive endpoints re-check the DB where it matters.
 */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(unauthorized('Missing Bearer access token'));
  }
  try {
    const payload = verifyAccessToken(header.slice('Bearer '.length));
    req.user = { id: payload.sub, role: payload.role, email: payload.email, name: payload.name };
    next();
  } catch {
    next(unauthorized('Access token is invalid or expired'));
  }
}

/** Route-level role gate, e.g. router.post('/', authenticate, authorize('ADMIN'), handler). */
export function authorize(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(unauthorized());
    if (roles.length && !roles.includes(req.user.role)) {
      return next(forbidden(`Requires role: ${roles.join(' | ')}`));
    }
    next();
  };
}

/** ADMIN and MANAGER share several management surfaces. */
export const managerOrAdmin = authorize('ADMIN', 'MANAGER');
