/** One-shot rollup recompute + retention pass (for cron or manual runs). */
import { databaseNeedsTls, loadConfig } from "./config.js";
import { createPgClient } from "./sql-pg.js";
import { migrate } from "./db.js";
import { EventRepository } from "./repository.js";
import { aggregate, enforceRetention } from "./aggregate.js";

const config = loadConfig();
const sql = createPgClient({
  connectionString: config.databaseUrl,
  ssl: databaseNeedsTls(config.databaseUrl),
});
await migrate(sql);
const repo = new EventRepository(sql);

// Fold into lifetime aggregates first, then purge past-window raw events.
await aggregate(repo);
const deleted = await enforceRetention(repo, config.retentionDays);
console.log(
  `rollups refreshed; ${deleted} expired raw events deleted; ${await repo.countEvents()} events retained`,
);
await sql.close();
