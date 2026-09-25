import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { WireEvent } from "../src/map.js";
import { DurableSpool } from "../src/spool.js";

function event(id: string): WireEvent {
  return {
    id,
    ts: "2026-08-25T00:00:00.000Z",
    type: "session_connect",
    src_ip: "203.0.113.7",
  };
}

function spoolFile(): string {
  return join(mkdtempSync(join(tmpdir(), "hunang-spool-")), "pending.ndjson");
}

describe("DurableSpool", () => {
  it("persists FIFO order and removes only acknowledged records", () => {
    const file = spoolFile();
    const first = event("00000000-0000-5000-8000-000000000001");
    const second = event("00000000-0000-5000-8000-000000000002");
    const spool = new DurableSpool(file, 1_000_000);
    spool.append(first);
    spool.append(second);

    const reopened = new DurableSpool(file, 1_000_000);
    expect(reopened.peek(10)).toEqual([first, second]);
    reopened.ack(1);
    expect(new DurableSpool(file, 1_000_000).peek(10)).toEqual([second]);
  });

  it("trims a torn final append without losing complete records", () => {
    const file = spoolFile();
    const complete = event("00000000-0000-5000-8000-000000000001");
    writeFileSync(file, `${JSON.stringify(complete)}\n{\"id\":`);

    const spool = new DurableSpool(file, 1_000_000);
    expect(spool.peek(10)).toEqual([complete]);
    expect(readFileSync(file, "utf8")).toBe(`${JSON.stringify(complete)}\n`);
  });

  it("fails closed at the configured disk bound", () => {
    const file = spoolFile();
    const spool = new DurableSpool(file, 10);
    expect(() => spool.append(event("00000000-0000-5000-8000-000000000001"))).toThrow(
      "spool limit reached",
    );
    expect(spool.length).toBe(0);
  });
});
