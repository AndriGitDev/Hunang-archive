import { open, type Reader } from "maxmind";
import type { CountryResponse, AsnResponse } from "maxmind";
import type { Enricher } from "./schema.js";
import { NO_ENRICHMENT } from "./schema.js";

/**
 * Optional offline enrichment from local MaxMind GeoLite2 databases.
 * No network lookups — enrichment never sends an attacker's IP to a third
 * party, which is what lets docs/DATA-HANDLING.md claim no external transfers.
 * Without the databases, sources simply aggregate as "Unknown".
 *
 * The COUNTRY edition is used rather than CITY: the dashboard only ever shows
 * country and ASN, and Country (~9 MB) plus ASN (~10 MB) fit comfortably in a
 * serverless function bundle where City (~70 MB) would dominate it.
 */
export async function buildEnricher(
  countryDbPath: string | null,
  asnDbPath: string | null,
): Promise<Enricher> {
  let country: Reader<CountryResponse> | null = null;
  let asn: Reader<AsnResponse> | null = null;
  try {
    if (countryDbPath) country = await open<CountryResponse>(countryDbPath);
    if (asnDbPath) asn = await open<AsnResponse>(asnDbPath);
  } catch (err) {
    // A missing or unreadable database must not take the ingest path down;
    // events still store fine, they just aggregate as "Unknown".
    console.warn("[geo] enrichment disabled:", err instanceof Error ? err.message : err);
    return NO_ENRICHMENT;
  }
  if (!country && !asn) return NO_ENRICHMENT;

  return (ip: string) => {
    let iso: string | null = null;
    let asNumber: number | null = null;
    let asOrg: string | null = null;
    try {
      iso = country?.get(ip)?.country?.iso_code ?? null;
      const a = asn?.get(ip);
      asNumber = a?.autonomous_system_number ?? null;
      asOrg = a?.autonomous_system_organization ?? null;
    } catch {
      // unparseable IP — schema validation should prevent this; degrade to null
    }
    return { country: iso, asn: asNumber, asn_org: asOrg };
  };
}
