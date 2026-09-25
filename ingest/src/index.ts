import { databaseNeedsTls, loadConfig } from "./config.js";
import { createPgClient } from "./sql-pg.js";
import { migrate } from "./db.js";
import { EventRepository } from "./repository.js";
import { buildServer } from "./server.js";
import { buildReadServer } from "./read-server.js";
import { buildEnricher } from "./geo.js";
import { aggregate, enforceRetention } from "./aggregate.js";

/**
 * Long-running ingest service used by local development and the production
 * Coolify deployment. The optional api/ wrappers expose the same handlers for
 * function platforms without changing the core implementation.
 */

const config = loadConfig();
const sql = createPgClient({
  connectionString: config.databaseUrl,
  max: 10,
  ssl: databaseNeedsTls(config.databaseUrl),
});
await migrate(sql);
const repo = new EventRepository(sql);

// "Live since" is anchored to the sensor's own reported boot time, recorded
// from the batch envelope on ingest (see server.ts / repository.recordSensorLive).
// It is deliberately NOT stamped here at startup: the ingest tier comes up
// before the sensor, so its own age would overstate the sensor's uptime.

const enrich = await buildEnricher(config.geoipCountryDb, config.geoipAsnDb);
const server = buildServer({
  repo,
  ingestToken: config.ingestToken,
  ipHashSecret: config.ipHashSecret,
  enrich,
});

const readServer =
  config.rollupsPort !== null
    ? buildReadServer({
        repo,
        allowOrigin: process.env.ROLLUPS_ALLOW_ORIGIN || null,
        readToken: config.rollupsToken,
      })
    : null;

let running = false;
async function runJobs(): Promise<void> {
  // Skip rather than queue: a cycle that outlasts the interval should not
  // stack up overlapping folds behind it.
  if (running) return;
  running = true;
  try {
    // Fold new events into the lifetime aggregates FIRST, then purge raw
    // events past the window. Retention only removes already-folded rows, so
    // lifetime numbers are never diminished by the purge.
    await aggregate(repo);
    const deleted = await enforceRetention(repo, config.retentionDays);
    if (deleted > 0) console.log(`[retention] deleted ${deleted} events past ${config.retentionDays}d window`);
    console.log(`[aggregate] rollups refreshed (${await repo.countEvents()} raw events retained)`);
  } catch (err) {
    console.error("[aggregate] failed:", err);
  } finally {
    running = false;
  }
}

await runJobs();
const timer = setInterval(() => void runJobs(), config.aggregateIntervalSeconds * 1000);

server.listen(config.port, () => {
  console.log(`[ingest] listening on :${config.port}`);
});

if (readServer && config.rollupsPort !== null) {
  readServer.listen(config.rollupsPort, () => {
    console.log(`[rollups] read-only API listening on :${config.rollupsPort}`);
  });
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    clearInterval(timer);
    server.close(() => {
      readServer?.close();
      void sql.close().finally(() => process.exit(0));
    });
  });
}
