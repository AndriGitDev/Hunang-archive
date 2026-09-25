import { defaultGeoipPath } from "../src/runtime.js";

/**
 * GET /healthz — cheap process/config liveness for the ingest deployment.
 * It deliberately does NOT touch Postgres: liveness probes should not create
 * database load or turn a database outage into a restart loop. Database
 * readiness is covered by aggregation freshness in the rollups payload.
 *
 * Also reports whether the bundled GeoIP databases are resolvable — their
 * absence is otherwise invisible until the country board fills with "??",
 * which is exactly how a path bug once disabled enrichment silently.
 * Reveals nothing about the data itself.
 */
export async function GET(): Promise<Response> {
  const geoip = {
    country: (process.env.GEOIP_COUNTRY_DB || defaultGeoipPath("country.mmdb")) !== null,
    asn: (process.env.GEOIP_ASN_DB || defaultGeoipPath("asn.mmdb")) !== null,
  };
  return json(200, { ok: true, database: "unchecked", geoip });
}

export const HEAD = GET;

function json(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
