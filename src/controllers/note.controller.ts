/**
 * HTTP adapter. Its whole job: pull data out of the request, hand it to the
 * service, put the result on the response. No business rules live here.
 *
 * Express 5 forwards rejected promises from async handlers to the error
 * middleware on its own, so none of these need a try/catch.
 */

import type { Request, Response } from 'express';
import { BadRequestError } from '../errors/http-error.ts';
import type { CreateNoteInput, UpdateNoteInput } from '../models/note.ts';
import { noteService } from '../services/note.service.ts';

/**
 * `noUncheckedIndexedAccess` types route params as possibly-undefined, and
 * `noPropertyAccessFromIndexSignature` forbids `req.params.id`. Express 5 also
 * types a param as `string | string[]`, since wildcard segments can repeat.
 * Both of your strict flags plus that union make direct access noisy — this
 * helper absorbs the ceremony in one place.
 */
function requireParam(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value !== 'string') {
    throw new BadRequestError(`Missing or invalid route parameter: ${name}`);
  }
  return value;
}

function parseCreateInput(body: unknown): CreateNoteInput {
  if (typeof body !== 'object' || body === null) {
    throw new BadRequestError('Request body must be a JSON object');
  }
  const { title, body: noteBody } = body as Record<string, unknown>;

  if (typeof title !== 'string') {
    throw new BadRequestError('title is required and must be a string');
  }
  if (noteBody !== undefined && typeof noteBody !== 'string') {
    throw new BadRequestError('body must be a string');
  }
  return { title, body: noteBody ?? '' };
}

function parseUpdateInput(body: unknown): UpdateNoteInput {
  if (typeof body !== 'object' || body === null) {
    throw new BadRequestError('Request body must be a JSON object');
  }
  const { title, body: noteBody } = body as Record<string, unknown>;

  if (title !== undefined && typeof title !== 'string') {
    throw new BadRequestError('title must be a string');
  }
  if (noteBody !== undefined && typeof noteBody !== 'string') {
    throw new BadRequestError('body must be a string');
  }
  if (title === undefined && noteBody === undefined) {
    throw new BadRequestError('Provide at least one of: title, body');
  }

  // Spread-conditionally rather than assigning `undefined` — `exactOptionalPropertyTypes`
  // treats `{ title: undefined }` and `{}` as different types.
  return {
    ...(title !== undefined ? { title } : {}),
    ...(noteBody !== undefined ? { body: noteBody } : {}),
  };
}

/*
 * Exported as standalone functions rather than methods on an object. Route
 * registration passes these by reference (`noteRoutes.get('/', list)`), which
 * detaches a method from its receiver and silently breaks any use of `this`.
 * Plain functions have no receiver to lose.
 */

export async function list(_req: Request, res: Response): Promise<void> {
  res.json(await noteService.list());
}

export async function getById(req: Request, res: Response): Promise<void> {
  res.json(await noteService.getById(requireParam(req, 'id')));
}

export async function create(req: Request, res: Response): Promise<void> {
  const note = await noteService.create(parseCreateInput(req.body));
  res.status(201).json(note);
}

export async function update(req: Request, res: Response): Promise<void> {
  const note = await noteService.update(requireParam(req, 'id'), parseUpdateInput(req.body));
  res.json(note);
}

export async function remove(req: Request, res: Response): Promise<void> {
  await noteService.remove(requireParam(req, 'id'));
  res.status(204).send();
}
