/**
 * Errors that carry an HTTP status. Services throw these; the error middleware
 * translates them into responses. Roughly Spring's @ResponseStatus exceptions.
 */

export class HttpError extends Error {
  readonly status: number;
  readonly details: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = new.target.name;
    this.status = status;
    this.details = details;
    Error.captureStackTrace?.(this, new.target);
  }
}

export class BadRequestError extends HttpError {
  constructor(message = 'Bad Request', details?: unknown) {
    super(400, message, details);
  }
}

export class NotFoundError extends HttpError {
  constructor(message = 'Not Found', details?: unknown) {
    super(404, message, details);
  }
}
