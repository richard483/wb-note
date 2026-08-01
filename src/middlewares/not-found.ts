import type { Request, Response, NextFunction } from 'express';
import { NotFoundError } from '../errors/http-error.ts';

/**
 * Mounted last, after all routes. Anything reaching it matched nothing, so we
 * convert it into a NotFoundError and let the error handler format the reply.
 */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new NotFoundError(`Cannot ${req.method} ${req.originalUrl}`));
}
