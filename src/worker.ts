/**
 * Standalone worker entrypoint — the flush loop as its own process.
 *
 * Use this when the API and the worker are separate Deployments, so they can be
 * scaled and resourced independently. To run the same loop inside the API
 * process instead, set EMBED_WORKER=true and start only `dist/server.js`.
 */

import { closeDatabase } from './infra/db.ts';
import { connectProducer, disconnectProducer } from './infra/kafka.ts';
import { startNoteFlushWorker, stopNoteFlushWorker } from './workers/note-flush.ts';

// The flush loop produces to the DLT, so this process needs a producer too —
// the API's connection isn't shared across processes.
await connectProducer();
await startNoteFlushWorker();

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`${signal} received, stopping consumer...`);

  try {
    await stopNoteFlushWorker();
    await disconnectProducer();
    await closeDatabase();
  } catch (err) {
    console.error('Error during shutdown:', err);
    process.exit(1);
  }

  console.log('Worker closed cleanly');
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
