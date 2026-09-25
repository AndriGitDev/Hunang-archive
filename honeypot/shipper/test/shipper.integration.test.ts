import { appendFileSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import type { WireEvent } from "../src/map.js";

let server: Server | null = null;
let child: ChildProcess | null = null;

afterEach(async () => {
  if (child?.exitCode === null) child.kill("SIGKILL");
  child = null;
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
  server = null;
});

function line(timestamp: string, username: string): string {
  return JSON.stringify({
    eventid: "cowrie.login.failed",
    timestamp,
    src_ip: "203.0.113.7",
    username,
    password: "123456",
    session: "session-1",
    protocol: "ssh",
  });
}

async function waitFor(predicate: () => boolean, timeoutMs = 8000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("timed out waiting for shipper");
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

async function stopChild(): Promise<void> {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise<void>((resolve) => child!.once("exit", () => resolve()));
  child.kill("SIGTERM");
  await exited;
  child = null;
}

describe("shipper process", () => {
  it("replays a cutoff once, acknowledges durably, and resumes from its checkpoint", async () => {
    const received: WireEvent[][] = [];
    server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { events: WireEvent[] };
        received.push(body.events);
        response.writeHead(202).end();
      });
    });
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("test server has no port");

    const root = mkdtempSync(join(tmpdir(), "hunang-shipper-process-"));
    const state = join(root, "state");
    const log = join(root, "cowrie.json");
    const before = line("2026-08-25T10:59:59.000Z", "before");
    const replayed = line("2026-08-25T11:00:01.000Z", "replayed");
    writeFileSync(log, `${before}\n${replayed}\n`);

    const baseEnv = {
      ...process.env,
      INGEST_URL: `http://127.0.0.1:${address.port}/v1/events`,
      INGEST_TOKEN: "test-token-0123456789abcdef",
      COWRIE_LOG: log,
      SENSOR_NAME: "hp-test",
      SHIPPER_STATE_DIR: state,
      SHIPPER_FLUSH_INTERVAL_SECONDS: "1",
      SHIPPER_MAX_SPOOL_BYTES: "1000000",
    };
    const executable = join(process.cwd(), "node_modules", ".bin", "tsx");
    const pending = join(state, "pending.ndjson");
    const acknowledged = () => existsSync(pending) && readFileSync(pending, "utf8") === "";

    child = spawn(executable, ["src/shipper.ts"], {
      cwd: process.cwd(),
      env: { ...baseEnv, SHIPPER_REPLAY_SINCE: "2026-08-25T11:00:00.000Z" },
      stdio: "ignore",
    });
    await waitFor(() => received.length >= 1);
    await waitFor(acknowledged);
    await stopChild();

    expect(received.flat().map((event) => event.username)).toEqual(["replayed"]);
    expect(readFileSync(pending, "utf8")).toBe("");
    expect(readFileSync(join(state, "event-id-key"), "utf8")).toMatch(/^[0-9a-f]{64}$/);

    const next = line("2026-08-25T12:00:01.000Z", "next");
    appendFileSync(log, `${next}\n`);
    child = spawn(executable, ["src/shipper.ts"], {
      cwd: process.cwd(),
      env: { ...baseEnv, SHIPPER_REPLAY_SINCE: "" },
      stdio: "ignore",
    });
    await waitFor(() => received.length >= 2);
    await waitFor(acknowledged);
    await stopChild();

    const all = received.flat();
    expect(all.map((event) => event.username)).toEqual(["replayed", "next"]);
    expect(new Set(all.map((event) => event.id)).size).toBe(2);
    const checkpoint = JSON.parse(readFileSync(join(state, "cowrie-checkpoint.json"), "utf8")) as {
      offset: number;
    };
    expect(checkpoint.offset).toBe(Buffer.byteLength(`${before}\n${replayed}\n${next}\n`));
  }, 20_000);
});
