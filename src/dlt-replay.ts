/**
 * One-shot DLT replay: drains the dead-letter topic back onto the main topic,
 * so each event re-enters the normal flush path at attempt 1.
 *
 *   npm run dlt:replay          (or: node dist/dlt-replay.js)
 *
 * Deliberately NOT a long-running service. If a replayed event fails again it
 * returns to the DLT, and an always-on replayer would spin that loop forever.
 * Manual invocation keeps a human in the decision.
 *
 * It exits once the DLT has been quiet for DLT_REPLAY_IDLE_MS, and uses its own
 * consumer group so it never disturbs the flush worker's offsets.
 */

import { KafkaJS } from '@confluentinc/kafka-javascript';
import { env } from './config/env.ts';
import { connectProducer, disconnectProducer, producer } from './infra/kafka.ts';
import type { DltEnvelope } from './workers/note-flush.ts';

const { Kafka } = KafkaJS;

const kafka = new Kafka({
  kafkaJS: { brokers: env.kafkaBrokers, clientId: 'wb-note-dlt-replay' },
});

const consumer = kafka.consumer({
  kafkaJS: {
    groupId: env.kafkaDltGroupId,
    autoCommit: false,
    // Replay must see everything already sitting in the DLT, not just what
    // arrives from now on — the opposite of the flush worker's setting.
    fromBeginning: true,
    sessionTimeout: 6_000,
  },
});

let replayed = 0;
let skipped = 0;
let lastMessageAt = Date.now();

await connectProducer();
await consumer.connect();
await consumer.subscribe({ topics: [env.kafkaDltTopic] });

console.log(`draining '${env.kafkaDltTopic}' → '${env.kafkaTopic}'`);

await consumer.run({
  eachMessage: async ({ topic, partition, message }) => {
    lastMessageAt = Date.now();
    if (!message.value) return;

    const commit = () =>
      consumer.commitOffsets([
        { topic, partition, offset: (Number(message.offset) + 1).toString() },
      ]);

    let envelope: DltEnvelope;
    try {
      envelope = JSON.parse(message.value.toString()) as DltEnvelope;
    } catch (err) {
      console.error('DLT entry is itself unparseable, skipping', { offset: message.offset, err });
      skipped++;
      await commit();
      return;
    }

    // Entries recorded from unparseable input carry no usable event.
    if (!envelope.event || typeof envelope.event.type !== 'string') {
      console.error('DLT entry has no replayable event, skipping', { offset: message.offset });
      skipped++;
      await commit();
      return;
    }

    const key =
      envelope.event.type === 'note.upserted' ? envelope.event.note.id : envelope.event.id;

    // Keyed by note id so republished events keep per-note ordering, exactly as
    // the original producer did.
    await producer.send({
      topic: env.kafkaTopic,
      messages: [{ key, value: JSON.stringify(envelope.event) }],
    });

    // Commit only after the republish succeeded: a crash in between replays the
    // entry again, which the upsert/delete guards make harmless.
    await commit();
    replayed++;
    console.log(`replayed ${envelope.event.type} (originally failed: ${envelope.error?.message})`);
  },
});

// Poll for quiet rather than tracking watermarks — simpler, and a replay that
// runs a few seconds long costs nothing.
while (Date.now() - lastMessageAt < env.dltReplayIdleMs) {
  await new Promise((r) => setTimeout(r, 250));
}

console.log(`done — replayed ${replayed}, skipped ${skipped}`);

await consumer.disconnect();
await disconnectProducer();
process.exit(0);
