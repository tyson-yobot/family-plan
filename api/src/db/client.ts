import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error('DATABASE_URL is not set.');
}

const queryClient = postgres(url, { max: 5 });

export const db = drizzle(queryClient, { schema });
export { queryClient };
