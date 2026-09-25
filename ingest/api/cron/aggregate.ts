import { timingSafeEqual } from "node:crypto";
import { aggregate, enforceRetention } from "../../src/aggregate.js";
import { getWriteRuntime } from "../../src/runtime.js";

/**
 * Scheduled aggregation + retention. Replaces the setInterval loop the
 * self-hosted service runs (src/index.ts); the schedule lives in vercel.json.
 *
 * Order matters: fold new events into the lifetime aggregates FIRST, then
 * purge raw events past the window. Retention only deletes already-folded
 * rows, so the lifetime numbers on the dashboard are never diminished by the
 * purge — they keep counting for the life of the sensor.
 *
 * Concurrency is safe by construction: the fold takes a Postgres advisory
 * lock, so an overlapping run waits rather than double-counting.
 */

export async function GET(request: Request): Promise<Response> {
  if (!authorized(request)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }

  const started = Date.now();
  const { config, repo } = await getWriteRuntime();
  await aggregate(repo);
  const deleted = await enforceRetention(repo, config.retentionDays);

  return new Response(
    JSON.stringify({
      ok: true,
      deleted,
      retained: await repo.countEvents(),
      tookMs: Date.now() - started,
    }),
    { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } },
  );
}

/**
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET` when CRON_SECRET is
 * set on the project. Requiring it keeps anyone on the internet from forcing
 * repeated full aggregations (a cheap way to burn the database's compute
 * budget). Refuse to run unprotected rather than defaulting to open.
 */
function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET ?? "";
  if (secret.length < 16) return false;
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return false;
  const presented = Buffer.from(header.slice(7));
  const expected = Buffer.from(secret);
  if (presented.length !== expected.length) return false;
  return timingSafeEqual(presented, expected);
}
