import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const url = process.env.HUNANG_ROLLUPS_URL;
const token = process.env.HUNANG_ROLLUPS_TOKEN;
if (!url || !token) throw new Error("HUNANG_ROLLUPS_URL and HUNANG_ROLLUPS_TOKEN are required");

const response = await fetch(url, {
  headers: { accept: "application/json", authorization: `Bearer ${token}` },
  signal: AbortSignal.timeout(20_000),
});
if (!response.ok) throw new Error(`Rollups request failed: HTTP ${response.status}`);
const data = await response.json();
const total = data?.totals?.totalLoginAttempts;
const sum = (rows) => rows.reduce((value, row) => value + row.count, 0);
if (!Number.isSafeInteger(total) || total <= 0 || !Array.isArray(data.daily) || !Array.isArray(data.countries)) {
  throw new Error("Rollups payload is incomplete");
}
if (sum(data.daily) !== total || sum(data.countries) !== total) {
  throw new Error("Lifetime daily and country counts do not reconcile with total login attempts");
}
if (!Number.isSafeInteger(data.totals.lastAggregatedAt)) throw new Error("Missing snapshot timestamp");

const body = JSON.stringify(data, null, 2) + "\n";
for (const file of ["src/archive/final-rollups.json", "public/archive/rollups.json"]) {
  const path = resolve(import.meta.dirname, "..", file);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, body);
}
console.log(`Saved anonymous rollups at ${new Date(data.totals.lastAggregatedAt).toISOString()}: ${total} login attempts`);
