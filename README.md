# wb-note

A simple note-taking app implementing a write-back cache mechanism with Redis and Kafka.

## Requirements

- Node.js >= 22 — the dev server, tests and watch mode all rely on Node's
  built-in TypeScript type-stripping, so no compile step is needed to run.

## Getting started

```bash
npm install
cp .env.example .env
npm run dev
```

The server listens on `http://localhost:3000`. Check it with `curl localhost:3000/health`.

## Scripts

| Script              | Purpose                                         |
| ------------------- | ----------------------------------------------- |
| `npm run dev`       | `node --watch`, restarts on change              |
| `npm run build`     | Compile to `dist/` (test files excluded)        |
| `npm start`         | Run the compiled build — production entrypoint  |
| `npm run typecheck` | Type-check everything, including tests, no emit |
| `npm test`          | Node's built-in test runner                     |

Note that `dev` and `test` only *strip* types, they don't check them — run
`npm run typecheck` (or rely on your editor) to catch type errors.

## Formatting

There is no linter or formatter dependency. [.prettierrc.json](.prettierrc.json)
is kept purely so the Prettier VS Code extension formats to a consistent style;
it costs nothing at install time. Delete it if you don't use that extension.

## Docker

```bash
docker build -t wb-note .
docker run --rm -p 3000:3000 --name wb-note wb-note
```

Multi-stage: dev dependencies and `src/` stay in the build stages, so the final
image carries only `dist/`, production `node_modules`, and `package.json`. It
runs as the non-root `node` user.

### Shutdown

`CMD` is **exec form**, so `node` is PID 1 and receives `SIGTERM` from
`docker stop` directly. Two things would break this:

- Shell form (`CMD node dist/server.js`) — runs under `/bin/sh -c`, and `sh`
  does not forward signals to its child.
- `CMD ["npm", "start"]` — npm is another process in the way that doesn't
  reliably forward signals either.

Either way `docker stop` would stall for the whole grace period and then
`SIGKILL` the app mid-request.

PID 1 also gets no default signal handlers from the kernel, so the explicit
`process.on('SIGTERM', ...)` in [src/server.ts](src/server.ts) is what makes the
container stoppable at all — without it the process would simply ignore the
signal.

Note that `docker stop` defaults to a 10s grace period and `SHUTDOWN_TIMEOUT_MS`
also defaults to 10s, so they expire together. Give the app the smaller number:

```bash
docker run -e SHUTDOWN_TIMEOUT_MS=5000 -p 3000:3000 wb-note
docker stop wb-note          # or: docker stop -t 30 wb-note
```

## Structure

```
src/
  server.ts        entrypoint — owns the port and process lifecycle
  app.ts           builds the Express app; binds nothing (keeps it testable)
  config/          validated env access — the only place reading process.env
  routes/          path → handler mapping
  controllers/     HTTP in/out, request parsing
  services/        business logic
  repositories/    storage access
  middlewares/     404 + terminal error handler
  models/          domain types and DTOs
  errors/          HTTP-aware error classes
```

Dependencies flow one way: `routes → controllers → services → repositories`.

The rule that keeps this honest: **`Request`/`Response` types never appear below
the controller layer.** Services take plain arguments and return plain data, so
they can be tested without booting Express.

## API

| Method   | Path             | Notes                     |
| -------- | ---------------- | ------------------------- |
| `GET`    | `/health`        | Liveness check            |
| `GET`    | `/api/notes`     | List all notes            |
| `POST`   | `/api/notes`     | Body: `{ title, body }`   |
| `GET`    | `/api/notes/:id` |                           |
| `PATCH`  | `/api/notes/:id` | Body: `{ title?, body? }` |
| `DELETE` | `/api/notes/:id` | Returns `204`             |

## Status

The repository layer is currently an in-memory `Map`, standing in for the real
Redis write-back cache and Kafka flush pipeline. Swapping it out should not
require changes above `src/repositories/`.
