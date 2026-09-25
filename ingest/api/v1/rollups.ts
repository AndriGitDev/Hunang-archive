import { createRollupsHandler } from "../../src/read-server.js";
import { clientIpFromHeaders } from "../../src/node-adapter.js";
import { getReadRuntime } from "../../src/runtime.js";
import { checkBearer } from "../../src/server.js";

/**
 * GET /v1/rollups — the public, anonymous dashboard payload.
 *
 * Reads only `rollup_*` tables (see src/rollups.ts). The bearer token is a
 * compute wake-up gate, not a secrecy boundary: the same aggregates remain
 * public on the web tier. Authentication happens before getReadRuntime() so
 * arbitrary requests cannot initialize a database connection.
 */

let handler: ReturnType<typeof createRollupsHandler> | null = null;

export async function GET(request: Request): Promise<Response> {
  const readToken = process.env.ROLLUPS_TOKEN ?? "";
  if (readToken.length < 16) return unavailable();
  if (!checkBearer(request.headers.get("authorization"), readToken)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
      },
    });
  }

  try {
    const { repo } = await getReadRuntime();
    handler ??= createRollupsHandler({
      repo,
      allowOrigin: process.env.ROLLUPS_ALLOW_ORIGIN || null,
      readToken,
    });
    return await handler(request, clientIpFromHeaders(request.headers));
  } catch {
    // A datastore outage should read as "temporarily unavailable", not as an
    // unhandled crash. The web tier treats any non-200 as an empty dashboard
    // and still renders, so this keeps the public page honest rather than
    // broken — and the response body reveals nothing about the failure.
    return unavailable();
  }
}

export const HEAD = GET;

function unavailable(): Response {
  return new Response(JSON.stringify({ error: "unavailable" }), {
    status: 503,
    headers: {
      "Content-Type": "application/json",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    },
  });
}
