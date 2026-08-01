import { env } from "../config/env.ts";
import { producer } from "../infra/kafka.ts";
import type { Note } from "../models/note.ts";
import { noteCacheRepository as cache } from './note.cache.repository.ts';

export type NoteEvent =
  | { type: 'note.upserted'; note: Note }
  | { type: 'note.deleted'; id: string };

async function publish(event: NoteEvent, key: string): Promise<void> {
  await producer.send({
    topic: env.kafkaTopic,
    messages: [
      {
        key,
        value: JSON.stringify(event),
      },
    ],
  });
}

export const noteRepository = {
  async findAll(): Promise<Note[]> {
    return cache.list();
  },

  async findById(id: string): Promise<Note | undefined> {
    return cache.get(id);
  },

  async save(note: Note): Promise<Note> {
    await publish({ type: 'note.upserted', note }, note.id);
    await cache.save(note);
    return note;
  },

  async deleteById(id: string): Promise<boolean> {
    const existing = await cache.get(id);
    if (!existing) return false;

    await publish({ type: 'note.deleted', id }, id);
    await cache.remove(id);
    return true;
  },
};


export type NoteRepository = typeof noteRepository;