/**
 * Builds the configured Express application. Binds no port and opens no socket —
 * that is `server.ts`'s job. Keeping them apart is what lets a test do
 * `request(createApp()).get('/health')` without ever listening on a port.
 */

import express, { type Express } from 'express';
import { errorHandler } from './middlewares/error-handler.ts';
import { notFoundHandler } from './middlewares/not-found.ts';
import { routes } from './routes/index.ts';
import path from 'node:path';

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Static first so `/` serves index.html. Requests that match no file fall
  // through to the API routes below. Resolved from this module's own directory
  // so it works whether started from src/ or dist/, and from any cwd.
  app.use(express.static(path.join(import.meta.dirname, '../public')));

  app.use(routes);

  // Order matters: 404 catches unmatched paths, then the error handler formats
  // everything. Both must stay last, in this order — anything registered after
  // notFoundHandler is unreachable.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
