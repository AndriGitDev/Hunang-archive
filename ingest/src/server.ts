import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { batchSchema, eventSchema, normalizeEvent, type Enricher, type StoredEvent } from "./schema.js";
import { hashIp, truncateIp } from "./privacy.js";
import type { EventRepository } from "./repository.js";
import { TokenBucket } from "./ratelimit.js";
import { clientIpFrom, serveWithNodeHttp } from "./node-adapter.js";

const MAX_BODY_BYTES = 1_000_000; // a full 500-event batch is well under this

export interface ServerDeps {
  repo: EventRepository;
  ingestToken: string;
  ipHashSecret: string;
  enrich: Enricher;
  /** injectable for tests */
  perIpLimiter?: TokenBucket;
  globalLimiter?: TokenBucket;
}

export type WebHandler = (request: Request, clientIp: string) => Promise<Response>;

/**
 * The only inbound path from the sensor. Treats the sender as hostile:
 * bearer auth (constant-time), body size cap, strict schema validation,
 * per-IP and global rate limits, and no reflection of request contents
 * in any response or log line.
 *
 * Written against the Web `Request`/`Response` types so the identical code
 * runs as a Vercel function and behind the local node:http server.
 *
 * NOTE on rate limiting: the token buckets are per-process. Under the local
 * single-instance server that is a real control. On Vercel, invocations do not
 * share memory, so the buckets only bound a single warm instance — the actual
 * limit there is the platform firewall rule (see docs/RUNBOOK.md). Bearer auth,
 * not rate limiting, is what keeps unauthorized events out either way.
 */
export function createEventsHandler(deps: ServerDeps): WebHandler {
  const perIp = deps.perIpLimiter ?? new TokenBucket(30, 0.5); // burst 30, 1 req / 2 s sustained
  const global = deps.globalLimiter ?? new TokenBucket(120, 2);

  return async (request: Request, clientIp: string): Promise<Response> => {
    // Routing lives outside this function: the local server dispatches by
    // path (see buildServer) and on Vercel the platform's file-based routing
    // does it. Either way the handler only ever sees the events endpoint.
    if (request.method !== "POST") {
      return json(405, { error: "method not allowed" });
    }

    if (!global.take("global") || !perIp.take(clientIp)) {
      return json(429, { error: "rate limited" }, { "Retry-After": "10" });
    }

    if (!checkBearer(request.headers.get("authorization"), deps.ingestToken)) {
      return json(401, { error: "unauthorized" });
    }

    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.startsWith("application/json")) {
      return json(415, { error: "expected application/json" });
    }

    const declared = Number(request.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
      return json(413, { error: "body too large" });
    }

    let raw: string;
    try {
      const buf = await request.arrayBuffer();
      if (buf.byteLength > MAX_BODY_BYTES) return json(413, { error: "body too large" });
      raw = new TextDecoder().decode(buf);
    } catch {
      return json(400, { error: "unreadable body" });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return json(400, { error: "invalid json" });
    }

    const batch = batchSchema.safeParse(parsed);
    if (!batch.success) {
      // deliberately no detail: don't reflect attacker-influenced content
      return json(400, { error: "invalid batch envelope" });
    }

    // Anchor "live since" to the sensor's reported boot time, keeping the
    // earliest ever seen (a sensor reboot must not reset it). This makes the
    // "first attack after going live" stat measure the sensor's uptime, not
    // the ingest datastore's age.
    if (batch.data.sensor_boot_ts !== undefined) {
      await deps.repo.recordSensorLive(Date.parse(batch.data.sensor_boot_ts));
    }

    const stored: StoredEvent[] = [];
    let rejected = 0;
    for (const rawEvent of batch.data.events) {
      const event = eventSchema.safeParse(rawEvent);
      if (!event.success) {
        rejected += 1;
        continue;
      }
      stored.push(
        normalizeEvent(event.data, batch.data.sensor, deps.ipHashSecret, deps.enrich, {
          hashIp,
          truncateIp,
        }),
      );
    }

    const inserted = await deps.repo.insertEvents(stored);
    return json(rejected > 0 && inserted === 0 ? 400 : 202, {
      accepted: inserted,
      duplicate: stored.length - inserted,
      rejected,
    });
  };
}

/**
 * node:http wrapper around the events handler, used by the local service.
 * This is where path routing happens for the self-hosted deployment; on
 * Vercel the same handler is mounted by the platform at /v1/events.
 */
export function buildServer(deps: ServerDeps): Server {
  const events = createEventsHandler(deps);
  const routed: WebHandler = async (request, clientIp) => {
    const { pathname } = new URL(request.url);
    if (pathname === "/healthz") {
      return request.method === "GET" || request.method === "HEAD"
        ? json(200, { ok: true })
        : json(405, { error: "method not allowed" });
    }
    if (pathname !== "/v1/events") return json(404, { error: "not found" });
    return events(request, clientIp);
  };
  return createServer((req: IncomingMessage, res: ServerResponse) => {
    void serveWithNodeHttp(routed, req, res, clientIpFrom(req));
  });
}

/**
 * Constant-time bearer check. Exported so callers can reject an
 * unauthenticated request *before* doing any work that could fail —
 * notably before opening a database connection, so that a datastore outage
 * still answers 401 rather than a 500 that reveals backend state.
 */
export function checkBearer(header: string | null, token: string): boolean {
  if (!header?.startsWith("Bearer ")) return false;
  const presented = Buffer.from(header.slice(7));
  const expected = Buffer.from(token);
  if (presented.length !== expected.length) return false;
  return timingSafeEqual(presented, expected);
}

export function json(status: number, payload: unknown, extra: Record<string, string> = {}): Response {
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
