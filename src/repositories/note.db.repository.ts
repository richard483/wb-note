import { desc, eq, lte, sql } from 'drizzle-orm';
import { db } from '../infra/db.ts';
import { notes, type NoteRow } from '../infra/schema.ts';
import type { Note } from '../models/note.ts';

function toNote(row: NoteRow): Note {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const noteDbRepository = {
  async findAll(): Promise<Note[]> {
    const rows = await db.select().from(notes).orderBy(desc(notes.updatedAt));
    return rows.map(toNote);
  },

  async findById(id: string): Promise<Note | undefined> {
    const rows = await db.select().from(notes).where(eq(notes.id, id)).limit(1);
    return rows[0] ? toNote(rows[0]) : undefined;
  },

  async upsert(note: Note): Promise<void> {
    const row: NoteRow = {
      id: note.id,
      title: note.title,
      body: note.body,
      createdAt: new Date(note.createdAt),
      updatedAt: new Date(note.updatedAt),
    };

    await db
      .insert(notes)
      .values(row)
      .onConflictDoUpdate({
        target: notes.id,
        set: { title: row.title, body: row.body, updatedAt: row.updatedAt },
        setWhere: lte(notes.updatedAt, sql`excluded.updated_at`),
      });
  },

  async deleteById(id: string): Promise<void> {
    await db.delete(notes).where(eq(notes.id, id));
  },
};