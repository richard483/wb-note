import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.ts';
import { HttpError } from '../errors/http-error.ts';

/**
 * Terminal error middleware — the @ControllerAdvice of this app.
 *
 * The four-argument signature is *load-bearing*: Express identifies error
 * middleware by `fn.length === 4`. Drop `next` and this silently stops working,
 * which is why `next` is kept despite being unused.
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // Express may fire this after headers are already flushed (e.g. a stream that
  // died mid-response). Writing again would throw — hand it back to Express.
  if (res.headersSent) {
    return;
  }

  if (err instanceof HttpError) {
    res.status(err.status).json({
      error: err.message,
      ...(err.details !== undefined ? { details: err.details } : {}),
    });
    return;
  }

  // Malformed JSON from express.json() surfaces as a SyntaxError carrying `status`.
  if (err instanceof SyntaxError && 'status' in err && err.status === 400) {
    res.status(400).json({ error: 'Malformed JSON in request body' });
    return;
  }

  console.error('Unhandled error:', err);

  res.status(500).json({
    error: 'Internal Server Error',
    // Never leak internals in production; in dev the stack is what you want.
    ...(env.isProduction ? {} : { detail: err instanceof Error ? err.stack : String(err) }),
  });
}
