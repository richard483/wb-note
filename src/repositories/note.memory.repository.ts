import type { Note } from '../models/note.ts';

const store = new Map<string, Note>();

export const noteMemoryRepository = {

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
  }
};