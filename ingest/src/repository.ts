import type { StoredEvent } from "./schema.js";
import type { ClassifiableEvent, Technique } from "./attck.js";
import { FOLD_LOCK_KEY, type SqlClient, type SqlExecutor } from "./sql.js";

export interface CountRow {
  key: string;
  count: number;
}

const DAY_MS = 86_400_000;

/** Columns of `events`, in the order insertEvents binds them. */
const EVENT_COLUMNS = [
  "id",
  "sensor",
  "ts",
  "type",
  "src_ip_hash",
  "src_ip_trunc",
  "country",
  "asn",
  "asn_org",
  "session",
  "protocol",
  "username",
  "password",
  "success",
  "command",
  "url",
  "client_version",
  "duration",
  "received_at",
] as const;

/** Rows per INSERT statement — keeps us far below Postgres' 65535 bind limit. */
const INSERT_CHUNK = 100;

/**
 * The only component that speaks SQL. Every statement is parameterized;
 * event contents are never concatenated into queries.
 *
 * All aggregation is set-based: the fold runs a handful of
 * `INSERT ... SELECT ... ON CONFLICT DO UPDATE` statements rather than a
 * statement per event, because this repository now talks to a Postgres
 * server over the network where per-row round trips would dominate.
 */
export class EventRepository {
  constructor(private readonly sql: SqlClient) {}

  async insertEvents(events: StoredEvent[], receivedAt = Date.now()): Promise<number> {
    if (events.length === 0) return 0;

    let inserted = 0;
    for (let start = 0; start < events.length; start += INSERT_CHUNK) {
      const chunk = events.slice(start, start + INSERT_CHUNK);
      const params: unknown[] = [];
      const tuples = chunk.map((event) => {
        const values = [
          event.id,
          event.sensor,
          event.ts,
          event.type,
          event.src_ip_hash,
          event.src_ip_trunc,
          event.country,
          event.asn,
          event.asn_org,
          event.session,
          event.protocol,
          event.username,
          event.password,
          event.success,
          event.command,
          event.url,
          event.client_version,
          event.duration,
          receivedAt,
        ];
        const placeholders = values.map((_, i) => `$${params.length + i + 1}`);
        params.push(...values);
        return `(${placeholders.join(", ")})`;
      });

      // Duplicate ids are expected: the shipper re-sends a batch it never got
      // an acknowledgement for. DO NOTHING makes redelivery a no-op.
      const rows = await this.sql.query<{ id: string }>(
        `INSERT INTO events (${EVENT_COLUMNS.join(", ")})
         VALUES ${tuples.join(", ")}
         ON CONFLICT (id) DO NOTHING
         RETURNING id`,
        params,
      );
      inserted += rows.length;
    }
    return inserted;
  }

  async getMeta(key: string): Promise<string | null> {
    const rows = await this.sql.query<{ value: string }>("SELECT value FROM meta WHERE key = $1", [key]);
    return rows[0]?.value ?? null;
  }

