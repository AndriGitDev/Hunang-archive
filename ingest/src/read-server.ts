import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { EventRepository } from "./repository.js";
import { buildDashboard } from "./rollups.js";
import { TokenBucket } from "./ratelimit.js";
import { clientIpFrom, serveWithNodeHttp } from "./node-adapter.js";
import { checkBearer, type WebHandler } from "./server.js";

/**
 * Public, read-only rollups API. Intentionally SEPARATE from the ingest
 * handler so the two can be exposed independently: the ingest path is
 * reachable only by whoever holds the sensor token, this one is safe to
 * expose publicly.
 *
 * It serves exactly one thing — GET /v1/rollups — returning the same
 * anonymous aggregates the site renders. Optional bearer auth is a compute
 * access gate, not a confidentiality boundary: it lets the web tier read
 * while arbitrary callers are rejected before Postgres is opened.
 * There is no write path, and it reads only `rollup_*` tables via
 * buildDashboard(), so raw events can never leak through it.
 */

export interface ReadServerDeps {
  repo: EventRepository;
  /** If set, sent as Access-Control-Allow-Origin so a browser may fetch cross-origin. */
  allowOrigin?: string | null;
  /** Read-only cost-control token; optional for the local demo. */
  readToken?: string | null;
  /** injectable for tests */
  perIpLimiter?: TokenBucket;
  globalLimiter?: TokenBucket;
}

export function createRollupsHandler(deps: ReadServerDeps): WebHandler {
  const perIp = deps.perIpLimiter ?? new TokenBucket(60, 5); // burst 60, 5 req/s sustained
  const global = deps.globalLimiter ?? new TokenBucket(300, 50);
  const cors = deps.allowOrigin
    ? { "Access-Control-Allow-Origin": deps.allowOrigin, Vary: "Origin" }
    : {};

  return async (request: Request, clientIp: string): Promise<Response> => {
    // Routing is the caller's job — buildReadServer below for the local
    // service, or a function platform's file-based routing.
    if (request.method !== "GET" && request.method !== "HEAD") {
      return json(405, { error: "method not allowed" }, cors);
    }

    if (deps.readToken && !checkBearer(request.headers.get("authorization"), deps.readToken)) {
      return json(401, { error: "unauthorized" }, cors);
    }

    if (!global.take("global") || !perIp.take(clientIp)) {
      return json(429, { error: "rate limited" }, { ...cors, "Retry-After": "5" });
    }

    const payload = await buildDashboard(deps.repo);
    // This authenticated service is now self-hosted behind Coolify. Do not let
    // an intermediate edge cache keep different regions on different rollup
    // generations; the Vercel web tier owns the short public cache instead.
    return json(200, payload, {
      ...cors,
      "Cache-Control": "private, no-store",
    });
  };
}

/** node:http wrapper around the rollups handler, used by the local service. */
export function buildReadServer(deps: ReadServerDeps): Server {
  const rollups = createRollupsHandler(deps);
  const cors = deps.allowOrigin
    ? { "Access-Control-Allow-Origin": deps.allowOrigin, Vary: "Origin" }
    : {};
  const routed: WebHandler = async (request, clientIp) => {
    // Method before path, deliberately: any write verb against this listener
    // is answered 405 whatever the path, so the read tier never looks like it
    // might accept one somewhere.
    if (request.method !== "GET" && request.method !== "HEAD") {
      return json(405, { error: "method not allowed" }, cors);
    }
    const { pathname } = new URL(request.url);
    if (pathname === "/healthz") return json(200, { ok: true }, cors);
    if (pathname !== "/v1/rollups") return json(404, { error: "not found" }, cors);
    return rollups(request, clientIp);
  };
  return createServer((req: IncomingMessage, res: ServerResponse) => {
    void serveWithNodeHttp(routed, req, res, clientIpFrom(req));
  });
}

function json(status: number, payload: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
      ...extra,
    },
  });
}
