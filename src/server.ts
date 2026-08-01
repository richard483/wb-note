/**
 * Process entrypoint — the `main()`. Owns the socket and the process lifecycle.
 */

import { createApp } from './app.ts';
import { env } from './config/env.ts';

const app = createApp();

const server = app.listen(env.port, () => {
  console.log(`[${env.nodeEnv}] listening on port ${env.port}`);
});

let shuttingDown = false;

/**
 * Graceful shutdown. Matters more than usual here: once redis is the write-back
 * cache, an abrupt exit drops notes that were never flushed to the store.
 *
 * Under Docker/Kubernetes this runs as PID 1. PID 1 gets *no* default signal
 * handlers from the kernel, so without the explicit `process.on` calls below the
 * process would ignore SIGTERM entirely and be SIGKILLed after the grace period.
 */
function shutdown(signal: string): void {
  // A second SIGTERM (or an impatient `docker stop`) must not restart the clock.
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`${signal} received, shutting down...`);

  // Stop accepting new connections. Existing in-flight requests still finish,
  // and the callback fires only once every socket is gone.
  server.close((err) => {
    clearInterval(sweepIdle);
    if (err) {
      console.error('Error during shutdown:', err);
      process.exit(1);
    }
    // Flush redis / disconnect kafka here before exiting.
    console.log('Closed cleanly');
    process.exit(0);
  });

  // `close()` drops sockets that are *already* idle, but not ones that go idle
  // later — a keep-alive client whose in-flight request has just finished parks
  // its socket and holds the server open until keepAliveTimeout. So sweep
  // repeatedly rather than once, or a graceful stop turns into a timeout.
  server.closeIdleConnections();
  const sweepIdle = setInterval(() => server.closeIdleConnections(), 250);

  const forceExit = setTimeout(() => {
    console.error('Shutdown timed out, forcing remaining connections closed');
    server.closeAllConnections();
    process.exit(1);
  }, env.shutdownTimeoutMs);

  // Neither timer should hold the event loop open on its own.
  sweepIdle.unref();
  forceExit.unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
  shutdown('unhandledRejection');
});
