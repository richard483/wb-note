/**
 * Integration test using Node's built-in runner. Note that it never calls
 * `listen()` — `createApp()` hands back an app we can drive over a throwaway
 * ephemeral port. This is the payoff of splitting app.ts from server.ts.
 */

import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { createApp } from './app.ts';

let baseUrl: string;
let server: ReturnType<ReturnType<typeof createApp>['listen']>;

before(async () => {
  // Port 0 = let the OS pick a free one, so tests never collide with a dev server.
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

describe('GET /health', () => {
  it('reports ok', async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    assert.equal(((await res.json()) as { status: string }).status, 'ok');
  });
});

describe('notes', () => {
  it('creates, reads, updates and deletes a note', async () => {
    const created = await fetch(`${baseUrl}/api/notes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'first note', body: 'hello' }),
    });
    assert.equal(created.status, 201);
    const note = (await created.json()) as { id: string; title: string };
    assert.equal(note.title, 'first note');

    const fetched = await fetch(`${baseUrl}/api/notes/${note.id}`);
    assert.equal(fetched.status, 200);

    const updated = await fetch(`${baseUrl}/api/notes/${note.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'renamed' }),
    });
    assert.equal(updated.status, 200);
    assert.equal(((await updated.json()) as { title: string }).title, 'renamed');

    const removed = await fetch(`${baseUrl}/api/notes/${note.id}`, { method: 'DELETE' });
    assert.equal(removed.status, 204);

    const gone = await fetch(`${baseUrl}/api/notes/${note.id}`);
    assert.equal(gone.status, 404);
  });

  it('rejects a blank title with 400', async () => {
    const res = await fetch(`${baseUrl}/api/notes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: '   ', body: '' }),
    });
    assert.equal(res.status, 400);
  });

  it('404s an unknown route', async () => {
    const res = await fetch(`${baseUrl}/nope`);
    assert.equal(res.status, 404);
  });
});
