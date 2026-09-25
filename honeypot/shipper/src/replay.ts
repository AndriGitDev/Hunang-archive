import { createReadStream, readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import { deterministicEventId, parseLine, type WireEvent } from "./map.js";

/**
 * Idempotently replay preserved Cowrie JSON logs into the ingest API.
 *
 * This is an operator recovery tool, not the live tailer. It deliberately
 * keeps no second checkpoint: deterministic event IDs make rerunning the
 * same files safe, while the original Cowrie logs remain the durable source.
 */

const INGEST_URL = required("INGEST_URL");
const INGEST_TOKEN = required("INGEST_TOKEN");
const SENSOR_NAME = process.env.SENSOR_NAME ?? "hp-hel1";
const STATE_DIR = process.env.SHIPPER_STATE_DIR ?? "/state";
const SENSOR_BOOT_TS = process.env.REPLAY_SENSOR_BOOT_TS || null;
const DELAY_MS = positiveInt(process.env.REPLAY_DELAY_MS, 2_100);
const MAX_BATCH_EVENTS = 500;
const MAX_BATCH_BYTES = 900_000;
const paths = process.argv.slice(2);

if (paths.length === 0) {
  console.error("usage: npm run replay -- /cowrie/var/log/cowrie/cowrie.json.2026-08-06 [...]");
  process.exit(2);
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing required env ${name}`);
  return value;
}

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const encodedKey = readFileSync(`${STATE_DIR}/event-id-key`, "utf8").trim();
if (!/^[0-9a-f]{64}$/.test(encodedKey)) throw new Error("invalid shipper event-id key");
const idKey = Buffer.from(encodedKey, "hex");

let lines = 0;
let mapped = 0;
let accepted = 0;
let duplicate = 0;
let rejected = 0;
let batches = 0;
let batch: WireEvent[] = [];
let batchBytes = 256;

for (const path of paths) {
  const source = createReadStream(path);
  const input = path.endsWith(".gz") ? source.pipe(createGunzip()) : source;
  const reader = createInterface({ input, crlfDelay: Infinity });
  for await (const line of reader) {
    lines += 1;
    const event = parseLine(line);
    if (!event) continue;
    event.id = deterministicEventId(idKey, SENSOR_NAME, line);
    const eventBytes = Buffer.byteLength(JSON.stringify(event)) + 1;
    if (batch.length > 0 && (batch.length >= MAX_BATCH_EVENTS || batchBytes + eventBytes > MAX_BATCH_BYTES)) {
      await sendBatch(batch);
      batch = [];
      batchBytes = 256;
    }
    batch.push(event);
    batchBytes += eventBytes;
    mapped += 1;
  }
  console.log(`[replay] scanned ${path}; ${lines} raw lines, ${mapped} mapped events`);
}

if (batch.length > 0) await sendBatch(batch);
console.log(
  `[replay] complete: ${lines} raw lines, ${mapped} mapped, ${accepted} accepted, ${duplicate} duplicate, ${rejected} rejected`,
);

async function sendBatch(events: WireEvent[]): Promise<void> {
  const envelope = {
    sensor: SENSOR_NAME,
    ...(SENSOR_BOOT_TS ? { sensor_boot_ts: SENSOR_BOOT_TS } : {}),
    events,
  };
  const body = JSON.stringify(envelope);
  const backoff = [2_000, 5_000, 10_000, 20_000, 30_000];

  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await fetch(INGEST_URL, {
        method: "POST",
        headers: {
          authorization: `Bearer ${INGEST_TOKEN}`,
          "content-type": "application/json",
        },
        body,
        signal: AbortSignal.timeout(30_000),
      });
      if (response.ok) {
        const result = (await response.json()) as {
          accepted?: number;
          duplicate?: number;
          rejected?: number;
        };
        accepted += result.accepted ?? 0;
        duplicate += result.duplicate ?? 0;
        rejected += result.rejected ?? 0;
        batches += 1;
        if (batches % 20 === 0) {
          console.log(
            `[replay] ${batches} batches: ${accepted} accepted, ${duplicate} duplicate, ${rejected} rejected`,
          );
        }
        await sleep(DELAY_MS);
        return;
      }
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        throw new Error(`ingest rejected replay batch with status ${response.status}`);
      }
      if (attempt >= backoff.length) throw new Error(`ingest unavailable after retries (${response.status})`);
    } catch (error) {
      if (attempt >= backoff.length) throw error;
    }
    await sleep(backoff[Math.min(attempt, backoff.length - 1)]!);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
