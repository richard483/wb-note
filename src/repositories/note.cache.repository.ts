import { redis } from '../infra/redis.ts';
import type { Note } from '../models/note.ts';

const noteKey = (id: string) => `note:${id}`;
const INDEX_KEY = 'notes:index';
const READY_KEY = 'notes:ready';

export const noteCacheRepository = {
  async get(id: string): Promise<Note | undefined> {
    const raw = await redis.get(noteKey(id));
    return raw ? (JSON.parse(raw) as Note) : undefined;
  },

  async list(): Promise<Note[]> {
    const ids = await redis.zRange(INDEX_KEY, 0, -1, { REV: true });
    if (ids.length === 0) return [];
    const raws = await redis.mGet(ids.map(noteKey));
    return raws.filter((r) => r !== null).map((r) => JSON.parse(r) as Note);
  },

  async save(note: Note): Promise<void> {
    await redis
      .multi()
      .set(noteKey(note.id), JSON.stringify(note))
      .zAdd(INDEX_KEY, { score: Date.parse(note.updatedAt), value: note.id })
      .exec();
  },

  async remove(id: string): Promise<void> {
    await redis.multi().del(noteKey(id)).zRem(INDEX_KEY, id).exec();
  },

  async isReady(): Promise<boolean> {
    return (await redis.exists(READY_KEY)) === 1;
  },

  async rehydrate(notes: Note[]): Promise<void> {
    const multi = redis.multi();
    for (const n of notes) {
      multi.set(noteKey(n.id), JSON.stringify(n));
      multi.zAdd(INDEX_KEY, { score: Date.parse(n.updatedAt), value: n.id });
    }
    multi.set(READY_KEY, '1');
    await multi.exec();
  },
};