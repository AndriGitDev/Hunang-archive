import { createHmac, randomUUID } from "node:crypto";

/**
 * Translates a Cowrie JSON log line into the wire event(s) the ingest
 * API expects. Pure and side-effect free so it can be unit tested.
 *
 * We only forward fields the dashboard needs. Notably we DO forward the
 * raw source IP — the ingest API pseudonymizes it. The shipper itself
 * never persists or displays it.
 */

export interface WireEvent {
  id: string;
  ts: string;
  type: string;
  src_ip: string;
  session?: string;
  protocol?: "ssh" | "telnet";
  username?: string;
  password?: string;
  success?: boolean;
  command?: string;
  url?: string;
  client_version?: string;
  duration?: number;
}

interface CowrieEvent {
  eventid?: string;
  timestamp?: string;
  src_ip?: string;
  session?: string;
  protocol?: string;
  username?: string;
  password?: string;
  input?: string;
  url?: string;
  outfile?: string;
  version?: string;
  duration?: number;
  [k: string]: unknown;
}

function isoTs(raw: string | undefined): string {
  const t = raw ? Date.parse(raw) : NaN;
  return Number.isFinite(t) ? new Date(t).toISOString() : new Date().toISOString();
}

function protocolOf(e: CowrieEvent): "ssh" | "telnet" | undefined {
  if (e.protocol === "telnet") return "telnet";
  if (e.protocol === "ssh") return "ssh";
  return undefined;
}

/**
 * Map one Cowrie event to zero or one wire events. Returns null for
 * Cowrie events we don't surface (there are many).
 */
export function mapCowrieEvent(e: CowrieEvent): WireEvent | null {
  if (!e.eventid || typeof e.src_ip !== "string" || e.src_ip.length === 0) return null;

  const base = {
    id: randomUUID(),
    ts: isoTs(e.timestamp),
    src_ip: e.src_ip,
    ...(e.session ? { session: String(e.session).slice(0, 64) } : {}),
    ...(protocolOf(e) ? { protocol: protocolOf(e)! } : {}),
  };

  switch (e.eventid) {
    case "cowrie.session.connect":
      return { ...base, type: "session_connect" };

    case "cowrie.client.version":
    case "cowrie.client.kex":
      if (typeof e.version !== "string") return null;
      return { ...base, type: "client_version", client_version: e.version.slice(0, 256) };

    case "cowrie.login.success":
    case "cowrie.login.failed":
      return {
        ...base,
        type: "login_attempt",
        username: String(e.username ?? "").slice(0, 256),
        password: String(e.password ?? "").slice(0, 256),
        success: e.eventid === "cowrie.login.success",
      };

    case "cowrie.command.input":
    case "cowrie.command.failed":
      if (typeof e.input !== "string") return null;
      return { ...base, type: "command", command: e.input.slice(0, 4096) };

    case "cowrie.session.file_download":
    case "cowrie.session.file_upload":
      return {
        ...base,
        type: "file_download",
        url: String(e.url ?? e.outfile ?? "").slice(0, 2048),
      };

    case "cowrie.session.closed":
      return {
        ...base,
        type: "session_closed",
        ...(typeof e.duration === "number" ? { duration: e.duration } : {}),
      };

    default:
      return null;
  }
}

/** Parse a raw log line; returns null on blank lines or bad JSON. */
export function parseLine(line: string): WireEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  let parsed: CowrieEvent;
  try {
    parsed = JSON.parse(trimmed) as CowrieEvent;
  } catch {
    return null;
  }
  return mapCowrieEvent(parsed);
}

/**
 * Stable UUID for one raw Cowrie record. Re-reading a line after a crash or
 * replaying an outage log must hit Postgres' idempotency key instead of
 * incrementing lifetime rollups twice.
 */
export function deterministicEventId(key: Buffer, sensor: string, line: string): string {
  const bytes = createHmac("sha256", key).update(sensor).update("\0").update(line).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