  async setMeta(key: string, value: string): Promise<void> {
    await this.sql.query(
      `INSERT INTO meta (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [key, value],
    );
  }

  /**
   * Record when the sensor went live, keeping the EARLIEST timestamp ever
   * reported so a sensor reboot (or a later shipper start) doesn't reset it.
   */
  async recordSensorLive(bootMs: number): Promise<void> {
    if (!Number.isFinite(bootMs)) return;
    await keepEarliestMeta(this.sql, "sensor_live_ts", bootMs);
  }

  /** Persist the earliest event timestamp ever seen (survives retention). */
  async recordFirstEvent(tsMs: number): Promise<void> {
    if (!Number.isFinite(tsMs)) return;
    await keepEarliestMeta(this.sql, "first_event_ts", tsMs);
  }

  /**
   * Delete pseudonymized raw events older than the retention window — but
   * ONLY rows already folded into the cumulative aggregates. An event that
   * has not been folded yet is never purged, so its lifetime contribution
   * can never be lost to retention.
   */
  async deleteEventsBefore(tsMs: number): Promise<number> {
    const rows = await this.sql.query<{ id: string }>(
      "DELETE FROM events WHERE ts < $1 AND folded = TRUE RETURNING id",
      [tsMs],
    );
    return rows.length;
  }

  // ── cumulative (lifetime) aggregation ─────────────────────────────────

  async getCounter(key: string): Promise<number> {
    const rows = await this.sql.query<{ value: number }>(
      "SELECT value::float8 AS value FROM counters WHERE key = $1",
      [key],
    );
    return rows[0]?.value ?? 0;
  }

  async countDistinctSources(): Promise<number> {
    const rows = await this.sql.query<{ n: number }>("SELECT COUNT(*)::int AS n FROM distinct_sources");
    return rows[0]?.n ?? 0;
  }

  async countEvents(): Promise<number> {
    const rows = await this.sql.query<{ n: number }>("SELECT COUNT(*)::int AS n FROM events");
    return rows[0]?.n ?? 0;
  }

  /**
   * Fold every not-yet-folded event into the cumulative store exactly once:
   * lifetime scalar counters, the distinct-source set, the accumulating
   * leaderboards, the daily time series, and the earliest-event marker.
   *
   * Everything reads `folded = FALSE` and the rows are marked folded in the
   * same transaction, which makes the fold idempotent and safe against
   * retention (which only deletes folded rows). The advisory lock stops two
   * overlapping runs — a cron retry racing the original, say — from counting
   * the same events twice.
   */
  async foldNewEvents(classify: (e: ClassifiableEvent) => Technique[]): Promise<void> {
    await this.sql.transaction(async (tx) => {
      await tx.query("SELECT pg_advisory_xact_lock($1)", [FOLD_LOCK_KEY]);

      // ATT&CK classification is JS logic (regex rules over commands), so it
      // cannot be expressed as SQL. Classifying the DISTINCT behavioural
      // shapes rather than every row keeps that to a handful of iterations
      // even for a large backlog — identical commands collapse into one group.
      const combos = await tx.query<{
        type: string;
        protocol: string | null;
        success: number | null;
        command: string | null;
        n: number;
      }>(
        `SELECT type, protocol, success, command, COUNT(*)::int AS n
         FROM events WHERE folded = FALSE
         GROUP BY type, protocol, success, command`,
      );
      const techniqueCounts = new Map<string, { technique: Technique; count: number }>();
      for (const combo of combos) {
        for (const technique of classify(combo)) {
          const entry = techniqueCounts.get(technique.id);
          if (entry) entry.count += combo.n;
          else techniqueCounts.set(technique.id, { technique, count: combo.n });
        }
      }

      // Lifetime scalar counters, all five in one pass.
      await tx.query(
        `INSERT INTO counters (key, value)
         SELECT k, v FROM (
           SELECT 'total_events'         AS k, COUNT(*)::bigint AS v FROM events WHERE folded = FALSE
           UNION ALL
           SELECT 'total_login_attempts', COUNT(*)::bigint FROM events WHERE folded = FALSE AND type = 'login_attempt'
           UNION ALL
           SELECT 'successful_logins',    COUNT(*)::bigint FROM events WHERE folded = FALSE AND type = 'login_attempt' AND success = 1
           UNION ALL
           SELECT 'sessions',             COUNT(*)::bigint FROM events WHERE folded = FALSE AND type = 'session_connect'
           UNION ALL
           SELECT 'commands_entered',     COUNT(*)::bigint FROM events WHERE folded = FALSE AND type = 'command'
         ) totals
         WHERE v > 0
         ON CONFLICT (key) DO UPDATE SET value = counters.value + EXCLUDED.value`,
      );

      await tx.query(
        `INSERT INTO distinct_sources (src_ip_hash)
         SELECT DISTINCT src_ip_hash FROM events WHERE folded = FALSE
         ON CONFLICT (src_ip_hash) DO NOTHING`,
      );

      await tx.query(
        `INSERT INTO rollup_credentials (username, password, count)
         SELECT username, password, COUNT(*)::bigint FROM events
         WHERE folded = FALSE AND type = 'login_attempt'
           AND username IS NOT NULL AND password IS NOT NULL
         GROUP BY username, password
         ON CONFLICT (username, password) DO UPDATE SET count = rollup_credentials.count + EXCLUDED.count`,
      );

      await tx.query(
        `INSERT INTO rollup_usernames (username, count)
         SELECT username, COUNT(*)::bigint FROM events
         WHERE folded = FALSE AND type = 'login_attempt' AND username IS NOT NULL
         GROUP BY username
         ON CONFLICT (username) DO UPDATE SET count = rollup_usernames.count + EXCLUDED.count`,
      );

      await tx.query(
        `INSERT INTO rollup_passwords (password, count)
         SELECT password, COUNT(*)::bigint FROM events
         WHERE folded = FALSE AND type = 'login_attempt' AND password IS NOT NULL
         GROUP BY password
         ON CONFLICT (password) DO UPDATE SET count = rollup_passwords.count + EXCLUDED.count`,
      );

      // Unknown geography aggregates under "??" so the country board always
      // accounts for every login attempt, enriched or not.
      await tx.query(
        `INSERT INTO rollup_countries (country, count)
         SELECT COALESCE(country, '??'), COUNT(*)::bigint FROM events
         WHERE folded = FALSE AND type = 'login_attempt'
         GROUP BY COALESCE(country, '??')
         ON CONFLICT (country) DO UPDATE SET count = rollup_countries.count + EXCLUDED.count`,
      );

      // ASNs are counted across every event type, not just login attempts.
      await tx.query(
        `INSERT INTO rollup_asns (asn, org, count)
         SELECT asn, MAX(asn_org), COUNT(*)::bigint FROM events
         WHERE folded = FALSE AND asn IS NOT NULL
         GROUP BY asn
         ON CONFLICT (asn) DO UPDATE SET count = rollup_asns.count + EXCLUDED.count,
                                         org = COALESCE(EXCLUDED.org, rollup_asns.org)`,
      );

      await tx.query(
        `INSERT INTO rollup_clients (client, count)
         SELECT client_version, COUNT(*)::bigint FROM events
         WHERE folded = FALSE AND type = 'client_version' AND client_version IS NOT NULL
         GROUP BY client_version
         ON CONFLICT (client) DO UPDATE SET count = rollup_clients.count + EXCLUDED.count`,
      );

      await tx.query(
        `INSERT INTO rollup_commands (command, count)
         SELECT command, COUNT(*)::bigint FROM events
         WHERE folded = FALSE AND type = 'command' AND command IS NOT NULL
         GROUP BY command
         ON CONFLICT (command) DO UPDATE SET count = rollup_commands.count + EXCLUDED.count`,
      );

      // Daily buckets are cumulative: they are never recomputed from `events`,
      // so the chart keeps its history after the raw rows are purged.
      await tx.query(
        `INSERT INTO rollup_timeseries (granularity, bucket_start, count)
         SELECT 'day', (ts / ${DAY_MS}) * ${DAY_MS}, COUNT(*)::bigint FROM events
         WHERE folded = FALSE AND type = 'login_attempt'
         GROUP BY 2
         ON CONFLICT (granularity, bucket_start) DO UPDATE SET count = rollup_timeseries.count + EXCLUDED.count`,
      );

      for (const { technique, count } of techniqueCounts.values()) {
        await tx.query(
          `INSERT INTO rollup_attck (technique_id, technique, tactic, count) VALUES ($1, $2, $3, $4)
           ON CONFLICT (technique_id) DO UPDATE SET count = rollup_attck.count + EXCLUDED.count`,
          [technique.id, technique.name, technique.tactic, count],
        );
      }

      const [minRow] = await tx.query<{ min_ts: number | null }>(
        "SELECT MIN(ts)::float8 AS min_ts FROM events WHERE folded = FALSE",
      );
      if (minRow?.min_ts != null) await keepEarliestMeta(tx, "first_event_ts", minRow.min_ts);

      await tx.query("UPDATE events SET folded = TRUE WHERE folded = FALSE");
    });
  }

  /**
   * Reset the cumulative store and mark every event unfolded, so the next
   * fold rebuilds lifetime aggregates from scratch. Used once when upgrading
   * a database from the pre-cumulative scheme. Does NOT touch sensor_live_ts.
   */
  async resetCumulative(): Promise<void> {
    await this.sql.transaction(async (tx) => {
      await tx.query("SELECT pg_advisory_xact_lock($1)", [FOLD_LOCK_KEY]);
      await tx.exec(`
        TRUNCATE counters, distinct_sources, rollup_credentials, rollup_usernames,
                 rollup_passwords, rollup_countries, rollup_asns, rollup_clients,
                 rollup_commands, rollup_attck;
        DELETE FROM rollup_timeseries WHERE granularity = 'day';
        DELETE FROM meta WHERE key = 'first_event_ts';
        UPDATE events SET folded = FALSE;
      `);
    });
  }

  /** Replace only the hourly time-series buckets (recomputed each cycle). */
  async replaceHourlyTimeseries(rows: Array<[number, number]>): Promise<void> {
    await this.sql.transaction(async (tx) => {
      await tx.query("DELETE FROM rollup_timeseries WHERE granularity = 'hour'");
      for (const [bucket, count] of rows) {
        await tx.query(
          "INSERT INTO rollup_timeseries (granularity, bucket_start, count) VALUES ('hour', $1, $2)",
          [bucket, count],
        );
      }
    });
  }

  // ── reads used by the aggregation job ─────────────────────────────────

  async scalar(sql: string, ...params: unknown[]): Promise<number> {
    const rows = await this.sql.query<Record<string, unknown>>(sql, params);
    if (rows.length === 0) return 0;
    const value = Object.values(rows[0]!)[0];
    return typeof value === "number" ? value : 0;
  }

  async rows<T>(sql: string, ...params: unknown[]): Promise<T[]> {
    return this.sql.query<T>(sql, params);
  }

  // ── rollup writes ──────────────────────────────────────────────────────

  /** Atomically replace the contents of a rollup table. */
  async replaceRollup(table: string, columns: string[], rows: unknown[][]): Promise<void> {
    if (!/^rollup_[a-z]+$/.test(table)) throw new Error(`not a rollup table: ${table}`);
    if (!columns.every((c) => /^[a-z_]+$/.test(c))) throw new Error(`bad column name in ${columns.join(",")}`);
    await this.sql.transaction(async (tx) => {
      await tx.query(`DELETE FROM ${table}`);
      for (const row of rows) {
        const placeholders = row.map((_, i) => `$${i + 1}`);
        await tx.query(`INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders.join(", ")})`, row);
      }
    });
  }
}

/**
 * Write a numeric meta value only if it is earlier than what is stored.
 * Used for both "when did the sensor go live" and "when did the first event
 * arrive": a reboot or a late shipper start must never push these forward.
 */
async function keepEarliestMeta(sql: SqlExecutor, key: string, valueMs: number): Promise<void> {
  await sql.query(
    `INSERT INTO meta (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
     WHERE meta.value ~ '^[0-9]+$' AND EXCLUDED.value::bigint < meta.value::bigint`,
    [key, String(Math.floor(valueMs))],
  );
}
