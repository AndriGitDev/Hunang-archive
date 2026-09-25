import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import type { Stats } from "node:fs";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { deterministicEventId, parseLine, type WireEvent } from "./map.js";
import { DurableSpool } from "./spool.js";

/**
 * Tails Cowrie's JSON log into a durable FIFO and POSTs acknowledged batches
 * to ingest in an hourly, UTC-aligned window. The FIFO makes endpoint outages
 * and container restarts replay-safe instead of lossy while keeping routine
 * delivery traffic sparse and predictable.
 */

const INGEST_URL = required("INGEST_URL");
const INGEST_TOKEN = required("INGEST_TOKEN");
const COWRIE_LOG = process.env.COWRIE_LOG ?? "/cowrie/var/log/cowrie/cowrie.json";
const SENSOR_NAME = process.env.SENSOR_NAME ?? "hp-1";
const STATE_DIR = process.env.SHIPPER_STATE_DIR ?? "/state";
// 200 worst-case 4 KiB command records remain below ingest's 1 MB body cap.
const BATCH_SIZE = 200;
const FLUSH_INTERVAL_MS = positiveInt(process.env.SHIPPER_FLUSH_INTERVAL_SECONDS, 3600) * 1000;
const MAX_SPOOL_BYTES = positiveInt(process.env.SHIPPER_MAX_SPOOL_BYTES, 256 * 1024 * 1024);
const REPLAY_SINCE_MS = replaySince(process.env.SHIPPER_REPLAY_SINCE);
const SENSOR_BOOT_TS = new Date().toISOString();

interface Checkpoint {
  identity: string;
  offset: number;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`[shipper] missing required env ${name}`);
    process.exit(1);
  }
  return value;
}

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function replaySince(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error("SHIPPER_REPLAY_SINCE must be an ISO timestamp");
  return parsed;
}

mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 });
const checkpointFile = join(STATE_DIR, "cowrie-checkpoint.json");
const idKey = loadOrCreateIdKey();
const spool = new DurableSpool(join(STATE_DIR, "pending.ndjson"), MAX_SPOOL_BYTES);

function loadOrCreateIdKey(): Buffer {
  const file = join(STATE_DIR, "event-id-key");
  if (!existsSync(file)) {
    writeFileSync(file, randomBytes(32).toString("hex"), { encoding: "utf8", mode: 0o600, flag: "wx" });
  }
  const encoded = readFileSync(file, "utf8").trim();
  if (!/^[0-9a-f]{64}$/.test(encoded)) throw new Error("invalid shipper event-id key");
  return Buffer.from(encoded, "hex");
}

function loadCheckpoint(): Checkpoint | null {
  try {
    const parsed = JSON.parse(readFileSync(checkpointFile, "utf8")) as Partial<Checkpoint>;
    if (typeof parsed.identity === "string" && Number.isInteger(parsed.offset) && parsed.offset! >= 0) {
      return parsed as Checkpoint;
    }
  } catch {
    // A missing or torn checkpoint is safe: replaying with deterministic IDs
    // can duplicate delivery attempts but cannot duplicate stored events.
  }
  return null;
}

function saveCheckpoint(value: Checkpoint): void {
  const temp = `${checkpointFile}.tmp`;
  writeFileSync(temp, JSON.stringify(value), { encoding: "utf8", mode: 0o600 });
  renameSync(temp, checkpointFile);
}

function identityOf(stats: Stats): string {
  return `${stats.dev}:${stats.ino}`;
}

let checkpoint = loadCheckpoint();
let reading = false;
let lastReadError = "";

