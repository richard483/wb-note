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
    acks: -1,
    idempotent: true,
  }
});

export function createConsumer() {
  return kafka.consumer({
    kafkaJS: {
      groupId: env.kafkaGroupId,
      autoCommit: false,
      fromBeginning: false,
      sessionTimeout: 6000,
    }
  });
}

export async function connectProducer(): Promise<void> {
  await producer.connect();
}

export async function disconnectProducer(): Promise<void> {
  await producer.disconnect();
}