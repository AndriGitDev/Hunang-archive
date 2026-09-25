import { describe, expect, it } from "vitest";
import { deterministicEventId, mapCowrieEvent, parseLine } from "../src/map.js";

const TS = "2026-06-01T10:00:00.000Z";

describe("mapCowrieEvent", () => {
  it("maps session connect with protocol", () => {
    const e = mapCowrieEvent({
      eventid: "cowrie.session.connect",
      timestamp: TS,
      src_ip: "203.0.113.7",
      session: "abc",
      protocol: "ssh",
    });
    expect(e).toMatchObject({ type: "session_connect", src_ip: "203.0.113.7", protocol: "ssh", session: "abc" });
    expect(e?.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(e?.ts).toBe(TS);
  });

  it("maps login success and failure", () => {
    expect(
      mapCowrieEvent({ eventid: "cowrie.login.success", src_ip: "1.2.3.4", username: "root", password: "x" }),
    ).toMatchObject({ type: "login_attempt", success: true, username: "root", password: "x" });
    expect(
      mapCowrieEvent({ eventid: "cowrie.login.failed", src_ip: "1.2.3.4", username: "root", password: "x" }),
    ).toMatchObject({ type: "login_attempt", success: false });
  });

  it("maps command input and failed commands", () => {
    expect(mapCowrieEvent({ eventid: "cowrie.command.input", src_ip: "1.2.3.4", input: "uname -a" })).toMatchObject({
      type: "command",
      command: "uname -a",
    });
    expect(mapCowrieEvent({ eventid: "cowrie.command.failed", src_ip: "1.2.3.4", input: "badcmd" })).toMatchObject({
      type: "command",
      command: "badcmd",
    });
  });

  it("maps downloads and client version", () => {
    expect(
      mapCowrieEvent({ eventid: "cowrie.session.file_download", src_ip: "1.2.3.4", url: "http://x/y" }),
    ).toMatchObject({ type: "file_download", url: "http://x/y" });
    expect(mapCowrieEvent({ eventid: "cowrie.client.version", src_ip: "1.2.3.4", version: "SSH-2.0-Go" })).toMatchObject({
      type: "client_version",
      client_version: "SSH-2.0-Go",
    });
  });

  it("maps session closed with duration", () => {
    expect(
      mapCowrieEvent({ eventid: "cowrie.session.closed", src_ip: "1.2.3.4", duration: 12.5 }),
    ).toMatchObject({ type: "session_closed", duration: 12.5 });
  });

  it("ignores events we don't surface and events without a source IP", () => {
    expect(mapCowrieEvent({ eventid: "cowrie.log.closed", src_ip: "1.2.3.4" })).toBeNull();
    expect(mapCowrieEvent({ eventid: "cowrie.session.connect" })).toBeNull();
    expect(mapCowrieEvent({ src_ip: "1.2.3.4" })).toBeNull();
  });

  it("caps long fields", () => {
    const e = mapCowrieEvent({ eventid: "cowrie.command.input", src_ip: "1.2.3.4", input: "x".repeat(5000) });
    expect(e?.command?.length).toBe(4096);
  });
});

describe("parseLine", () => {
  it("parses a JSON log line", () => {
    const line = JSON.stringify({ eventid: "cowrie.session.connect", src_ip: "1.2.3.4", protocol: "telnet" });
    expect(parseLine(line)).toMatchObject({ type: "session_connect", protocol: "telnet" });
  });
  it("returns null on blank lines and bad JSON", () => {
    expect(parseLine("")).toBeNull();
    expect(parseLine("   ")).toBeNull();
    expect(parseLine("{not json")).toBeNull();
  });
});

describe("deterministicEventId", () => {
  it("is stable for replayed lines and distinct across sensors or records", () => {
    const key = Buffer.alloc(32, 7);
    const otherKey = Buffer.alloc(32, 8);
    const line = JSON.stringify({ eventid: "cowrie.login.failed", timestamp: TS, src_ip: "1.2.3.4" });
    expect(deterministicEventId(key, "hp-1", line)).toBe(deterministicEventId(key, "hp-1", line));
    expect(deterministicEventId(key, "hp-1", line)).not.toBe(deterministicEventId(key, "hp-2", line));
    expect(deterministicEventId(key, "hp-1", `${line} `)).not.toBe(deterministicEventId(key, "hp-1", line));
    expect(deterministicEventId(key, "hp-1", line)).not.toBe(deterministicEventId(otherKey, "hp-1", line));
    expect(deterministicEventId(key, "hp-1", line)).toMatch(/^[0-9a-f-]{36}$/);
  });
});
