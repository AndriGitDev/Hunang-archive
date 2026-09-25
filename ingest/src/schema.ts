import { z } from "zod";

/**
 * Wire schema for events POSTed by the shipper.
 *
 * Defensive stance: the sender lives on the honeypot host and must be
 * assumed compromised. Every field is length-capped, control characters
 * are stripped, unknown keys are rejected, and nothing from here is ever
 * interpolated into SQL (prepared statements only) or HTML (the site
 * renders through React, and only from rollups).
 */

export const EVENT_TYPES = [
  "session_connect",
  "login_attempt",
  "command",
  "file_download",
  "client_version",
  "session_closed",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

const stripControl = (s: string) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");

const safeString = (max: number) => z.string().max(max).transform(stripControl);

export const eventSchema = z
  .object({
    id: z.string().uuid(),
    ts: z
      .string()
      .datetime({ offset: true })
      .refine((s) => {
        const t = Date.parse(s);
        // reject timestamps more than 10 minutes in the future or before 2020
        return t < Date.now() + 10 * 60_000 && t > Date.UTC(2020, 0, 1);
      }, "timestamp out of plausible range"),
    type: z.enum(EVENT_TYPES),
    src_ip: z.string().ip(),
    session: safeString(64).optional(),
    protocol: z.enum(["ssh", "telnet"]).optional(),
    username: safeString(256).optional(),
    password: safeString(256).optional(),
    success: z.boolean().optional(),
    command: safeString(4096).optional(),
    url: safeString(2048).optional(),
    client_version: safeString(256).optional(),
    duration: z.number().min(0).max(7 * 24 * 3600).optional(),
  })
  .strict()
  .superRefine((e, ctx) => {
    if (e.type === "login_attempt" && (e.username === undefined || e.password === undefined)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "login_attempt requires username and password" });
    }
    if (e.type === "command" && e.command === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "command event requires command" });
    }
  });

export const batchSchema = z
  .object({
    sensor: safeString(64).pipe(z.string().min(1).regex(/^[\w.-]+$/, "sensor must be a simple token")),
    // When the sensor's shipper process started. Used to anchor the
    // "first attack after going live" stat to when the SENSOR came online,
    // not when the ingest DB was created (they differ under the documented
    // deploy order: ingest up first, sensor later). Plausibility-bounded
    // like event timestamps so a compromised sensor can't forge a wild value.
    sensor_boot_ts: z
      .string()
      .datetime({ offset: true })
      .refine((s) => {
        const t = Date.parse(s);
        return t < Date.now() + 10 * 60_000 && t > Date.UTC(2020, 0, 1);
      }, "sensor_boot_ts out of plausible range")
      .optional(),
    events: z.array(z.unknown()).min(1).max(500),
  })
  .strict();

export type WireEvent = z.infer<typeof eventSchema>;

/** Event after privacy transform + enrichment, ready for storage. */
export interface StoredEvent {
  id: string;
  sensor: string;
  ts: number; // epoch ms
  type: EventType;
  src_ip_hash: string;
  src_ip_trunc: string;
  country: string | null; // ISO 3166-1 alpha-2
  asn: number | null;
  asn_org: string | null;
  session: string | null;
  protocol: string | null;
  username: string | null;
  password: string | null;
  success: 0 | 1 | null;
  command: string | null;
  url: string | null;
  client_version: string | null;
  duration: number | null;
}

export interface Enrichment {
  country: string | null;
  asn: number | null;
  asn_org: string | null;
}

export type Enricher = (ip: string) => Enrichment;

export const NO_ENRICHMENT: Enricher = () => ({ country: null, asn: null, asn_org: null });

export function normalizeEvent(
  e: WireEvent,
  sensor: string,
  ipHashSecret: string,
  enrich: Enricher,
  privacy: { hashIp: (ip: string, secret: string) => string; truncateIp: (ip: string) => string },
): StoredEvent {
  const enr = enrich(e.src_ip);
  return {
    id: e.id,
    sensor,
    ts: Date.parse(e.ts),
    type: e.type,
    src_ip_hash: privacy.hashIp(e.src_ip, ipHashSecret),
    src_ip_trunc: privacy.truncateIp(e.src_ip),
    country: enr.country,
    asn: enr.asn,
    asn_org: enr.asn_org,
    session: e.session ?? null,
    protocol: e.protocol ?? null,
    username: e.username ?? null,
    password: e.password ?? null,
    success: e.success === undefined ? null : e.success ? 1 : 0,
    command: e.command ?? null,
    url: e.url ?? null,
    client_version: e.client_version ?? null,
    duration: e.duration ?? null,
  };
}
