/**
 * The write-back flush loop: consume note events, apply them to Postgres.
 *
 * Deliberately a module rather than a script, so it can run either as its own
 * process (`src/worker.ts`) or inside the API process (`EMBED_WORKER=true`).
 * The logic is identical; only the lifecycle owner differs.
 */

import { env } from '../config/env.ts';
import { createConsumer } from '../infra/kafka.ts';
import { noteDbRepository } from '../repositories/note.db.repository.ts';
import type { NoteEvent } from '../repositories/note.repository.ts';

type Consumer = ReturnType<typeof createConsumer>;

let consumer: Consumer | null = null;

export async function startNoteFlushWorker(): Promise<void> {
  if (consumer) return; // idempotent — embedding must not double-subscribe

  const c = createConsumer();
  consumer = c;

  try {
    await c.connect();
    await c.subscribe({ topics: [env.kafkaTopic] });

    await c.run({
      eachMessage: async ({ topic, partition, message }) => {
        if (!message.value) return;

        try {
          const event = JSON.parse(message.value.toString()) as NoteEvent;

          if (event.type === 'note.upserted') {
            await noteDbRepository.upsert(event.note);
          } else {
            await noteDbRepository.deleteById(event.id);
          }
        } catch (err) {
          // Skip poison messages: without this, a message that always throws
          // never commits and redelivers forever. Note this also swallows
          // transient DB outages — revisit with a dead-letter topic.
          console.error('failed to process message, skipping:', err);
        }

        // Offsets mean "next message to read", hence +1. Committed only after
        // the write, so a crash replays rather than loses.
        await c.commitOffsets([
          { topic, partition, offset: (Number(message.offset) + 1).toString() },
        ]);
      },
    });

    console.log(`note-flush worker consuming '${env.kafkaTopic}'`);
  } catch (err) {
    consumer = null; // failed to start — allow a retry
    throw err;
  }
}

export async function stopNoteFlushWorker(): Promise<void> {
  if (!consumer) return;

  const c = consumer;
  consumer = null;
  // disconnect() leaves the consumer group cleanly, triggering a prompt
  // rebalance instead of waiting for the session to time out.
  await c.disconnect();
}
