# Data handling, privacy & GDPR

**Archive status:** collection ended on 25 September 2026. The public site
shows only a dated anonymous rollup snapshot. The collection and retention
details below describe the former live system; see [the archive record](ARCHIVE.md).
The stopped private database and a restricted host-local backup remain with
the owner. Automated event purging does not run while that service is stopped,
so the former 30-day live retention schedule is not an ongoing archive purge.

Source IP addresses are **personal data** under the GDPR (confirmed by
*Breyer v. Germany*, C-582/14 — even dynamic IPs are personal data when
they can be combined with other data to identify someone). Hunang treats
them as such from the moment they arrive. This is a deliberate feature,
not an afterthought.

## What is collected

A honeypot only ever sees unsolicited, automated connection attempts to a
decoy machine. For each, Cowrie records: source IP, timestamp, protocol,
the username/password tried, any commands typed into the emulated shell,
attempted download URLs, and the client's SSH version banner.

## What is stored, and how it's protected

| Field | At rest in `events` | On the public site |
|---|---|---|
| Source IP | **Never stored raw.** Replaced at ingest with (a) a keyed HMAC-SHA256 pseudonym and (b) a truncated network prefix (`/24` IPv4, `/48` IPv6). | Only aggregate counts (per country, per ASN). No individual IP, truncated or otherwise, is listed. |
| Country / ASN | Derived from the IP via **local** database files bundled with the ingest deployment (DB-IP Lite by default; no third-party lookup — the address is never sent anywhere). | Aggregate counts only. |
| Username / password | Stored as typed by the bot. | Shown in the credential leaderboard (these are bot-submitted dictionary values, not anyone's real credentials). |
| Commands | Stored as typed. | Aggregate "top commands" and ATT&CK tallies. |
| Timestamps | Stored. | Bucketed into hourly/daily counts. |

### Why HMAC, not a plain hash
A plain `sha256(ip)` is reversible for IPv4: an attacker can hash all 4
billion addresses and match. Using `HMAC(secret, ip)` with a secret that
never leaves the server makes the pseudonym non-reversible by enumeration.
The pseudonym still lets us count distinct sources without ever holding
the IP.

### Truncation
`203.0.113.77 → 203.0.113.0/24`. Even the truncated prefix is never
published per-source; it exists so de-duplication and any internal
debugging work at network granularity rather than host granularity.

## Retention

- **Raw events** (already pseudonymized): deleted after
  `RETENTION_DAYS` (default **30 days**). Enforced automatically on every
  aggregation cycle (hourly), and on demand via the aggregation
  endpoint or `run-aggregate.ts`. A raw event is only ever deleted *after* its
  contribution has been folded into the anonymous lifetime aggregates, so
  the purge never removes information that is still needed.
- **Anonymous rollups** (the numbers on the site): retained indefinitely,
  and genuinely cumulative — each event is folded into the lifetime totals
  and leaderboards exactly once, so the figures keep growing for the life
  of the sensor rather than rolling off with the 30-day raw-event window.
  They contain no IPs and no per-source data — they cannot identify anyone.
- **Distinct-source set** (`distinct_sources`): to count *unique* sources
  over the full history without keeping raw events, the ingest DB retains a
  set of the keyed HMAC pseudonyms — **and nothing else**: no IP, no
  timestamp, no counts, no associated activity, just the opaque token. It is non-reversible (the HMAC secret never leaves the server) and
  rotating `IP_HASH_SECRET` breaks any cross-rotation correlation. It exists
  solely so the "distinct sources" number is a lifetime figure.

## Lawful basis & proportionality (GDPR posture)

- **Lawful basis:** legitimate interest (Art. 6(1)(f)) — operating and
  publishing security telemetry about automated attacks, balanced against
  data-subject rights. The "data subjects" here are overwhelmingly
  compromised machines run by botnets, not the individuals behind them,
  and the processing is minimal.
- **Data minimization (Art. 5(1)(c)):** no raw IP is ever stored; only
  what's needed to produce aggregate statistics is kept.
- **Storage limitation (Art. 5(1)(e)):** the 30-day window on raw events.
- **Privacy-preserving analytics:** the public site sets no cookies and uses
  Vercel Web Analytics for anonymous, aggregate page-view statistics. Vercel
  derives a daily visitor hash from each request and does not associate the
  resulting analytics events with an individual or retain a cross-day visitor
  identity. No custom events are collected.
- **Transfers and processors:** GeoIP enrichment is done with local database
  files bundled into the deployment (DB-IP Lite, CC BY 4.0, attributed on the
  site) — an observed IP is never sent anywhere for lookup. The ingest tier
  and private Postgres run on Kastro Labs' self-managed Coolify infrastructure
  in the EU. Vercel serves the public site, receives anonymous rollup responses,
  and processes the anonymous page-view events described above. It never
  receives raw attack events or the IP-hash secret. No data is sold, shared for
  advertising, or transferred to any other party.

  Being precise about what those processors can see: the stored records
  contain no raw IP addresses at all, only HMAC pseudonyms and `/24`
  network prefixes. The HMAC secret is held in the ingest deployment's
  environment, so a processor with database access alone still cannot
  reverse a pseudonym to an address.

## Data-subject requests

Because IPs are pseudonymized with a secret and truncated, Hunang
generally **cannot** re-identify a specific individual or single out their
records — by design. If you believe your address appears and you want it
addressed, contact the owner via <https://andri.is> with the relevant
details and time window; the corresponding pseudonymized records can be
located by re-deriving the HMAC and removed, and the affected rollups
recomputed. In most cases the 30-day retention will already have purged
raw records.

## What the site tells visitors

A short version of this note is published on the public dashboard under
**Method & data handling**, including the retention window, the
pseudonymization approach, and the cookieless anonymous analytics posture, so
the policy is visible without reading the repository.
