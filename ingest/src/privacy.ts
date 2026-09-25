import { createHmac } from "node:crypto";

/**
 * Source IPs are personal data (GDPR). We never store them raw:
 *  - hashIp gives a keyed pseudonym so repeat sources can be counted
 *    without the IP being recoverable (HMAC, not plain hash, so it
 *    cannot be reversed by enumerating the IPv4 space).
 *  - truncateIp gives a coarse network prefix safe for public display.
 */

export function hashIp(ip: string, secret: string): string {
  return createHmac("sha256", secret).update(ip).digest("hex").slice(0, 16);
}

/** IPv4 → "a.b.c.0/24", IPv6 → "xxxx:xxxx:xxxx::/48". */
export function truncateIp(ip: string): string {
  if (ip.includes(":")) {
    const hextets = expandIpv6(ip);
    return `${hextets.slice(0, 3).join(":")}::/48`;
  }
  const parts = ip.split(".");
  return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
}

function expandIpv6(ip: string): string[] {
  // strip any IPv4-mapped tail ("::ffff:1.2.3.4") by converting it to hextets
  const v4tail = ip.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (v4tail) {
    const o = v4tail[2]!.split(".").map(Number);
    const h1 = ((o[0]! << 8) | o[1]!).toString(16);
    const h2 = ((o[2]! << 8) | o[3]!).toString(16);
    ip = `${v4tail[1]}${h1}:${h2}`;
  }
  const [head = "", tail = ""] = ip.split("::");
  const headParts = head ? head.split(":") : [];
  const tailParts = tail ? tail.split(":") : [];
  const missing = 8 - headParts.length - tailParts.length;
  const full = [...headParts, ...Array(Math.max(missing, 0)).fill("0"), ...tailParts];
  return full.map((h) => h.padStart(4, "0"));
}
