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

        // Offsets mean "next message to read", hence +1.
        const commit = () =>
          c.commitOffsets([
            { topic, partition, offset: (Number(message.offset) + 1).toString() },
          ]);

        let event: NoteEvent;
        try {
          event = JSON.parse(message.value.toString()) as NoteEvent;
        } catch (err) {
          // Genuinely unprocessable — retrying can never help, so commit past
          // it. This is the ONLY case where skipping is correct.
          console.error('skipping unparseable message', {
            topic,
            partition,
            offset: message.offset,
            err,
          });
          await commit();
          return;
        }

        try {
          if (event.type === 'note.upserted') {
            await noteDbRepository.upsert(event.note);
          } else {
            await noteDbRepository.deleteById(event.id);
          }
        } catch (err) {
          // A write failure is almost always transient or misconfiguration
          // (DB down, TLS wrong, credentials rotated) — the message is fine.
          // Committing here would silently discard a real change, so instead
          // die without committing: the pod restarts and redelivery resumes
          // from the last committed offset, losing nothing.
          console.error('database write failed, exiting to force redelivery', {
            topic,
            partition,
            offset: message.offset,
            err,
          });
          process.exit(1);
        }

        await commit();
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
