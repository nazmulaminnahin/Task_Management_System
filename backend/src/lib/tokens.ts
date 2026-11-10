import crypto from 'node:crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { config } from '../config';
import type { Role } from '@prisma/client';

export interface AccessTokenPayload {
  sub: string;
  role: Role;
  email: string;
  name: string;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, config.auth.accessSecret, {
    expiresIn: config.auth.accessTtl,
  } as SignOptions);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, config.auth.accessSecret) as AccessTokenPayload;
}

/** Refresh tokens are opaque random strings; only their SHA-256 hash is stored. */
export function generateRefreshToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(48).toString('base64url');
  return { token, hash: hashToken(token) };
}

export const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

export const refreshExpiry = () =>
  new Date(Date.now() + config.auth.refreshTtlDays * 24 * 60 * 60 * 1000);
