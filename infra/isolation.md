# Isolation model

The sensor is treated as **already compromised**. Isolation is what makes
that assumption survivable: when (not if) an attacker gets a shell on the
sensor, there is nothing reachable, nothing worth stealing, and nowhere
to go.

## The three tiers, and what connects them

```
            INTERNET (hostile)
                 │  tcp/22, tcp/23  (the bait — open to all)
                 ▼
   ┌─────────────────────────────────┐
   │  TIER 1 · SENSOR                 │   Its own Hetzner project, alone.
   │  ─ Cowrie (emulated shell)       │   No private network. No peering.
   │  ─ shipper                       │   Holds ONE secret: a write-only
   │  ─ nftables egress lockdown      │   ingest token. No keys to anything.
   └───────────────┬─────────────────┘   Disposable: rebuild from image.
                   │
                   │  ONE-WAY, authenticated, outbound only:
                   │  POST to fixed-IP HTTPS ingest origin  (Bearer)
                   │  No inbound path from ingest back to the sensor.
                   ▼
   ┌─────────────────────────────────┐
   │  TIER 2 · INGEST + DATA          │   Self-managed Coolify service with
   │  ─ ingest API (validates,        │   private Postgres. The sensor can
   │     rate-limits, pseudonymizes)  │   reach only its HTTPS write route.
   │  ─ Postgres (events + rollups)   │   Holds DATABASE_URL and
   │  ─ aggregation + retention       │   IP_HASH_SECRET. Validates every
   └───────────────┬─────────────────┘   event; trusts nothing the sensor sends.
                   │
                   │  GET /v1/rollups  (HTTPS, read-only, anonymous aggregates)
                   ▼
   ┌─────────────────────────────────┐
   │  TIER 3 · PUBLIC SITE            │   A separate Vercel project. Fetches
   │  ─ Next.js (static/ISR)          │   rollups over HTTPS; holds no DB
   │  ─ no raw events, no full IPs    │   driver and neither ingest secret.
   └─────────────────────────────────┘   Never touches Tier 1 or 2's raw data.
```

Tiers 2 and 3 being separate **deployments on separate infrastructure** is
the whole point: it keeps `IP_HASH_SECRET` out of the public-facing Vercel
deployment. Merging them would collapse the boundary while looking like a
simplification.

## Rules that make the boundary real

1. **Separate cloud project for the sensor.** Not just a separate VM — a
   separate blast-radius domain, containing only the sensor. Hetzner has no
   account-level perimeter equivalent to an AWS account, so the project
   boundary plus an empty project is what does this work here.
2. **No private network, no peering, no shared VPN.** The sensor has no
   network route to any real system. Lateral movement has nowhere to go —
   there is literally no other host in its project.
3. **No shared secrets.** The sensor holds a single write-only ingest
   token. It has no database credentials, no cloud API keys, no SSH keys
   to other hosts, no access to a secrets manager.
4. **One-way data flow.** The sensor only ever makes an *outbound* POST to
   ingest. Ingest never connects back — it has no address for the sensor and
   no route to one. The public site never connects to either. Direction is
   enforced by firewall and topology, not convention.
5. **Ingest distrusts the sensor.** Even though the sensor is "ours," the
   ingest API validates, normalizes, and rate-limits every event as if the
   sender were hostile — because after compromise, it is.
6. **Disposable sensor.** The sensor is cattle: provisioned from an image,
   rebuilt on a schedule or on suspicion. Nothing of value lives on it.

## Token scope

The ingest token authenticates exactly one action: `POST /v1/events`. It
cannot read data, cannot query, cannot administer. The worst a stolen
token does is let someone submit junk events — which are schema-validated,
rate-limited, and trivially rotated (see `docs/RUNBOOK.md`). It is not a
path to anything real.
