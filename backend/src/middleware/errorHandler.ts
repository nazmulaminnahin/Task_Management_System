/**
 * Global Express Error Handler Middleware
 * Intercepts application errors, Zod validation issues, and Prisma database exceptions,
 * formatting them consistently into uniform JSON responses.
 */

import type { ErrorRequestHandler, NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { config } from '../config';
import { HttpError } from '../lib/errors';

export function notFoundHandler(req: Request, _res: Response, next: NextFunction) {
  next(new HttpError(404, `Route ${req.method} ${req.originalUrl} not found`, 'NOT_FOUND'));
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details ?? undefined },
    });
  }
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      return res.status(409).json({
        error: { code: 'UNIQUE_VIOLATION', message: 'A record with these values already exists' },
      });
    }
    if (err.code === 'P2025') {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Record not found' } });
    }
  }
  if (err instanceof Prisma.PrismaClientValidationError) {
    return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid query payload' } });
  }

  console.error('[error]', err);
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong',
      ...(config.env !== 'production' && { details: (err as Error)?.message }),
    },
  });
};