import { env } from "../config/env.ts";
import { producer } from "../infra/kafka.ts";
import type { Note } from "../models/note.ts";
import { noteCacheRepository as cache } from './note.cache.repository.ts';
import { noteMemoryRepository } from "./note.memory.repository.ts";

export type NoteEvent =
  | { type: 'note.upserted'; note: Note }
  // occurredAt makes a replayed delete safe: without it, re-running an old
  // delete would remove a note that has since been recreated or edited.
  | { type: 'note.deleted'; id: string; occurredAt: string };

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

export const noteDbCacheRepository = {
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

    await publish({ type: 'note.deleted', id, occurredAt: new Date().toISOString() }, id);
    await cache.remove(id);
    return true;
  },
};

export const noteRepository = env.nodeEnv === 'test' ? noteMemoryRepository : noteDbCacheRepository;

export type NoteRepository = typeof noteRepository;