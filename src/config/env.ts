/**
 * Central, validated access to environment variables.
 * Nothing else in the app should read `process.env` directly — import from here
 * so a missing or invalid var fails loudly at boot instead of at first request.
 */

type NodeEnv = 'development' | 'production' | 'test';

/** For vars with no sensible default — throws at boot if absent. */
export function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function str(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

function int(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(
      `Environment variable ${name} must be an integer between ${min} and ${max}, got: ${raw}`,
    );
  }
  return parsed;
}

function bool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  throw new Error(`Environment variable ${name} must be true/false, got: ${raw}`);
}

const nodeEnv = str('NODE_ENV', 'development') as NodeEnv;

export const env = {
  nodeEnv,
  isProduction: nodeEnv === 'production',
  port: int('PORT', 3000, 1, 65535),
  shutdownTimeoutMs: int('SHUTDOWN_TIMEOUT_MS', 10_000, 0, 120_000),

  databaseUrl: required('DATABASE_URL'),
  /** TLS to Postgres. Only turn off for a local, non-TLS database. */
  databaseSsl: bool('DATABASE_SSL', true),
  redisUrl: required('REDIS_URL'),
  kafkaBrokers: required('KAFKA_BROKERS').split(','),
  kafkaTopic: str('KAFKA_TOPIC', 'notes-event'),
  kafkaGroupId: str('KAFKA_GROUP_ID', 'notes-flush-worker'),
  embedWorker: bool('EMBED_WORKER', true),

} as const;

export type Env = typeof env;
