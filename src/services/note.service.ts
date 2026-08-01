/**
 * Business logic. Takes and returns plain data — no `Request`, no `Response`.
 * That constraint is what keeps this layer unit-testable without booting Express.
 */

import { randomUUID } from 'node:crypto';
import { NotFoundError, BadRequestError } from '../errors/http-error.ts';
import type { CreateNoteInput, Note, UpdateNoteInput } from '../models/note.ts';
import { noteRepository } from '../repositories/note.repository.ts';

const MAX_TITLE_LENGTH = 200;

function assertValidTitle(title: string): void {
  const trimmed = title.trim();
  if (trimmed.length === 0) {
    throw new BadRequestError('title must not be empty');
  }
  if (trimmed.length > MAX_TITLE_LENGTH) {
    throw new BadRequestError(`title must be at most ${MAX_TITLE_LENGTH} characters`);
  }
}

export const noteService = {
  async list(): Promise<Note[]> {
    return noteRepository.findAll();
  },

  async getById(id: string): Promise<Note> {
    const note = await noteRepository.findById(id);
    if (!note) {
      throw new NotFoundError(`Note ${id} not found`);
    }
    return note;
  },

  async create(input: CreateNoteInput): Promise<Note> {
    assertValidTitle(input.title);

    const now = new Date().toISOString();
    return noteRepository.save({
      id: randomUUID(),
      title: input.title.trim(),
      body: input.body,
      createdAt: now,
      updatedAt: now,
    });
  },

  async update(id: string, input: UpdateNoteInput): Promise<Note> {
    // Referenced through `noteService`, not `this` — the object is exported and
    // its methods may be destructured by callers, which would strip `this`.
    const existing = await noteService.getById(id);

    if (input.title !== undefined) {
      assertValidTitle(input.title);
    }

    return noteRepository.save({
      ...existing,
      ...(input.title !== undefined ? { title: input.title.trim() } : {}),
      ...(input.body !== undefined ? { body: input.body } : {}),
      updatedAt: new Date().toISOString(),
    });
  },

  async remove(id: string): Promise<void> {
    const deleted = await noteRepository.deleteById(id);
    if (!deleted) {
      throw new NotFoundError(`Note ${id} not found`);
    }
  },
};
