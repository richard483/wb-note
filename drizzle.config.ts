import { defineConfig } from 'drizzle-kit';
import { env } from './src/config/env.ts';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/infra/schema.ts',
  out: './drizzle',
  dbCredentials: { url: env.databaseUrl ?? '' },
});