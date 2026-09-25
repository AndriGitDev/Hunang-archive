import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type { WireEvent } from "./map.js";

/**
 * Small disk-backed FIFO for telemetry awaiting acknowledgement.
 *
 * Appends are fsynced before the Cowrie read checkpoint advances. A crash
 * after ingest accepts a batch but before ack() rewrites the file can only
 * cause a replay; deterministic event IDs make that replay harmless.
 */
export class DurableSpool {
  private readonly pending: WireEvent[];

  constructor(
    private readonly file: string,
    private readonly maxBytes: number,
  ) {
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    this.pending = this.load();
  }

  get length(): number {
    return this.pending.length;
  }

  peek(limit: number): WireEvent[] {
    return this.pending.slice(0, limit);
  }

  append(event: WireEvent): void {
    const line = `${JSON.stringify(event)}\n`;
    const bytes = Buffer.byteLength(line);
    const current = existsSync(this.file) ? statSync(this.file).size : 0;
    if (current + bytes > this.maxBytes) {
      throw new Error(`spool limit reached (${this.maxBytes} bytes)`);
    }

    const fd = openSync(this.file, "a", 0o600);
    try {
      writeSync(fd, line);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    this.pending.push(event);
  }

  ack(count: number): void {
    if (!Number.isInteger(count) || count < 0 || count > this.pending.length) {
      throw new Error(`invalid spool acknowledgement: ${count}`);
    }
    if (count === 0) return;
    const remaining = this.pending.slice(count);
    this.rewrite(remaining);
    this.pending.splice(0, count);
  }

  private load(): WireEvent[] {
    if (!existsSync(this.file)) return [];
    const raw = readFileSync(this.file, "utf8");
    const lines = raw.split("\n");
    const trailingPartial = lines.pop() ?? "";
    const events: WireEvent[] = [];

    for (const [index, line] of lines.entries()) {
      if (!line) continue;
      try {
        events.push(JSON.parse(line) as WireEvent);
      } catch {
        throw new Error(`corrupt spool record at line ${index + 1}`);
      }
    }

    // A power loss can leave only the final append torn. Keep every complete
    // record and atomically trim that partial tail before accepting more.
    if (trailingPartial !== "") this.rewrite(events);
    return events;
  }

  private rewrite(events: WireEvent[] = this.pending): void {
    const temp = join(dirname(this.file), `.${process.pid}-${Date.now()}.tmp`);
    const body = events.map((event) => JSON.stringify(event)).join("\n");
    writeFileSync(temp, body === "" ? "" : `${body}\n`, { encoding: "utf8", mode: 0o600 });
    const fd = openSync(temp, "r");
    try {
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(temp, this.file);
  }
}
