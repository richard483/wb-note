/**
 * The write-back flush loop: consume note events, apply them to Postgres.
 *
 * Deliberately a module rather than a script, so it can run either as its own
 * process (`src/worker.ts`) or inside the API process (`EMBED_WORKER=true`).
 * The logic is identical; only the lifecycle owner differs.
 *
 * Failure policy — three distinct outcomes, because conflating them is how
 * write-back systems lose data:
 *
 *   unparseable JSON  → straight to the DLT. Retrying can never help.
 *   message-specific  → retry with backoff, then DLT. Bad data, one message.
 *   infrastructure    → retry with backoff, then EXIT WITHOUT COMMITTING.
 *
 * That last case matters most. A dead database fails every message, so DLT-ing
 * on infrastructure errors would quietly drain the whole topic into the DLT.
 * Exiting instead leaves the offset uncommitted: the pod restarts and redelivers.
 */

import { env } from '../config/env.ts';
import { createConsumer, producer } from '../infra/kafka.ts';
import { noteDbRepository } from '../repositories/note.db.repository.ts';
import type { NoteEvent } from '../repositories/note.repository.ts';

type Consumer = ReturnType<typeof createConsumer>;

let consumer: Consumer | null = null;

/** Envelope written to the DLT. Carries enough context to diagnose and replay. */
export interface DltEnvelope {
  event: NoteEvent;
  failedAt: string;
  attempts: number;
  error: { message: string; code?: string };
  origin: { topic: string; partition: number; offset: string };
}

/**
 * Postgres SQLSTATE classes that mean "the server or connection is unhealthy",
 * as opposed to "this row is bad". Retrying a different message won't help, so
 * these must never route to the DLT.
 *
 *   08 connection exception      28 invalid authorization (the TLS failure)
 *   53 insufficient resources    57 operator intervention (shutdown)
 *   3D invalid catalog           58 system error
 */
const INFRA_SQLSTATE_CLASSES = new Set(['08', '28', '53', '57', '3D', '58', 'XX']);

/** Node errno codes (ECONNREFUSED, EPIPE, EAI_AGAIN…). No SQLSTATE class starts with E. */
const NODE_ERRNO = /^E[A-Z_]+$/;
/** SQLSTATE is five alphanumeric chars — `22P02`, `57P01`, not just digits. */
const SQLSTATE = /^[0-9A-Z]{5}$/;

export function isInfrastructureError(err: unknown): boolean {
  const code = (err as { code?: unknown })?.code;

  if (typeof code === 'string') {
    // Socket-level failure: always infrastructure.
    if (NODE_ERRNO.test(code)) return true;
    // Otherwise the SQLSTATE class decides.
    if (SQLSTATE.test(code)) return INFRA_SQLSTATE_CLASSES.has(code.slice(0, 2));
  }

  // Drizzle wraps the driver error; unwrap one level before giving up.
  const cause = (err as { cause?: unknown })?.cause;
  if (cause && cause !== err) return isInfrastructureError(cause);

  // Unknown shape: treat as infrastructure. Failing loudly beats silently
  // discarding a change we don't understand.
  return true;
}

function errorInfo(err: unknown): { message: string; code?: string } {
  const e = err as { message?: string; code?: unknown; cause?: unknown };
  const code = typeof e?.code === 'string' ? e.code : undefined;
  if (code) return { message: String(e.message ?? err), code };
  if (e?.cause && e.cause !== err) return errorInfo(e.cause);
  return { message: String(e?.message ?? err) };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function applyEvent(event: NoteEvent): Promise<void> {
  if (event.type === 'note.upserted') {
    await noteDbRepository.upsert(event.note);
  } else {
    await noteDbRepository.deleteById(event.id, event.occurredAt);
  }
}

async function sendToDlt(envelope: DltEnvelope, key: string): Promise<void> {
  await producer.send({
    topic: env.kafkaDltTopic,
    // Same key as the original, so replayed events keep per-note ordering.
    messages: [{ key, value: JSON.stringify(envelope) }],
  });
}

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

        const origin = { topic, partition, offset: message.offset };
        // Offsets mean "next message to read", hence +1.
        const commit = () =>
          c.commitOffsets([
            { topic, partition, offset: (Number(message.offset) + 1).toString() },
          ]);
        const key = message.key?.toString() ?? '';

        let event: NoteEvent;
        try {
          event = JSON.parse(message.value.toString()) as NoteEvent;
        } catch (err) {
          console.error('unparseable message → DLT', { ...origin, err });
          await sendToDlt(
            {
              event: { type: 'note.upserted', note: null as never },
              failedAt: new Date().toISOString(),
              attempts: 0,
              error: { message: `unparseable: ${String(err)}` },
              origin,
            },
            key,
          );
          await commit();
          return;
        }

        let lastError: unknown;
        for (let attempt = 1; attempt <= env.flushMaxAttempts; attempt++) {
          try {
            await applyEvent(event);
            await commit();
            if (attempt > 1) console.log(`recovered on attempt ${attempt}`, origin);
            return;
          } catch (err) {
            lastError = err;
            if (attempt < env.flushMaxAttempts) {
              const delay = env.flushRetryBaseMs * 2 ** (attempt - 1);
              console.warn(
                `attempt ${attempt}/${env.flushMaxAttempts} failed, retrying in ${delay}ms`,
                { ...origin, error: errorInfo(err).message },
              );
              await sleep(delay);
            }
          }
        }

        if (isInfrastructureError(lastError)) {
          // Do NOT commit and do NOT DLT: the message is fine, the world isn't.
          console.error(
            'infrastructure failure after retries — exiting without committing so the message is redelivered',
            { ...origin, error: errorInfo(lastError) },
          );
          process.exit(1);
        }

        console.error('message-specific failure after retries → DLT', {
          ...origin,
          error: errorInfo(lastError),
        });
        await sendToDlt(
          {
            event,
            failedAt: new Date().toISOString(),
            attempts: env.flushMaxAttempts,
            error: errorInfo(lastError),
            origin,
          },
          key,
        );
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
