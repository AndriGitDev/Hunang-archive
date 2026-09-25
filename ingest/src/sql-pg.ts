import pg from "pg";
import type { Row, SqlClient, SqlExecutor } from "./sql.js";

/**
 * node-postgres implementation of SqlClient.
 *
 * Used against private Postgres in production and a plain Postgres container
 * in the local demo. The default pool is deliberately small; callers can
 * raise it for the long-running service without wasting backend slots.
 *
 * The int8 parser below is a safety net, not the primary mechanism — queries
 * cast bigint columns explicitly (see sql.ts) so the PGlite-backed tests get
 * identical results. Every bigint this schema stores is an epoch millisecond
 * or a count, both far inside Number's safe integer range.
 */
pg.types.setTypeParser(pg.types.builtins.INT8, (v: string) => Number(v));

export interface PgClientOptions {
  connectionString: string;
  /** Max pooled connections. One is right for a serverless invocation. */
  max?: number;
  /** Public managed Postgres commonly requires TLS; private containers may not. */
  ssl?: boolean;
}

export function createPgClient(options: PgClientOptions): SqlClient {
  const pool = new pg.Pool({
    connectionString: options.connectionString,
    max: options.max ?? 1,
    // Public managed Postgres presents a valid certificate; local/private
    // containers may not use TLS. `sslmode` in the URL wins when set.
    ssl: options.ssl ? { rejectUnauthorized: true } : undefined,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });

  const query = async <T = Row>(text: string, params: unknown[] = []): Promise<T[]> => {
    const result = await pool.query(text, params);
    return result.rows as T[];
  };

  return {
    query,
    async exec(script: string): Promise<void> {
      // No parameters => node-postgres uses the simple query protocol, which
      // accepts a multi-statement script.
      await pool.query(script);
    },
    async transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T> {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const out = await fn({
          query: async <T2 = Row>(text: string, params: unknown[] = []) =>
            (await client.query(text, params)).rows as T2[],
          exec: async (script: string) => {
            await client.query(script);
          },
        });
        await client.query("COMMIT");
        return out;
      } catch (err) {
        try {
          await client.query("ROLLBACK");
        } catch {
          // the connection is already broken; releasing it below discards it
        }
        throw err;
      } finally {
        client.release();
      }
    },
    async close() {
      await pool.end();
    },
  };
}
