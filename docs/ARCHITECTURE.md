# Architecture

**Historical live architecture:** the sensor and ingest service were stopped
on 25 September 2026. The current public site renders a static rollup
snapshot; see [the archive record](ARCHIVE.md).

Hunang has one architectural rule that everything else serves: **data
flows one way, and the public never touches the honeypot.**

```
  Internet          Sensor host (Tier 1)          Coolify (Tier 2)           Vercel (Tier 3)
 (hostile bot)      one small VPS, disposable     ingest + private data      public dashboard
 ─────────────      ─────────────────────────     ─────────────────────      ────────────────

  ssh root@…  ──22──►  ┌────────┐   tails    ┌─────────┐  POST /v1/events  ┌──────────┐
  password spray       │ Cowrie │ ─JSON log─►│ shipper │ ──Bearer, HTTPS──►│  ingest  │
                       │ (fake  │            └─────────┘   (one-way,        │ function │
                       │ shell) │             batched, retried             └────┬─────┘
                       └────────┘                                                │ validate
                          ▲                                                      │ pseudonymize IP
                          │ egress lockdown (nftables):                          │ enrich (offline)
                          │ ONLY the POST above is allowed out                   ▼
                          │                                                 ┌──────────┐
                          └── attacker shell here can reach NOTHING else    │ Postgres │
                                                                            │  events  │
                                                                            └────┬─────┘
                                                                                 │ aggregation
                                                                                 │ (timer, 5 min)
                                                                                 ▼
                                                                            ┌──────────┐
                                                                            │ rollup_* │  anonymous
                                                                            │  tables  │  aggregates
                                                                            └────┬─────┘
                                                                                 │ rollups API
                                                                                 │ GET /v1/rollups
                                                                                 ▼  (HTTPS, read-only)
                                                                            ┌──────────┐
                                                                            │ Next.js  │ ──► browser
                                                                            │  (ISR)   │     (no raw
                                                                            └──────────┘      events,
                                                                                              no full IP)
```

Tiers 2 and 3 are **separate deployments on separate infrastructure**, not
one app. Tier 2 is a long-running Coolify service beside private Postgres;
Tier 3 is a Vercel project that receives only anonymous rollups from the data
tier. It also uses Vercel Web Analytics for anonymous, aggregate page-view
statistics. That
separation is load-bearing: only ingest holds the database credentials and
`IP_HASH_SECRET`, so compromising the public site yields no path to raw
events and no way to reverse the IP pseudonyms.

## Components

### Sensor (`honeypot/`)
- **Cowrie** — a medium-interaction honeypot. It emulates an SSH/Telnet
  server and a fake Unix shell. Attackers interact with a recording;
  there is no real command execution and no real filesystem. Config:
  `honeypot/cowrie/cowrie.cfg`.
- **Shipper** (`honeypot/shipper/`) — a small Node process that tails
  Cowrie's JSON event log into an fsynced, disk-backed FIFO, maps each line to
  the wire schema, and POSTs batches on UTC hour boundaries with retry/backoff.
  Its Cowrie checkpoint advances only after a record reaches the FIFO, and a
  batch leaves the FIFO only after ingest acknowledges it. Stable event IDs,
  keyed by a random local non-credential in the state volume, make
  crash/replay duplicates harmless without creating a guessable IP
  fingerprint in Postgres. The shipper holds only the write-only ingest token.

### Ingest (`ingest/`)
The only inbound path from the sensor, and it treats the sender as
hostile (because a compromised sensor *is*):
- **`server.ts`** — bearer auth (constant-time), 1 MB body cap, per-IP and
  global token-bucket rate limits, strict per-event validation, and no
  reflection of attacker-controlled content in responses or logs.
- **`schema.ts`** — zod wire schema (strict, length-capped, control chars
  stripped) and the normalize step.
- **`privacy.ts`** — HMAC pseudonymization + truncation of source IPs at
  write time. Raw IPs are never stored.
- **`sql.ts` / `db.ts` / `repository.ts`** — Postgres behind a narrow
  repository (parameterized statements only). `sql.ts` is the whole driver
  surface: node-postgres in production, PGlite (genuine Postgres compiled to
  WASM) in tests, so the test suite exercises the production dialect.
- **`aggregate.ts`** — scheduled job that folds new events into the lifetime
  aggregates, refreshes the windowed rollups, and enforces retention. Runs on
  a five-minute timer in the production self-hosted service.
- **`attck.ts`** — the reviewed, tested rule table mapping behaviors to
  MITRE ATT&CK techniques.