async function readNewLines(): Promise<void> {
  if (reading || !existsSync(COWRIE_LOG)) return;
  reading = true;
  try {
    const stats = statSync(COWRIE_LOG);
    const identity = identityOf(stats);
    if (checkpoint === null) {
      // Normal deploys start at the tail. During a known outage, an operator
      // can set SHIPPER_REPLAY_SINCE once to scan the active log from byte zero
      // while enqueueing only records at or after the requested timestamp.
      checkpoint = { identity, offset: REPLAY_SINCE_MS === null ? stats.size : 0 };
      saveCheckpoint(checkpoint);
      if (checkpoint.offset === stats.size) return;
    }
    if (checkpoint.identity !== identity || checkpoint.offset > stats.size) {
      // Rotation or truncation. Replaying the active file from byte zero is
      // safer than skipping it; stable event IDs make overlap harmless.
      checkpoint = { identity, offset: 0 };
    }
    if (checkpoint.offset === stats.size) return;

    let carry = Buffer.alloc(0);
    const stream = createReadStream(COWRIE_LOG, { start: checkpoint.offset });
    for await (const chunk of stream) {
      carry = Buffer.concat([carry, chunk as Buffer]);
      let newline: number;
      while ((newline = carry.indexOf(0x0a)) !== -1) {
        const record = carry.subarray(0, newline);
        carry = carry.subarray(newline + 1);
        const consumed = newline + 1;
        const line = record.toString("utf8").replace(/\r$/, "");
        const event = parseLine(line);
        if (event && (REPLAY_SINCE_MS === null || Date.parse(event.ts) >= REPLAY_SINCE_MS)) {
          event.id = deterministicEventId(idKey, SENSOR_NAME, line);
          spool.append(event);
        }
        checkpoint.offset += consumed;
        saveCheckpoint(checkpoint);
      }
    }
    lastReadError = "";
  } catch (error) {
    const message = (error as Error).message;
    if (message !== lastReadError) console.error(`[shipper] tail paused: ${message}`);
    lastReadError = message;
  } finally {
    reading = false;
  }
}

async function postBatch(events: WireEvent[]): Promise<boolean> {
  const body = JSON.stringify({ sensor: SENSOR_NAME, sensor_boot_ts: SENSOR_BOOT_TS, events });
  const backoff = [1000, 2000, 4000, 8000, 16000];
  for (let attempt = 0; attempt <= backoff.length; attempt++) {
    try {
      const res = await fetch(INGEST_URL, {
        method: "POST",
        headers: {
          authorization: `Bearer ${INGEST_TOKEN}`,
          "content-type": "application/json",
        },
        body,
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) return true;
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        console.error(`[shipper] ingest rejected batch (${res.status}); retaining ${events.length} events`);
        return false;
      }
    } catch (error) {
      if (attempt === backoff.length) {
        console.error(`[shipper] retaining batch after retries:`, (error as Error).message);
        return false;
      }
    }
    if (attempt < backoff.length) await sleep(backoff[attempt]!);
  }
  return false;
}

let flushing = false;
async function flush(): Promise<void> {
  if (flushing || spool.length === 0) return;
  flushing = true;
  try {
    while (spool.length > 0) {
      const batch = spool.peek(BATCH_SIZE);
      if (!(await postBatch(batch))) break;
      spool.ack(batch.length);
      console.log(`[shipper] acknowledged ${batch.length} events; ${spool.length} pending`);
    }
  } finally {
    flushing = false;
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function scheduleFlush(): void {
  const delay = FLUSH_INTERVAL_MS - (Date.now() % FLUSH_INTERVAL_MS);
  setTimeout(() => {
    void flush().finally(scheduleFlush);
  }, delay);
}

function main(): void {
  console.log(
    `[shipper] tailing ${COWRIE_LOG} → ${INGEST_URL} as ${SENSOR_NAME}; ${spool.length} events pending`,
  );
  if (checkpoint === null && REPLAY_SINCE_MS !== null) {
    console.log(`[shipper] first-run replay enabled since ${new Date(REPLAY_SINCE_MS).toISOString()}`);
  }
  void readNewLines();
  setInterval(() => void readNewLines(), 1000);
  scheduleFlush();

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      void readNewLines()
        .then(flush)
        .finally(() => process.exit(0));
    });
  }
}

main();
