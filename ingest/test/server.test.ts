import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import type { SqlClient } from "../src/sql.js";
import { EventRepository } from "../src/repository.js";
import { freshRepo } from "./helpers/pglite.js";
import { buildServer } from "../src/server.js";
import { NO_ENRICHMENT } from "../src/schema.js";
import { TokenBucket } from "../src/ratelimit.js";

const TOKEN = "test-token-0123456789abcdef";

let server: Server;
let sql: SqlClient;
let repo: EventRepository;
let base: string;

function makeEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: crypto.randomUUID(),
    ts: new Date(Date.now() - 5000).toISOString(),
    type: "login_attempt",
    src_ip: "203.0.113.7",
    session: "s1",
    protocol: "ssh",
    username: "root",
    password: "123456",
    success: false,
    ...overrides,
  };
}

async function post(payload: unknown, headers: Record<string, string> = {}) {
  return fetch(`${base}/v1/events`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${TOKEN}`,
      "content-type": "application/json",
      ...headers,
    },
    body: typeof payload === "string" ? payload : JSON.stringify(payload),
  });
}

beforeEach(async () => {
  ({ sql, repo } = await freshRepo());
  server = buildServer({
    repo,
    ingestToken: TOKEN,
    ipHashSecret: "hash-secret-0123456789abcdef",
    enrich: NO_ENRICHMENT,
    perIpLimiter: new TokenBucket(1000, 1000),
    globalLimiter: new TokenBucket(1000, 1000),
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  if (addr === null || typeof addr === "string") throw new Error("no address");
  base = `http://127.0.0.1:${addr.port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await sql.close();
});

describe("ingest API", () => {
  it("accepts a valid batch and stores pseudonymized events", async () => {
    const res = await post({ sensor: "hp-1", events: [makeEvent()] });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ accepted: 1, duplicate: 0, rejected: 0 });
    const rows = await repo.rows<{ src_ip_trunc: string; username: string }>(
      "SELECT src_ip_trunc, username FROM events",
    );
    expect(rows).toEqual([{ src_ip_trunc: "203.0.113.0/24", username: "root" }]);
  });

  it("is idempotent on retries (duplicate ids ignored)", async () => {
    const e = makeEvent();
    await post({ sensor: "hp-1", events: [e] });
    const res = await post({ sensor: "hp-1", events: [e] });
    expect(await res.json()).toEqual({ accepted: 0, duplicate: 1, rejected: 0 });
    expect(await repo.countEvents()).toBe(1);
  });

  it("rejects missing or wrong bearer tokens", async () => {
    const noAuth = await fetch(`${base}/v1/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sensor: "hp-1", events: [makeEvent()] }),
    });
    expect(noAuth.status).toBe(401);
    const wrong = await post({ sensor: "hp-1", events: [makeEvent()] }, { authorization: "Bearer nope" });
    expect(wrong.status).toBe(401);
    expect(await repo.countEvents()).toBe(0);
  });

  it("rejects malformed JSON and bad envelopes without echoing content", async () => {
    const badJson = await post("{not json");
    expect(badJson.status).toBe(400);
    const badEnvelope = await post({ sensor: "hp-1", events: "not-an-array", extra: "<script>" });
    expect(badEnvelope.status).toBe(400);
    const text = JSON.stringify(await badEnvelope.json());
    expect(text).not.toContain("script");
  });

  it("skips invalid events but keeps valid ones in the same batch", async () => {
    const res = await post({
      sensor: "hp-1",
      events: [makeEvent(), makeEvent({ src_ip: "999.999.1.1" }), makeEvent({ type: "nonsense" })],
    });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ accepted: 1, duplicate: 0, rejected: 2 });
  });

  it("returns 400 when every event is invalid", async () => {
    const res = await post({ sensor: "hp-1", events: [makeEvent({ src_ip: "bad" })] });
    expect(res.status).toBe(400);
  });

  it("rejects wrong content type and oversized bodies", async () => {
    const wrongType = await post({ sensor: "hp-1", events: [makeEvent()] }, { "content-type": "text/plain" });
    expect(wrongType.status).toBe(415);
    const big = await post(JSON.stringify({ sensor: "hp-1", events: [makeEvent({ command: "x".repeat(2_000_000) })] }));
    expect(big.status).toBe(413);
  });

  it("rate limits per client", async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    server = buildServer({
      repo,
      ingestToken: TOKEN,
      ipHashSecret: "hash-secret-0123456789abcdef",
      enrich: NO_ENRICHMENT,
      perIpLimiter: new TokenBucket(2, 0.001),
      globalLimiter: new TokenBucket(1000, 1000),
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const addr = server.address();
    if (addr === null || typeof addr === "string") throw new Error("no address");
    base = `http://127.0.0.1:${addr.port}`;

    expect((await post({ sensor: "hp-1", events: [makeEvent()] })).status).toBe(202);
    expect((await post({ sensor: "hp-1", events: [makeEvent()] })).status).toBe(202);
    const limited = await post({ sensor: "hp-1", events: [makeEvent()] });
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("10");
  });

  it("answers healthz without auth and 404s elsewhere", async () => {
    expect((await fetch(`${base}/healthz`)).status).toBe(200);
    expect((await fetch(`${base}/other`)).status).toBe(404);
    expect((await fetch(`${base}/v1/events`)).status).toBe(405);
  });

  it("anchors sensor_live_ts to the earliest reported boot time", async () => {
    const earlier = new Date(Date.now() - 3_600_000).toISOString();
    const later = new Date(Date.now() - 600_000).toISOString();

    // a later boot report first...
    await post({ sensor: "hp-1", sensor_boot_ts: later, events: [makeEvent()] });
    expect(await repo.getMeta("sensor_live_ts")).toBe(String(Date.parse(later)));

    // ...then an earlier one wins (a reboot must not push "live since" forward)
    await post({ sensor: "hp-1", sensor_boot_ts: earlier, events: [makeEvent()] });
    expect(await repo.getMeta("sensor_live_ts")).toBe(String(Date.parse(earlier)));

    // a subsequent later report does NOT move it back
    await post({ sensor: "hp-1", sensor_boot_ts: later, events: [makeEvent()] });
    expect(await repo.getMeta("sensor_live_ts")).toBe(String(Date.parse(earlier)));
  });

  it("rejects an implausible sensor_boot_ts envelope", async () => {
    const res = await post({
      sensor: "hp-1",
      sensor_boot_ts: "1999-01-01T00:00:00Z",
      events: [makeEvent()],
    });
    expect(res.status).toBe(400);
    expect(await repo.getMeta("sensor_live_ts")).toBeNull();
  });
});
