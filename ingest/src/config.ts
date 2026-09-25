export interface Config {
  port: number;
  rollupsPort: number | null;
  databaseUrl: string;
  ingestToken: string;
  ipHashSecret: string;
  rollupsToken: string | null;
  retentionDays: number;
  aggregateIntervalSeconds: number;
  geoipCountryDb: string | null;
  geoipAsnDb: string | null;
}

/**
 * Connection string for the ingest datastore. `DATABASE_URL` is the
 * conventional name and wins when both it and the compatibility alias
 * `POSTGRES_URL` are present.
 */
export function requireDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const url = env.DATABASE_URL || env.POSTGRES_URL || "";
  if (!url) {
    throw new Error("DATABASE_URL (or POSTGRES_URL) must be set to a Postgres connection string");
  }
  return url;
}

/** True when the connection string points at a managed host that needs TLS. */
export function databaseNeedsTls(url: string, env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.PGSSLMODE === "disable" || /[?&]sslmode=disable/.test(url)) return false;
  // A local container has no certificate; anything else is assumed remote.
  return !/@(localhost|127\.0\.0\.1|postgres)[:/]/.test(url);
}

/**
 * Full configuration for the write path. Deliberately throws rather than
 * defaulting: an ingest deployment without real secrets would accept forged
 * telemetry and store recoverable IP pseudonyms, so failing to boot is the
 * safe outcome. Read-only paths use requireDatabaseUrl() instead and never
 * need these secrets in their environment.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const ingestToken = env.INGEST_TOKEN ?? "";
  const ipHashSecret = env.IP_HASH_SECRET ?? "";
  if (ingestToken.length < 16) {
    throw new Error("INGEST_TOKEN must be set and at least 16 characters (openssl rand -hex 32)");
  }
  if (ipHashSecret.length < 16) {
    throw new Error("IP_HASH_SECRET must be set and at least 16 characters (openssl rand -hex 32)");
  }
  if (ingestToken === ipHashSecret) {
    throw new Error("INGEST_TOKEN and IP_HASH_SECRET must be different values");
  }
  return {
    port: intFrom(env.INGEST_PORT, 8400),
    // Public read-only rollups API. Served on a SEPARATE port so it can be
    // firewalled independently of the sensor-only ingest port. Set
    // ROLLUPS_PORT=0 to disable it entirely.
    rollupsPort: env.ROLLUPS_PORT === "0" ? null : intFrom(env.ROLLUPS_PORT, 8402),
    databaseUrl: requireDatabaseUrl(env),
    ingestToken,
    ipHashSecret,
    rollupsToken: env.ROLLUPS_TOKEN && env.ROLLUPS_TOKEN.length >= 16 ? env.ROLLUPS_TOKEN : null,
    retentionDays: intFrom(env.RETENTION_DAYS, 30),
    aggregateIntervalSeconds: intFrom(env.AGGREGATE_INTERVAL_SECONDS, 3600),
    geoipCountryDb: env.GEOIP_COUNTRY_DB || null,
    geoipAsnDb: env.GEOIP_ASN_DB || null,
  };
}

function intFrom(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}
