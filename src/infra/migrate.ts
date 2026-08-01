import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { env } from '../config/env.ts';

const pool = new Pool({ connectionString: env.databaseUrl, max: 1 });

try {
  await migrate(drizzle(pool), { migrationsFolder: './drizzle' });
  console.log('migrations applied');
} catch (err) {
  console.error('migration failed:', err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
