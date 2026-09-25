import { PGlite } from "@electric-sql/pglite";
import type { Row, SqlClient, SqlExecutor } from "../../src/sql.js";
import { migrate } from "../../src/db.js";
import { EventRepository } from "../../src/repository.js";

/**
 * SqlClient backed by PGlite — genuine Postgres compiled to WebAssembly,
 * running in-memory.
 *
 * This matters more than a convenience: the production dialect is Postgres,
 * and a test double speaking a different SQL dialect would let `ON CONFLICT`
 * clauses, bigint-to-string coercion and advisory locks all pass here and
 * fail in production. Every test therefore exercises the same statements
 * production Postgres will run, with no container to start.
 */
export function createPgliteClient(): SqlClient {
  const db = new PGlite();

  const asExecutor = (target: {
    query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
    exec: (sql: string) => Promise<unknown>;
  }): SqlExecutor => ({
    async query<T = Row>(text: string, params: unknown[] = []): Promise<T[]> {
      const result = await target.query(text, params);
      return result.rows as T[];
    },
    async exec(script: string): Promise<void> {
      await target.exec(script);
    },
  });

  const base = asExecutor(db);

  return {
    query: base.query,
    exec: base.exec,
    async transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T> {
      const out = await db.transaction(async (tx) => fn(asExecutor(tx)));
      return out as T;
    },
    async close() {
      await db.close();
    },
  };
}

/** A migrated, empty datastore plus its repository — the usual test fixture. */
export async function freshRepo(): Promise<{ sql: SqlClient; repo: EventRepository }> {
  const sql = createPgliteClient();
  await migrate(sql);
  return { sql, repo: new EventRepository(sql) };
}
