/**
 * Data access. The only layer that knows *where* notes live.
 *
 * Today: an in-memory Map, so the rest of the app is runnable.
 * Later: redis as the write-back cache + kafka to publish the flush events.
 * Swapping the internals must not require touching the service layer — keep the
 * method signatures speaking in domain types (`Note`), never in storage types.
 */

import type { Note } from '../models/note.ts';

const store = new Map<string, Note>();

export const noteRepository = {
  async findAll(): Promise<Note[]> {
    return [...store.values()];
  },

  async findById(id: string): Promise<Note | undefined> {
    return store.get(id);
  },

  async save(note: Note): Promise<Note> {
    store.set(note.id, note);
    return note;
  },

  async deleteById(id: string): Promise<boolean> {
    return store.delete(id);
  },
};

export type NoteRepository = typeof noteRepository;
