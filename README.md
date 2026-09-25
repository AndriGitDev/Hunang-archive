<img src="web/src/app/icon.svg" width="48" align="right" alt="" />

# Hunang

**Archived on 25 September 2026.** The sensor and ingest services are stopped.
[Read the report](https://hunang.kastro.is/) or
[explore the anonymous results](https://hunang.kastro.is/results). The site
uses a dated, checked-in rollup snapshot; it does not require a live honeypot
or database. See [the archive guide](docs/ARCHIVE.md) for the evidence scope
and shutdown record. The deployment material below documents the original
experiment and is not needed to run the archive.

The source code is available under the [MIT license](LICENSE). The bundled
fonts retain their own licenses:
[Outfit](web/src/fonts/LICENSE-OFL.txt) and
[Space Mono](web/src/fonts/SPACE-MONO-OFL.txt).

**A [Kastro Labs](https://kastro.is) project — a honeypot, and an honest accounting of what hit it.**

Hunang (Icelandic for *honey*) ran an internet-facing SSH/Telnet honeypot,
captured attack telemetry, and published it on a public dashboard. The
point it makes: within minutes of putting a machine online, automated bots
are guessing its passwords — relentlessly, around the clock.

The framing matters, so here it is up front: **this is not evidence of
skilled attackers targeting anyone.** It is indiscriminate, automated
background noise — botnets spraying default credentials at the entire IPv4
space. That noise is exactly why default passwords and exposed admin ports
get machines compromised. The accuracy is the point.

## Safety model (read this first)

A honeypot is an attacker-controlled box by design. The one unacceptable
outcome is it being used to attack anyone else. Hunang's design assumes the
sensor **will** be compromised and makes that not matter:

1. **Low-interaction sensor.** The sensor is [Cowrie](https://github.com/cowrie/cowrie),
   an established medium-interaction honeypot that *emulates* a shell. Nothing
   hand-rolled, nothing genuinely exploitable by design.
2. **Egress locked down.** The sensor host drops all outbound traffic except
   the telemetry channel (and DNS/NTP). Rules are code: [`infra/nftables.conf`](infra/nftables.conf).
3. **Total isolation.** The sensor host holds no credentials for, and has no
   network path to, any real infrastructure. Its only secret is a
   write-only ingest token that can post events and nothing else.
4. **One-way data flow.** During collection: `sensor → ingest API → Postgres
   → rollups API → public site`. The archived site now reads a checked-in
   anonymous snapshot. It holds no database driver or ingest credentials,
   and raw events never reach a browser.
5. **Privacy by default.** Source IPs are personal data under GDPR. They are
   HMAC-hashed and truncated at ingest, never stored raw, and raw events are
   deleted after 30 days. See [`docs/DATA-HANDLING.md`](docs/DATA-HANDLING.md).

The full threat model of the system itself — what happens if the sensor is
popped, and why the blast radius is one disposable VM — is in
[`docs/SECURITY.md`](docs/SECURITY.md).

## What the original dashboard showed

- **Live counters** — total attacks, last 24 h, and how long after going
  live the first attack arrived.
- **World map** — where the traffic comes from (aggregate counts only).
- **IPv4 versus IPv6** — the split of login attempts reaching the dual-stack sensor over the last 24 hours.
- **Credential leaderboard** — the username/password pairs bots actually try.
- **MITRE ATT&CK mapping** — observed behaviors classified to technique IDs.
- **"What would have stopped this"** — per attack class, the boring control
  that defeats it.
- **Honest framing + data handling** — what this is, what it isn't, and how
  the data is treated.

## Repository layout

| Path | What |
|---|---|
| `honeypot/` | Cowrie config, container setup, and the log shipper |
| `ingest/` | Hardened ingest API, event schema, datastore, aggregation, tests |
| `web/` | Next.js archive, static results and downloadable rollups |
| `infra/` | Egress firewall rules as code, sensor compose, isolation notes |
| `docs/` | Architecture, security threat model, runbook, data handling |

Country and network (ASN) data is from [DB-IP](https://db-ip.com) under
CC BY 4.0, downloaded at build time and queried locally — an observed
address is never sent to a third party.

## Run the archive locally

The archive needs no database or sensor:

```sh
cd web
npm ci
npm run dev
```

Open <http://localhost:3000>. The source snapshot is
[`web/src/archive/final-rollups.json`](web/src/archive/final-rollups.json).
The public download at `/archive/rollups.json` is the same data.

## Historical ingest and sensor demo

The former live stack can be run locally to inspect the collection pipeline.
It seeds a local Postgres with synthetic events; the archive site continues to
show its fixed historical snapshot.

```sh
cp .env.example .env
docker compose up --build
docker compose --profile sensor up --build
ssh -p 2222 root@localhost   # Cowrie is loopback-only
```

### Validate the code

```sh
cd ingest && npm ci && npm test && npm run typecheck
cd ../honeypot/shipper && npm ci && npm test && npm run typecheck
cd ../../web && npm ci && npm run typecheck && npm run build
```

Covers event validation/normalization, IP hashing/truncation, the ATT&CK
classifier, aggregation, and the API's auth/rate-limit/validation behavior.
No database needed: the tests run against PGlite — real Postgres compiled to
WebAssembly — so they exercise the same SQL dialect production runs.

## Historical deployment

Deployment is a deliberate, owner-driven act — follow
[`docs/RUNBOOK.md`](docs/RUNBOOK.md) end to end, including the pre-flight
safety checklist.

The sensor went on a **disposable VM in an isolated cloud
project, with the egress lockdown applied and verified before Cowrie
started**. The ingest tier and private Postgres ran on self-managed Coolify;
the public site was a separate Vercel project that received only anonymous
rollups. Only ingest held the database credentials and IP-hashing secret.
The sensor shared nothing with either but the write-only ingest token. It was
provisioned last, and Cowrie was started last of all.

## Honest framing, verbatim

The same text the site shows:

> Everything on this page is automated background noise. No human chose
> this machine; botnets scan the entire internet and try default passwords
> on whatever answers. This machine just wrote it down. If you put a server
> online with password authentication and a guessable credential, this
> traffic finds it — typically within the hour. That is the entire lesson.
