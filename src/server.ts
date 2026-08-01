import { createApp } from './app.ts';
import { env } from './config/env.ts';
import { noteCacheRepository } from './repositories/note.cache.repository.ts';
import { noteDbRepository } from './repositories/note.db.repository.ts';

const app = createApp();

if (!(await noteCacheRepository.isReady())) {
  await noteCacheRepository.rehydrate(await noteDbRepository.findAll());
}

const server = app.listen(env.port, () => {
  console.log(`[${env.nodeEnv}] listening on port ${env.port}`);
});

let shuttingDown = false;

function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`${signal} received, shutting down...`);
  server.close((err) => {
    clearInterval(sweepIdle);
    if (err) {
      console.error('Error during shutdown:', err);
      process.exit(1);
    }
    console.log('Closed cleanly');
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
