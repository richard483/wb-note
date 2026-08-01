import { createClient } from "redis";
import { env } from "../config/env.ts";

export const redis = createClient({
  url: env.redisUrl
})

redis.on("error", (err) => {
  console.error("Unexpected error on redis client", err);
  process.exit(-1);
});

export async function pingRedis(): Promise<void> {
  await redis.ping();
}

export async function closeRedis(): Promise<void> {
  await redis.close();
}

export async function connectRedis(): Promise<void> {
  await redis.connect();
}

export async function disconnectRedis(): Promise<void> {
  redis.destroy();
}