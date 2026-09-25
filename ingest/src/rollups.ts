import type { EventRepository } from "./repository.js";

/**
 * Assembles the public dashboard payload from the `rollup_*` tables only —
 * pre-aggregated, anonymous data. This is the exact JSON the read-only
 * rollups API serves and the web tier renders. Raw `events` are never read
 * here, so nothing more granular than a bucketed count or a truncated
 * network prefix can ever leave this process.
 *
 * The shape below is the wire contract with `web/src/lib/data.ts`. Keep the
 * two in sync when adding a field.
 */

export interface Totals {
  totalLoginAttempts: number;
  attempts24h: number;
  ipv4Attempts24h: number;
  ipv6Attempts24h: number;
  uniqueSources: number;
  successfulLogins: number;
  sessions: number;
  commandsEntered: number;
  firstEventTs: number | null;
  sensorLiveTs: number | null;
  firstAttackDelayS: number | null;
  lastAggregatedAt: number | null;
}

export interface TimeBucket {
  bucketStart: number;
  count: number;
}

export interface CredentialRow {
  username: string;
  password: string;
  count: number;
}

export interface CountRow {
  key: string;
  count: number;
}

export interface AttckRow {
  techniqueId: string;
  technique: string;
  tactic: string;
  count: number;
}

export interface AsnRow {
  asn: number;
  org: string | null;
  count: number;
}

export interface DashboardData {
  hasData: boolean;
  totals: Totals;
  hourly: TimeBucket[];
  daily: TimeBucket[];
  credentials: CredentialRow[];
  usernames: CountRow[];
  passwords: CountRow[];
  countries: CountRow[];
  asns: AsnRow[];
  clients: CountRow[];
  attck: AttckRow[];
}

const EMPTY_TOTALS: Totals = {
  totalLoginAttempts: 0,
  attempts24h: 0,
  ipv4Attempts24h: 0,
  ipv6Attempts24h: 0,
  uniqueSources: 0,
  successfulLogins: 0,
  sessions: 0,
  commandsEntered: 0,
  firstEventTs: null,
  sensorLiveTs: null,
  firstAttackDelayS: null,
  lastAggregatedAt: null,
};

export const EMPTY_DASHBOARD: DashboardData = {
  hasData: false,
  totals: EMPTY_TOTALS,
  hourly: [],
  daily: [],
  credentials: [],
  usernames: [],
  passwords: [],
  countries: [],
  asns: [],
  clients: [],
  attck: [],
};

function num(v: string | undefined): number | null {
  if (v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Build the public dashboard payload from the rollup tables.
 *
 * Note the explicit `::int` casts and quoted camelCase aliases: Postgres
 * returns bigint as a string (which would serialize as `"42"` instead of `42`)
 * and folds unquoted identifiers to lower case (which would rename
 * `bucketStart` to `bucketstart` and break the wire contract below).
 */
export async function buildDashboard(repo: EventRepository): Promise<DashboardData> {
  const totalsMap = Object.fromEntries(
    (await repo.rows<{ key: string; value: string }>("SELECT key, value FROM rollup_totals")).map(
      (r) => [r.key, r.value],
    ),
  );

  const totals: Totals = {
    totalLoginAttempts: num(totalsMap.total_login_attempts) ?? 0,
    attempts24h: num(totalsMap.login_attempts_24h) ?? 0,
    ipv4Attempts24h: num(totalsMap.ipv4_login_attempts_24h) ?? 0,
    ipv6Attempts24h: num(totalsMap.ipv6_login_attempts_24h) ?? 0,
    uniqueSources: num(totalsMap.unique_sources) ?? 0,
    successfulLogins: num(totalsMap.successful_logins) ?? 0,
    sessions: num(totalsMap.sessions) ?? 0,
    commandsEntered: num(totalsMap.commands_entered) ?? 0,
    firstEventTs: num(totalsMap.first_event_ts),
    sensorLiveTs: num(totalsMap.sensor_live_ts),
    firstAttackDelayS: num(totalsMap.first_attack_delay_s),
    lastAggregatedAt: num(totalsMap.last_aggregated_at),
  };

  const series = (granularity: string): Promise<TimeBucket[]> =>
    repo.rows<TimeBucket>(
      `SELECT bucket_start::float8 AS "bucketStart", count::int AS count
       FROM rollup_timeseries WHERE granularity = $1 ORDER BY bucket_start`,
      granularity,
    );

  const [hourly, daily, credentials, usernames, passwords, countries, asns, clients, attck] =
    await Promise.all([
      series("hour"),
      series("day"),
      repo.rows<CredentialRow>(
        "SELECT username, password, count::int AS count FROM rollup_credentials ORDER BY count DESC LIMIT 20",
      ),
      repo.rows<CountRow>(
        `SELECT username AS key, count::int AS count FROM rollup_usernames ORDER BY count DESC LIMIT 10`,
      ),
      repo.rows<CountRow>(
        `SELECT password AS key, count::int AS count FROM rollup_passwords ORDER BY count DESC LIMIT 10`,
      ),
      repo.rows<CountRow>(
        `SELECT country AS key, count::int AS count FROM rollup_countries ORDER BY count DESC`,
      ),
      repo.rows<AsnRow>(
        "SELECT asn::float8 AS asn, org, count::int AS count FROM rollup_asns ORDER BY count DESC LIMIT 10",
      ),
      repo.rows<CountRow>(
        `SELECT client AS key, count::int AS count FROM rollup_clients ORDER BY count DESC LIMIT 8`,
      ),
      repo.rows<AttckRow>(
        `SELECT technique_id AS "techniqueId", technique, tactic, count::int AS count
         FROM rollup_attck ORDER BY count DESC`,
      ),
    ]);

  return {
    hasData: totals.totalLoginAttempts > 0,
    totals,
    hourly,
    daily,
    credentials,
    usernames,
    passwords,
    countries,
    asns,
    clients,
    attck,
  };
}
