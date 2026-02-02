import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";

const { Pool } = pg;

// FORCE NEON ONLY - Neutralize any system-set PG vars to prevent implicit connections
delete process.env.PGHOST;
delete process.env.PGDATABASE;
delete process.env.PGUSER;
delete process.env.PGPASSWORD;
delete process.env.PGPORT;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "FATAL: DATABASE_URL must be set. This app requires Neon database connection."
  );
}

// Validate DATABASE_URL points to Neon
const cleanConnectionString = process.env.DATABASE_URL
  .replace(/^['"]|['"]$/g, '')
  .replace(/&amp;/g, '&');

if (!cleanConnectionString.includes('neon.tech')) {
  throw new Error(
    "FATAL: DATABASE_URL must point to Neon (*.neon.tech). Other databases not allowed."
  );
}

export const pool = new Pool({ 
  connectionString: cleanConnectionString,
  ssl: { rejectUnauthorized: false }
});
export const db = drizzle(pool, { schema });