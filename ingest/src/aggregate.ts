import type { EventRepository } from "./repository.js";
import { classify } from "./attck.js";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/**
 * Refresh every rollup the public site reads. Runs on a timer in the
 * long-running ingest service. Two kinds of aggregate live here:
 *
 *  - LIFETIME (cumulative): totals, unique sources, the leaderboards, and the
 *    daily time series. Each event is folded into these exactly once and they
 *    are never recomputed from the (retention-limited) events table, so they
 *    survive the raw-event purge and keep growing for the life of the sensor.
 *    See EventRepository.foldNewEvents.
 *  - WINDOWED: the last-24h count and the 48-hour hourly chart. These are
 *    recomputed from the events table each cycle; both windows sit well inside
 *    the retention window, so they are always complete.
 */
export async function aggregate(repo: EventRepository, now: number = Date.now()): Promise<void> {
  // One-time migration from the pre-cumulative scheme: clear any stale rollup
  // contents and re-fold the whole events table from scratch.
  if ((await repo.getMeta("cumulative_ready")) === null) {
    await repo.resetCumulative();
    await repo.setMeta("cumulative_ready", "1");
  }

  // Fold newly-arrived events into the lifetime store (idempotent).
  await repo.foldNewEvents(classify);

  // ── windowed: hourly for 48 h, recomputed from events ────────────────────
  const hourly = await repo.rows<{ bucket: number; n: number }>(
    `SELECT ((ts / ${HOUR}) * ${HOUR})::float8 AS bucket, COUNT(*)::int AS n
     FROM events WHERE type = 'login_attempt' AND ts >= $1
     GROUP BY 1 ORDER BY 1`,
    now - 48 * HOUR,
  );
  await repo.replaceHourlyTimeseries(hourly.map((r) => [r.bucket, r.n]));

  // ── totals: lifetime counters + windowed figures ─────────────────────────
  const [attemptsByIpVersion] = await repo.rows<{
    total: number;
    ipv4: number;
    ipv6: number;
  }>(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE src_ip_trunc LIKE '%/24')::int AS ipv4,
            COUNT(*) FILTER (WHERE src_ip_trunc LIKE '%/48')::int AS ipv6
     FROM events WHERE type = 'login_attempt' AND ts >= $1`,
    now - DAY,
  );
  const attempts24h = attemptsByIpVersion?.total ?? 0;

  const firstEventMeta = await repo.getMeta("first_event_ts");
  const firstEventTs = firstEventMeta !== null ? Number(firstEventMeta) : 0;
  const liveMeta = await repo.getMeta("sensor_live_ts");
  const liveTs = liveMeta !== null ? Number(liveMeta) : null;
  const firstAttackDelayS =
    firstEventTs > 0 && liveTs !== null && liveTs > 0
      ? Math.max(0, Math.round((firstEventTs - liveTs) / 1000))
      : null;

  const totals: Array<[string, string]> = [
    ["total_events", String(await repo.getCounter("total_events"))],
    ["total_login_attempts", String(await repo.getCounter("total_login_attempts"))],
    ["login_attempts_24h", String(attempts24h)],
    ["ipv4_login_attempts_24h", String(attemptsByIpVersion?.ipv4 ?? 0)],
    ["ipv6_login_attempts_24h", String(attemptsByIpVersion?.ipv6 ?? 0)],
    ["unique_sources", String(await repo.countDistinctSources())],
    ["successful_logins", String(await repo.getCounter("successful_logins"))],
    ["sessions", String(await repo.getCounter("sessions"))],
    ["commands_entered", String(await repo.getCounter("commands_entered"))],
    ["first_event_ts", String(firstEventTs || "")],
    ["sensor_live_ts", String(liveTs || "")],
    ["first_attack_delay_s", firstAttackDelayS === null ? "" : String(firstAttackDelayS)],
    ["last_aggregated_at", String(now)],
  ];
  await repo.replaceRollup("rollup_totals", ["key", "value"], totals);
  await repo.setMeta("last_aggregated_at", String(now));
}

/**
 * Enforce the retention window on raw events. Only events already folded into
 * the lifetime aggregates are eligible, so the anonymous rollups are never
 * diminished — only the pseudonymized raw rows are removed.
 */
export async function enforceRetention(
  repo: EventRepository,
  retentionDays: number,
  now: number = Date.now(),
): Promise<number> {
  return repo.deleteEventsBefore(now - retentionDays * DAY);
}
