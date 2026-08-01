import { KafkaJS } from "@confluentinc/kafka-javascript";
import { env } from "../config/env.ts";

const { Kafka } = KafkaJS;

const kafka = new Kafka({
  kafkaJS: {
    brokers: env.kafkaBrokers,
    clientId: 'notes-flush-worker',
  }
});

export const producer = kafka.producer({
  kafkaJS: {
    acks: -1, // Wait for all in-sync replicas to acknowledge the message
    idempotent: true, // Enable idempotent producer to avoid duplicate messages
  }
});

export function createConsumer() {
  return kafka.consumer({
    kafkaJS: {
      groupId: env.kafkaGroupId,
      autoCommit: false, // Disable auto-commit to control when offsets are committed
      fromBeginning: false, // Start consuming from the latest offset
      sessionTimeout: 30000, // Set session timeout to 30 seconds
    }
  });
}

export async function connectProducer(): Promise<void> {
  await producer.connect();
}

export async function disconnectProducer(): Promise<void> {
  await producer.disconnect();
}