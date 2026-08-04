import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import { config } from './config';

// pg now reads `sslmode` from the connection string and treats `require` as
// `verify-full`, which rejects the pooler's certificate chain. The explicit
// `ssl` option below is the one source of truth, so the query parameter is
// dropped rather than left to fight with it.
function stripSslMode(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete('sslmode');
    return parsed.toString();
  } catch {
    return url;
  }
}

export const pool = new Pool({
  connectionString: stripSslMode(config.database.url),
  // Supplying DATABASE_CA_CERT turns on full verification. Without it the
  // connection is still encrypted but the chain is not verified — acceptable
  // for a managed provider reached over its own network, not ideal.
  ssl: config.database.ssl
    ? config.database.caCert
      ? { ca: config.database.caCert, rejectUnauthorized: true }
      : { rejectUnauthorized: false }
    : false,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

/**
 * All SQL in this codebase goes through here with placeholder parameters.
 * Nothing builds SQL by string concatenation of user input.
 */
export async function query<T extends QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await pool.query<T>(text, params as never[]);
  return result.rows;
}

export async function queryOne<T extends QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
