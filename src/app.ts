/**
 * Builds the configured Express application. Binds no port and opens no socket —
 * that is `server.ts`'s job. Keeping them apart is what lets a test do
 * `request(createApp()).get('/health')` without ever listening on a port.
 */

import express, { type Express } from 'express';
import { errorHandler } from './middlewares/error-handler.ts';
import { notFoundHandler } from './middlewares/not-found.ts';
import { routes } from './routes/index.ts';

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.use(routes);

  // Order matters: 404 catches unmatched paths, then the error handler formats
  // everything. Both must stay last, in this order.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
