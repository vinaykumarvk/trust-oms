import { drizzle } from 'drizzle-orm/node-postgres';
import pkg from 'pg';
const { Pool } = pkg;

const connectionString = process.env.DATABASE_URL;

export const pool = connectionString
  ? new Pool({
      connectionString,
      max: process.env.NODE_ENV === 'production' ? 10 : 20,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      // Disable SSL for unix sockets (Cloud SQL proxy) and localhost; enable for remote TCP
      ssl: (connectionString.includes('localhost') || connectionString.includes('/cloudsql/') || connectionString.includes('sslmode=disable'))
        ? false
        : { rejectUnauthorized: false },
    })
  : ({ query: () => { throw new Error('DATABASE_URL not set'); }, end: async () => {} } as any);

export const db = connectionString ? drizzle(pool) : ({} as any);

export const dbReady: Promise<void> = connectionString
  ? pool.query('SELECT 1').then(() => { console.log('[DB] Connection verified'); }).catch((err: Error) => { console.error('[DB] Connection failed:', err.message); throw err; })
  : Promise.resolve();