- **`read-server.ts` / `rollups.ts`** — a separate, public, read-only API
  (`GET /v1/rollups`) that serves the assembled rollup payload. It reads only
  `rollup_*` tables and has no write path. A read-only bearer token prevents
  arbitrary callers from waking Postgres; it is a cost gate, not a secrecy
  boundary, because the same payload is published by the web tier. The route
  never loads the ingest secrets — `runtime.ts` gives it its own entry point
  that does not read `INGEST_TOKEN` or
  `IP_HASH_SECRET`. It listens on its own port (`ROLLUPS_PORT`, default 8402)
  so the two paths can be routed and firewalled independently.
- **`api/`** — optional Vercel-compatible entry points (`/v1/events`,
  `/v1/rollups`, `/healthz`, `/cron/aggregate`). Thin wrappers only: every
  handler is the same code the self-hosted server runs, written against the Web
  `Request`/`Response` types with `node-adapter.ts` bridging node:http.

  `ingest/vercel.json` sets **`"framework": null`, and it must stay that
  way.** `package.json` has a `start` script pointing at `src/index.ts`, the
  long-running self-hosted server. Left to auto-detect, Vercel reads that as
  a Node server application, makes it the deployment entrypoint and routes
  every request — including static files — into it, where it throws on
  import. Setting the framework to null keeps the deployment what it is
  meant to be: `api/` functions plus the static `public/` directory.

### Datastore
Private Postgres on the production Coolify network (a container locally), two kinds of tables:
- `events` — pseudonymized raw telemetry, **retention-limited** (deleted
  after `RETENTION_DAYS`).
- `rollup_*` — pre-aggregated, anonymous tables. **The only data the
  public site reads.**

### Public site (`web/`)
Next.js with incremental static regeneration (5 min). `src/lib/data.ts`
**fetches** the anonymous rollups payload over HTTP from the ingest deployment's
read-only rollups API (`GET /v1/rollups`). The web tier has **no database
driver** and no path to raw events — it deploys cleanly to Vercel or any
Node host with only `HUNANG_ROLLUPS_URL` and the read-only
`HUNANG_ROLLUPS_TOKEN`. World map and time-series
charts are server-rendered SVG (no client charting libraries, no client
data beyond the ticker). The single client-side fetch is the ticker polling
this site's own `/api/stats` route, which returns rollup totals from the same
five-minute cache.

### Production compute cadence

The sensor flushes its durable queue at `:00`. The self-hosted ingest service
folds new events every five minutes, and the Vercel web tier caches anonymous
rollups for five minutes. The authenticated Coolify rollups response is
`no-store`, so intermediate edge regions cannot retain different aggregate
generations. `/healthz` checks process/config liveness without querying
Postgres.

## Why each boundary exists

| Boundary | Enforced by | Defeats |
|---|---|---|
| Sensor → only telemetry egress | nftables + Hetzner Cloud Firewall (`infra/`) | Pivot / payload phone-home / scanning |
| Sensor → ingest is one-way | the sensor can only POST; the ingest deployment exposes no shell, host or port to it | Attacker using telemetry channel as a foothold |
| Ingest secrets absent from the public site | separate Coolify ingest and Vercel web resources; only ingest holds `DATABASE_URL` and `IP_HASH_SECRET` | A web-tier compromise reversing IP pseudonyms |
| Ingest distrusts events | zod validation, prepared statements, rate limits | Malformed / injection / flooding from a popped sensor |
| Raw IP never stored | `privacy.ts` at write time | GDPR exposure, re-identification |
| Site reads rollups only | rollups API serves only `rollup_*` (`rollups.ts`); web has no DB driver | Raw events or full IPs reaching a browser |

## Swapping the datastore
Implement `SqlClient` (`src/sql.ts` — three methods) against another engine;
nothing above `repository.ts` references a driver. The public site is
unaffected either way: it reads through the rollups HTTP API, not the
datastore, so the storage engine is invisible to it.

Two dialect constraints any replacement must honour, both already the
subject of comments in the code: the fold relies on `ON CONFLICT ... DO
UPDATE` upserts and a transaction-scoped advisory lock, and every 64-bit
column is cast on read because node-postgres returns `bigint` as a string.

## Reproducing locally
`docker compose up --build` starts Postgres, seeds synthetic data and runs
ingest + web — no honeypot involved. The opt-in `sensor` profile adds a local,
loopback-only Cowrie + shipper to exercise the real capture path. See the
README and `docs/RUNBOOK.md`.
