import { env } from "./config/env.ts";
import { closeDatabase } from "./infra/db.ts";
import { createConsumer } from "./infra/kafka.ts";
import { noteDbRepository } from "./repositories/note.db.repository.ts";
import type { NoteEvent } from "./repositories/note.repository.ts";

const consumer = createConsumer();

await consumer.connect();
await consumer.subscribe({ topics: [env.kafkaTopic] });

await consumer.run({
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
      console.error('failed to prcess message, skipping:', err);
    }

    await consumer.commitOffsets([{ topic, partition, offset: (Number(message.offset) + 1).toString() }]);
  }
})

async function shutdown(signal: string) {
  console.log(`${signal} received, stopping consumer...`);
  await consumer.disconnect();   // leaves the group cleanly
  await closeDatabase();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));