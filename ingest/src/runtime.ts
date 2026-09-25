import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { databaseNeedsTls, loadConfig, requireDatabaseUrl, type Config } from "./config.js";
import { createPgClient } from "./sql-pg.js";
import { migrate } from "./db.js";
import { EventRepository } from "./repository.js";
import { buildEnricher } from "./geo.js";
import type { Enricher } from "./schema.js";

/**
 * Shared, lazily-built runtime for the serverless functions in api/.
 *
 * Everything here is cached in module scope so a warm invocation reuses the
 * connection pool, the migration check and the (memory-mapped) GeoLite2
 * readers. The promises are cached rather than the values, so concurrent
 * cold-start invocations wait on one initialization instead of racing to run
 * migrations in parallel.
 *
 * The read path deliberately has its own entry point: serving public rollups
 * must not require INGEST_TOKEN or IP_HASH_SECRET to be present, so a
 * misconfigured read deployment can never quietly gain write credentials.
 */

let readRuntimePromise: Promise<ReadRuntime> | null = null;
let writeRuntimePromise: Promise<WriteRuntime> | null = null;

export interface ReadRuntime {
  repo: EventRepository;
}

export interface WriteRuntime extends ReadRuntime {
  config: Config;
  enrich: Enricher;
}

function connect(url: string, max: number) {
  return createPgClient({ connectionString: url, max, ssl: databaseNeedsTls(url) });
}

export function getReadRuntime(): Promise<ReadRuntime> {
  readRuntimePromise ??= (async () => {
    const sql = connect(requireDatabaseUrl(), 1);
    await migrate(sql);
    return { repo: new EventRepository(sql) };
  })();
  return readRuntimePromise;
}

export function getWriteRuntime(): Promise<WriteRuntime> {
  writeRuntimePromise ??= (async () => {
    const config = loadConfig();
    const sql = connect(config.databaseUrl, 1);
    await migrate(sql);
    const enrich = await buildEnricher(
      config.geoipCountryDb ?? defaultGeoipPath("country.mmdb"),
      config.geoipAsnDb ?? defaultGeoipPath("asn.mmdb"),
    );
    return { config, repo: new EventRepository(sql), enrich };
  })();
  return writeRuntimePromise;
}

/**
 * The country/ASN databases are downloaded at build time into ./geoip (see
 * scripts/fetch-geoip.mjs) and bundled with the function — DB-IP Lite by
 * default, MaxMind GeoLite2 when a licence key is configured. Filenames are
 * source-independent so nothing here cares which one was used. They are
 * optional: if the download failed the sources aggregate as "Unknown",
 * which the dashboard renders honestly.
 *
 * Where they land at runtime depends on how the function was deployed: a CLI
 * deploy from inside ingest/ puts them at <cwd>/geoip, but a git deploy with
 * the Vercel Root Directory set to `ingest` traces files from the repo clone
 * and lands them at <cwd>/ingest/geoip while cwd stays /var/task. Probing
 * only cwd is exactly the bug that silently disabled enrichment for every
 * event after the first git deploy, so probe every plausible layout and —
 * critically — say so out loud when none of them has the file.
 */
function geoipCandidateDirs(): string[] {
  const dirs = [resolve(process.cwd(), "geoip"), resolve(process.cwd(), "ingest", "geoip")];
  try {
    // Module-relative: src/runtime.ts (or its bundled location) sits one or
    // more levels below the directory that contains geoip/.
    let dir = dirname(fileURLToPath(import.meta.url));
    for (let i = 0; i < 4; i++) {
      dir = dirname(dir);
      dirs.push(resolve(dir, "geoip"));
    }
  } catch {
    // bundler rewrote import.meta.url into something non-file — cwd probes remain
  }
  return [...new Set(dirs)];
}

export function defaultGeoipPath(file: string): string | null {
  const candidates = geoipCandidateDirs().map((dir) => resolve(dir, file));
  for (const path of candidates) {
    if (existsSync(path)) return path;
  }
  console.warn(`[geo] ${file} not found; enrichment will be disabled. Probed: ${candidates.join(", ")}`);
  return null;
}
