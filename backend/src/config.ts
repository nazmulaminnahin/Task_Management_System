/**
 * Application Configuration Module
 * Loads environment variables and provides a centralized, typed configuration object.
 */

import 'dotenv/config';
import path from 'node:path';

function bool(value: string | undefined, fallback = false): boolean {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4000),
  clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
  publicApiUrl: process.env.PUBLIC_API_URL ?? 'http://localhost:4000',

  databaseUrl: process.env.DATABASE_URL ?? '',

  auth: {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret-change-me',
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret-change-me',
    accessTtl: process.env.ACCESS_TOKEN_TTL ?? '15m',
    refreshTtlDays: Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? 7),
    bcryptRounds: Number(process.env.BCRYPT_ROUNDS ?? 10),
    cookieName: 'tf_refresh',
    cookieSecure: bool(process.env.COOKIE_SECURE, process.env.NODE_ENV === 'production'),
  },

  uploads: {
    dir: path.resolve(process.env.UPLOAD_DIR ?? './uploads'),
    maxBytes: Number(process.env.MAX_UPLOAD_MB ?? 10) * 1024 * 1024,
  },

  mail: {
    from: process.env.MAIL_FROM ?? 'TaskForge <no-reply@taskforge.local>',
    smtpHost: process.env.SMTP_HOST ?? '',
  },
} as const;

if (config.env === 'production') {
  const weak = [config.auth.accessSecret, config.auth.refreshSecret].some((s) => s.includes('change-me'));
  if (weak) throw new Error('Refusing to boot: JWT secrets are still set to development defaults.');
}