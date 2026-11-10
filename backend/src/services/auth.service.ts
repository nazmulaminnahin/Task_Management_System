import type { Response } from 'express';
import type { Role } from '@prisma/client';
import { config } from '../config';
import { conflict, unauthorized } from '../lib/errors';
import { hashPassword, verifyPassword } from '../lib/password';
import { prisma } from '../lib/prisma';
import {
  generateRefreshToken,
  hashToken,
  refreshExpiry,
  signAccessToken,
  type AccessTokenPayload,
} from '../lib/tokens';

export const publicUser = {
  id: true,
  email: true,
  name: true,
  role: true,
  avatarUrl: true,
  isActive: true,
  emailNotifications: true,
  createdAt: true,
  lastSeenAt: true,
} as const;

export function setRefreshCookie(res: Response, token: string) {
  res.cookie(config.auth.cookieName, token, {
    httpOnly: true,
    secure: config.auth.cookieSecure,
    sameSite: 'lax',
    path: '/api/auth',
    maxAge: config.auth.refreshTtlDays * 24 * 60 * 60 * 1000,
  });
}

export function clearRefreshCookie(res: Response) {
  res.clearCookie(config.auth.cookieName, { path: '/api/auth' });
}

async function issueTokens(
  res: Response,
  user: { id: string; email: string; role: Role; name: string },
  meta: { ip?: string; userAgent?: string },
) {
  const accessToken = signAccessToken({
    sub: user.id,
    role: user.role,
    email: user.email,
    name: user.name,
  } satisfies AccessTokenPayload);

  const { token, hash } = generateRefreshToken();
  await prisma.refreshToken.create({
    data: {
      tokenHash: hash,
      userId: user.id,
      expiresAt: refreshExpiry(),
      ip: meta.ip,
      userAgent: meta.userAgent?.slice(0, 255),
    },
  });
  setRefreshCookie(res, token);
  return accessToken;
}

export async function registerUser(input: {
  email: string;
  password: string;
  name: string;
  role?: Role;
}) {
  const email = input.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) throw conflict('An account with this email already exists', 'EMAIL_TAKEN');

  // Public self-service signup can only ever create EMPLOYEE or INDIVIDUAL.
  // Elevated roles (ADMIN/MANAGER) are granted by an admin via PATCH /users/:id/role.
  const role: Role = input.role === 'INDIVIDUAL' ? 'INDIVIDUAL' : 'EMPLOYEE';

  return prisma.user.create({
    data: { email, name: input.name.trim(), passwordHash: await hashPassword(input.password), role },
    select: publicUser,
  });
}

export async function loginUser(
  res: Response,
  input: { email: string; password: string },
  meta: { ip?: string; userAgent?: string },
) {
  const user = await prisma.user.findUnique({ where: { email: input.email.trim().toLowerCase() } });
  // Constant-ish response shape: never reveal whether the email exists.
  if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
    throw unauthorized('Invalid email or password');
  }
  if (!user.isActive) throw unauthorized('This account has been deactivated');

  await prisma.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date() } });
  const accessToken = await issueTokens(res, user, meta);
  return { accessToken, user: await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: publicUser }) };
}

export async function rotateRefreshToken(
  res: Response,
  rawToken: string | undefined,
  meta: { ip?: string; userAgent?: string },
) {
  if (!rawToken) throw unauthorized('Refresh token missing');

  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    include: { user: { select: { id: true, email: true, role: true, name: true, isActive: true } } },
  });
  if (!stored) throw unauthorized('Refresh token is invalid');

  // Reuse detection: a revoked token being presented means it was stolen.
  if (stored.revokedAt) {
    await prisma.refreshToken.updateMany({
      where: { userId: stored.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    clearRefreshCookie(res);
    throw unauthorized('Refresh token has been revoked — please sign in again');
  }
  if (stored.expiresAt < new Date() || !stored.user.isActive) {
    throw unauthorized('Refresh token expired');
  }

  await prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
  const accessToken = await issueTokens(res, stored.user, meta);
  return { accessToken };
}

export async function revokeSession(rawToken: string | undefined) {
  if (!rawToken) return;
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashToken(rawToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function listSessions(userId: string) {
  return prisma.refreshToken.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true, userAgent: true, ip: true, createdAt: true, expiresAt: true },
    orderBy: { createdAt: 'desc' },
  });
}
