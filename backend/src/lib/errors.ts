export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code: string = 'ERROR',
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const badRequest = (msg = 'Invalid request', details?: unknown) =>
  new HttpError(400, msg, 'BAD_REQUEST', details);
export const unauthorized = (msg = 'Authentication required') =>
  new HttpError(401, msg, 'UNAUTHORIZED');
export const forbidden = (msg = 'You do not have permission to perform this action') =>
  new HttpError(403, msg, 'FORBIDDEN');
export const notFound = (msg = 'Resource not found') => new HttpError(404, msg, 'NOT_FOUND');
export const conflict = (msg = 'Conflict', code = 'CONFLICT') => new HttpError(409, msg, code);
export const tooMany = (msg = 'Too many requests') => new HttpError(429, msg, 'RATE_LIMITED');
