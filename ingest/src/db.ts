import type { SqlClient } from "./sql.js";

/**
 * Schema for the ingest datastore (Postgres).
 *
 * Two kinds of table live here:
 *   - events: raw (already pseudonymized) telemetry, retention-limited
 *   - rollup_*: pre-aggregated, anonymous tables — the ONLY thing the
 *     public site is allowed to read.
 *
 * Plus the cumulative store (counters, distinct_sources) that lets lifetime
 * totals survive the retention purge; see repository.foldNewEvents.
 *
 * `ts` and `received_at` are epoch milliseconds and so must be BIGINT. Reads
 * cast them back to float8 — see the numeric-types note in sql.ts.
 */

const MIGRATIONS = `
CREATE TABLE IF NOT EXISTS events (
  id             TEXT PRIMARY KEY,
  sensor         TEXT NOT NULL,
  ts             BIGINT NOT NULL,
  type           TEXT NOT NULL,
  src_ip_hash    TEXT NOT NULL,
  src_ip_trunc   TEXT NOT NULL,
  country        TEXT,
  asn            BIGINT,
  asn_org        TEXT,
  session        TEXT,
  protocol       TEXT,
  username       TEXT,
  password       TEXT,
  success        SMALLINT,
  command        TEXT,
  url            TEXT,
  client_version TEXT,
  duration       DOUBLE PRECISION,
  received_at    BIGINT NOT NULL,
  -- FALSE until this event's contribution has been folded into the cumulative
  -- rollups. Retention only ever deletes folded rows, so lifetime aggregates
  -- never lose an event to the raw-event purge.
  folded         BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_events_ts       ON events (ts);
CREATE INDEX IF NOT EXISTS idx_events_type_ts  ON events (type, ts);
CREATE INDEX IF NOT EXISTS idx_events_unfolded ON events (folded) WHERE folded = FALSE;

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Persistent cumulative scalar counters (lifetime totals). Never reset by
-- retention; each event increments them exactly once via the fold.
CREATE TABLE IF NOT EXISTS counters (
  key   TEXT PRIMARY KEY,
  value BIGINT NOT NULL DEFAULT 0
);

-- Lifetime distinct-source set. Holds ONLY the keyed HMAC pseudonym (no IP,
-- no timestamp, no other field) so unique sources can be counted over the
-- full history without keeping raw events. Non-reversible; see
-- docs/DATA-HANDLING.md.
CREATE TABLE IF NOT EXISTS distinct_sources (
  src_ip_hash TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS rollup_totals (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS rollup_timeseries (
  granularity  TEXT   NOT NULL,
  bucket_start BIGINT NOT NULL,
  count        BIGINT NOT NULL,
  PRIMARY KEY (granularity, bucket_start)
);
CREATE TABLE IF NOT EXISTS rollup_credentials (
  username TEXT   NOT NULL,
  password TEXT   NOT NULL,
  count    BIGINT NOT NULL,
  PRIMARY KEY (username, password)
);
CREATE TABLE IF NOT EXISTS rollup_usernames (
  username TEXT PRIMARY KEY,
  count    BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS rollup_passwords (
  password TEXT PRIMARY KEY,
  count    BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS rollup_countries (
  country TEXT PRIMARY KEY,
  count   BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS rollup_asns (
  asn   BIGINT PRIMARY KEY,
  org   TEXT,
  count BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS rollup_clients (
  client TEXT PRIMARY KEY,
  count  BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS rollup_commands (
  command TEXT PRIMARY KEY,
  count   BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS rollup_attck (
  technique_id TEXT PRIMARY KEY,
  technique    TEXT   NOT NULL,
  tactic       TEXT   NOT NULL,
  count        BIGINT NOT NULL
);
`;

/**
 * Create every table and index if missing. Safe to run on every cold start.
 *
 * The advisory lock is not optional: concurrent `CREATE TABLE IF NOT EXISTS`
 * from two connections races inside Postgres' catalog and one side fails with
 * a duplicate-key error on pg_type. Serverless invocations start in parallel
 * all the time, so the lock is the difference between a clean cold start and
 * a random 500 on deploy.
 */
export async function migrate(sql: SqlClient): Promise<void> {
  await sql.transaction(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock($1)", [MIGRATE_LOCK_KEY]);
    await tx.exec(MIGRATIONS);
  });
}

const MIGRATE_LOCK_KEY = 0x68756e6d; // "hunm"
