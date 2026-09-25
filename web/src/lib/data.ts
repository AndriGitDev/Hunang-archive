import "server-only";

/**
 * The site's entire data access layer. It fetches pre-aggregated, anonymous
 * rollups over HTTPS from the ingest deployment's read-only rollups API
 * (`GET /v1/rollups`) — the same anonymous aggregates rendered here. It has
 * no database driver and no path to raw events: the ingest service is the
 * only component that touches the datastore, and the rollups API it exposes
 * reads only `rollup_*` tables. Nothing more granular than a bucketed count
 * or a truncated network prefix can ever reach this tier, let alone a
 * browser. On any failure it degrades to an empty dashboard rather than
 * throwing, so the page always renders.
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

function rollupsUrl(): string | null {
  return process.env.HUNANG_ROLLUPS_URL || null;
}

function rollupsToken(): string | null {
  return process.env.HUNANG_ROLLUPS_TOKEN || null;
}

/**
 * Fetch the anonymous rollups payload from the ingest deployment's read-only API.
 * Returns EMPTY_DASHBOARD when the URL is unset (e.g. a build with no
 * backend) or on any network/parse error, so the page never throws.
 *
 * Caching: callers use a short freshness window owned by the Vercel web tier.
 * The authenticated Coolify rollups endpoint is deliberately uncached so
 * different edge regions cannot retain different aggregate generations.
 */
export async function getDashboardData(revalidateSeconds = 300): Promise<DashboardData> {
  const url = rollupsUrl();
  if (!url) return EMPTY_DASHBOARD;
  const token = rollupsToken();

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      next: { revalidate: revalidateSeconds },
      headers: {
        accept: "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!res.ok) return EMPTY_DASHBOARD;
    const data = (await res.json()) as Partial<DashboardData>;
    // Merge over EMPTY_DASHBOARD so a partial/older payload can't crash a render.
    return {
      ...EMPTY_DASHBOARD,
      ...data,
      totals: { ...EMPTY_DASHBOARD.totals, ...(data.totals ?? {}) },
    };
  } catch {
    return EMPTY_DASHBOARD;
  }
}
