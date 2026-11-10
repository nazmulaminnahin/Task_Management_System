import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config';
import { asyncHandler } from '../lib/http';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { rateLimit } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import {
  clearRefreshCookie,
  listSessions,
  loginUser,
  publicUser,
  registerUser,
  revokeSession,
  rotateRefreshToken,
} from '../services/auth.service';
import { logActivity } from '../services/activity.service';
import { unauthorized } from '../lib/errors';

const router = Router();
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30 });

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(72),
  name: z.string().min(2).max(80),
  role: z.enum(['EMPLOYEE', 'INDIVIDUAL']).optional(),
});

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

/** POST /api/auth/register — self-service signup (EMPLOYEE | INDIVIDUAL only). */
router.post(
  '/register',
  authLimiter,
  validate({ body: registerSchema }),
  asyncHandler(async (req, res) => {
    const user = await registerUser(req.body);
    await logActivity({
      actorId: user.id,
      action: 'USER_CREATED',
      entityType: 'USER',
      entityId: user.id,
      metadata: { email: user.email, role: user.role, source: 'self-signup' },
      ipAddress: req.ip,
    });
    res.status(201).json({ user });
  }),
);

/** POST /api/auth/login — sets the http-only refresh cookie, returns access token + user. */
router.post(
  '/login',
  authLimiter,
  validate({ body: loginSchema }),
  asyncHandler(async (req, res) => {
    try {
      const result = await loginUser(res, req.body, {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      });
      await logActivity({
        actorId: result.user.id,
        action: 'AUTH_LOGIN',
        entityType: 'USER',
        entityId: result.user.id,
        ipAddress: req.ip,
      });
      res.json(result);
    } catch (err) {
      await logActivity({
        action: 'AUTH_FAILED',
        entityType: 'USER',
        metadata: { email: req.body.email },
        ipAddress: req.ip,
      });
      throw err;
    }
  }),
);

/** POST /api/auth/refresh — rotates the refresh token (single-use) and mints a new access token. */
router.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const { accessToken } = await rotateRefreshToken(res, req.cookies?.[config.auth.cookieName], {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    const payload = JSON.parse(Buffer.from(accessToken.split('.')[1]!, 'base64url').toString()) as {
      sub: string;
    };
    const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: publicUser });
    if (!user) throw unauthorized();
    res.json({ accessToken, user });
  }),
);

/** POST /api/auth/logout — revokes the presented refresh token and clears the cookie. */
router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    await revokeSession(req.cookies?.[config.auth.cookieName]);
    clearRefreshCookie(res);
    res.status(204).send();
  }),
);

/** GET /api/auth/me — current principal + safe user record. */
router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id }, select: publicUser });
    if (!user) throw unauthorized();
    res.json({ user });
  }),
);

/** GET /api/auth/sessions — active refresh-token sessions for the current user. */
router.get(
  '/sessions',
  authenticate,
  asyncHandler(async (req, res) => {
    res.json({ sessions: await listSessions(req.user!.id) });
  }),
);

export default router;
