import { Pool } from "pg";
import { env } from "../config/env.ts";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema.ts";

export const pool = new Pool({
  connectionString: env.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on("error", (err) => {
  console.error("Unexpected error on pg pool", err);
});

export const db = drizzle(pool, { schema });

export async function pingDatabase(): Promise<void> {
  await pool.query("SELECT 1");
}

export async function closeDatabase(): Promise<void> {
  await pool.end();
}