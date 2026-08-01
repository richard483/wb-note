/**
 * Single place where every route module gets mounted under its prefix.
 */

import { Router } from 'express';
import { noteRoutes } from './note.routes.ts';

export const routes: Router = Router();

routes.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

routes.use('/api/notes', noteRoutes);
