/**
 * Domain types + DTOs. Plain data only — no Express, no redis, no kafka types.
 * The Spring analogue: your entity and your request/response records.
 */

export interface Note {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

/** Shape accepted on POST /api/notes. */
export interface CreateNoteInput {
  title: string;
  body: string;
}

/** Shape accepted on PATCH /api/notes/:id — every field optional. */
export interface UpdateNoteInput {
  title?: string;
  body?: string;
}
