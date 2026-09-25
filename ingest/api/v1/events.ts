import { checkBearer, createEventsHandler, json } from "../../src/server.js";
import { clientIpFromHeaders } from "../../src/node-adapter.js";
import { getWriteRuntime } from "../../src/runtime.js";

/**
 * POST /v1/events — the only inbound path from the sensor.
 *
 * Thin wrapper: all of the hostile-input handling (constant-time bearer
 * check, body cap, strict schema validation, IP pseudonymization) lives in
 * src/server.ts and is shared with the self-hosted node:http deployment.
 */

let handler: ReturnType<typeof createEventsHandler> | null = null;

export async function POST(request: Request): Promise<Response> {
  // Reject unauthenticated callers BEFORE touching the datastore. Building
  // the write runtime opens a database connection and reads the ingest
  // secrets; if that fails (database down, misconfigured deployment) an
  // anonymous request must still get a clean 401 rather than a 500 that
  // advertises the backend is broken. The handler re-checks the token, so
  // this is an ordering guarantee, not the only gate.
  const token = process.env.INGEST_TOKEN ?? "";
  if (token.length < 16 || !checkBearer(request.headers.get("authorization"), token)) {
    return json(401, { error: "unauthorized" });
  }

  const { config, repo, enrich } = await getWriteRuntime();
  handler ??= createEventsHandler({
    repo,
    ingestToken: config.ingestToken,
    ipHashSecret: config.ipHashSecret,
    enrich,
  });
  // x-forwarded-for is set by Vercel's edge and cannot be spoofed by the
  // caller here, so it is safe to key the rate-limit bucket on.
  return handler(request, clientIpFromHeaders(request.headers));
}
