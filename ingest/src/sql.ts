/**
 * The narrow database interface everything above this file talks to.
 *
 * Two implementations exist: `sql-pg.ts` (node-postgres, used against private
 * Postgres in production and a local container in the demo) and the PGlite
 * adapter in `test/helpers/pglite.ts` (real Postgres compiled to WASM, so the
 * tests exercise the same dialect production runs). Nothing else in the
 * codebase imports a driver.
 *
 * NUMERIC TYPES — IMPORTANT: node-postgres returns `bigint` and `numeric`
 * columns as JavaScript *strings*, because they can exceed Number's safe
 * range. Every value we read is either an epoch-millisecond timestamp or a
 * count, both comfortably inside 2^53, so all queries in this codebase cast
 * such columns explicitly (`COUNT(*)::int`, `ts::float8`) rather than relying
 * on driver-level type parsers, which PGlite does not configure the same way.
 * A stringified count would silently reach the dashboard JSON as `"42"`.
 */

export type Row = Record<string, unknown>;

/** Anything that can run a query — a pool, a client, or a transaction. */
export interface SqlExecutor {
  /** A single, parameterized statement. */
  query<T = Row>(text: string, params?: unknown[]): Promise<T[]>;
  /**
   * A script of one or more statements, with no parameters. Separate from
   * query() because the extended protocol that carries bind parameters
   * accepts exactly one statement — passing a multi-statement string to
   * query() fails outright on PGlite and silently on some drivers. Only ever
   * call this with SQL literals from this codebase, never anything derived
   * from a request.
   */
  exec(script: string): Promise<void>;
}

export interface SqlClient extends SqlExecutor {
  /**
   * Run `fn` inside a single transaction on one dedicated connection.
   * Commits on return, rolls back if `fn` throws.
   */
  transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/**
 * Advisory-lock key that serializes the cumulative fold. The fold reads
 * `WHERE folded = FALSE`, writes aggregates, then marks those rows folded;
 * two overlapping runs (a cron invocation racing a retry, say) would double
 * count. Postgres advisory locks are transaction-scoped, so the lock is
 * released with the commit or rollback.
 */
export const FOLD_LOCK_KEY = 0x68756e67; // "hung"
