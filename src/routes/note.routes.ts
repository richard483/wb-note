/**
 * Path-to-handler mapping only — the @RequestMapping half of a controller.
 */

import { Router } from 'express';
import * as noteController from '../controllers/note.controller.ts';

export const noteRoutes: Router = Router();

noteRoutes.get('/', noteController.list);
noteRoutes.post('/', noteController.create);
noteRoutes.get('/:id', noteController.getById);
noteRoutes.patch('/:id', noteController.update);
noteRoutes.delete('/:id', noteController.remove);
