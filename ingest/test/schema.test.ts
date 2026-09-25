import { describe, expect, it } from "vitest";
import { batchSchema, eventSchema, normalizeEvent, NO_ENRICHMENT } from "../src/schema.js";
import { hashIp, truncateIp } from "../src/privacy.js";

const VALID = {
  id: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  ts: new Date(Date.now() - 1000).toISOString(),
  type: "login_attempt",
  src_ip: "203.0.113.7",
  session: "abc123",
  protocol: "ssh",
  username: "root",
  password: "123456",
  success: false,
};

describe("eventSchema", () => {
  it("accepts a valid login attempt", () => {
    expect(eventSchema.safeParse(VALID).success).toBe(true);
  });

  it("rejects unknown keys (strict)", () => {
    expect(eventSchema.safeParse({ ...VALID, evil: "x" }).success).toBe(false);
  });

  it("rejects bad source IPs", () => {
    for (const src_ip of ["999.1.1.1", "not-an-ip", "203.0.113.7; DROP TABLE events"]) {
      expect(eventSchema.safeParse({ ...VALID, src_ip }).success).toBe(false);
    }
  });

  it("rejects non-uuid ids and bad timestamps", () => {
    expect(eventSchema.safeParse({ ...VALID, id: "1" }).success).toBe(false);
    expect(eventSchema.safeParse({ ...VALID, ts: "2010-01-01T00:00:00Z" }).success).toBe(false);
    const future = new Date(Date.now() + 3_600_000).toISOString();
    expect(eventSchema.safeParse({ ...VALID, ts: future }).success).toBe(false);
  });

  it("requires username+password on login_attempt and command on command", () => {
    const { username, password, ...rest } = VALID;
    expect(eventSchema.safeParse(rest).success).toBe(false);
    expect(eventSchema.safeParse({ ...VALID, type: "command" }).success).toBe(false);
  });

  it("strips control characters but keeps the rest verbatim", () => {
    const parsed = eventSchema.parse({ ...VALID, password: "12\u00003456\u001b[31m" });
    expect(parsed.password).toBe("123456[31m");
  });

  it("caps oversized fields", () => {
    expect(eventSchema.safeParse({ ...VALID, password: "x".repeat(300) }).success).toBe(false);
  });
});

describe("batchSchema", () => {
  it("rejects empty and oversized batches", () => {
    expect(batchSchema.safeParse({ sensor: "hp-1", events: [] }).success).toBe(false);
    expect(batchSchema.safeParse({ sensor: "hp-1", events: Array(501).fill({}) }).success).toBe(false);
  });
  it("rejects sensor names that are not simple tokens", () => {
    expect(batchSchema.safeParse({ sensor: "hp 1; rm -rf /", events: [VALID] }).success).toBe(false);
  });
});

describe("normalizeEvent", () => {
  it("never stores the raw IP", () => {
    const stored = normalizeEvent(eventSchema.parse(VALID), "hp-1", "test-secret", NO_ENRICHMENT, {
      hashIp,
      truncateIp,
    });
    expect(JSON.stringify(stored)).not.toContain("203.0.113.7");
    expect(stored.src_ip_trunc).toBe("203.0.113.0/24");
    expect(stored.src_ip_hash).toMatch(/^[0-9a-f]{16}$/);
    expect(stored.success).toBe(0);
    expect(stored.ts).toBe(Date.parse(VALID.ts));
  });
});
