import { createApp } from './app.ts';
import { env } from './config/env.ts';
import { closeDatabase } from './infra/db.ts';
import { connectProducer, disconnectProducer } from './infra/kafka.ts';
import { closeRedis, connectRedis } from './infra/redis.ts';
import { noteCacheRepository } from './repositories/note.cache.repository.ts';
import { noteDbRepository } from './repositories/note.db.repository.ts';
import { startNoteFlushWorker, stopNoteFlushWorker } from './workers/note-flush.ts';

const app = createApp();

await connectRedis();
await connectProducer();

if (!(await noteCacheRepository.isReady())) {
  console.log('Cache not ready, rehydrating from database...');
  await noteCacheRepository.rehydrate(await noteDbRepository.findAll());
}

// Single-pod deployment: run the flush consumer here instead of as its own
// Deployment. Left off by default — separate processes scale independently and
// a crash in one doesn't take the other with it.
if (env.embedWorker) {
  await startNoteFlushWorker();
}

const server = app.listen(env.port, () => {
  console.log(`[${env.nodeEnv}] listening on port ${env.port}`);
});

let shuttingDown = false;

function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`${signal} received, shutting down...`);

  server.close(async (err) => {
    clearInterval(sweepIdle);
    if (err) {
      console.error('Error during shutdown:', err);
      process.exit(1);
    }

    try {
      // Stop consuming first: leaving the group cleanly while Postgres is still
      // reachable lets the in-flight batch finish and commit.
      await stopNoteFlushWorker();
      await disconnectProducer();
      await closeRedis();
      await closeDatabase();
    } catch (err) {
      console.error('Error during shutdown:', err);
      process.exit(1);
    }

    console.log('Shutdown graciously completed, exiting.');
    process.exit(0);
  });
  server.closeIdleConnections();
  const sweepIdle = setInterval(() => server.closeIdleConnections(), 250);

  const forceExit = setTimeout(() => {
    console.error('Shutdown timed out, forcing remaining connections closed');
    server.closeAllConnections();
    process.exit(1);
  }, env.shutdownTimeoutMs);

  sweepIdle.unref();
  forceExit.unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
  shutdown('unhandledRejection');
});
