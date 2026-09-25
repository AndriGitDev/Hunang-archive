# Runbook

**Historical reference:** the experiment ended on 25 September 2026. The
current public site reads a static snapshot; these procedures describe the
former live deployment. See [the archive record](ARCHIVE.md).

Operational procedures for Hunang. Local demo first, then the **deliberate,
owner-authorized** production deployment, then day-2 operations.

Production topology: one small VPS running only the sensor, a self-managed
Coolify application with private Postgres for ingest and aggregation, and a
separate Vercel project for the public web tier. See `docs/ARCHITECTURE.md`.

---

## A. Local demo (safe, no honeypot)

```sh
cp .env.example .env          # defaults are fine for the demo
docker compose up --build     # starts Postgres, seeds synthetic data, runs ingest + web
# open http://localhost:3000
```

Run the real capture path locally (loopback only):

```sh
docker compose --profile sensor up --build
ssh -p 2222 root@localhost    # try password 123456; watch the dashboard
```

Without Docker (needs a Postgres you can reach):

```sh
export DATABASE_URL=postgres://…  INGEST_TOKEN=… IP_HASH_SECRET=…
cd ingest && npm install && npm run seed && npm run dev   # :8400 + :8402
cd web    && npm install && npm run dev                    # :3000
```

Run the tests:

```sh
cd ingest           && npm test  # validation, privacy, ATT&CK, aggregation, API
cd honeypot/shipper && npm test  # Cowrie → wire-event mapper
```

The ingest tests need no database: they run against PGlite, real Postgres
compiled to WebAssembly, so they exercise the production SQL dialect
in-process.

---

## B. Production deployment (owner action)

> Deploying an internet-facing honeypot is a deliberate act with real
> responsibility. Do **not** skip the safety checklist. Note the order: the
> sensor is provisioned **last**, and Cowrie is started last of all.

### B0. Pre-flight safety checklist
Do not start Cowrie until every box is checked:

- [ ] Sensor is in a **dedicated cloud project** containing nothing else, with
      no private network and no peering (`infra/isolation.md`).
- [ ] `INGEST_TOKEN`, `IP_HASH_SECRET` and `ROLLUPS_TOKEN` generated with
      `openssl rand -hex 32`, all different, committed nowhere.
- [ ] Ingest/private Postgres and the Vercel web tier are **separate
      resources**. Only ingest has `DATABASE_URL` and `IP_HASH_SECRET`.
- [ ] Egress lockdown applied **and verified**: `sudo nft -f /etc/nftables.conf`,
      then run the egress tests in `infra/cloud-egress.md` — on the host **and
      inside a container**. General outbound and lateral SSH must **fail**,
      telemetry must **succeed**.
- [ ] Hetzner Cloud Firewall rules applied (defense in depth — they survive
      root on the box).
- [ ] `dig +short <fixed-IP-ingest-domain>` returns only the exact
      `INGEST_HOST` address in `infra/nftables.conf`.
- [ ] `NTP_SERVER` matches what the host actually syncs against
      (`timedatectl show -p NTP`, then resolve that name) — **not** a guess.
      Event timestamps are load-bearing, so a clock silently drifting because
      NTP is being dropped is a real failure. Confirm with
      `timedatectl show -p NTPSynchronized` after the lockdown is applied.
- [ ] Kernel drop log is quiet in steady state
      (`journalctl -k --since -2min | grep -c FWD-DROP`). Our own containers
      must not generate drops: that noise is what hides a real pivot attempt.
- [ ] Real admin SSH on 22022, key-only, your IP only — and **verified before
      port 22 is freed for the bait**.
- [ ] Telemetry is HTTPS. Never plaintext over the internet: the ingest token
      would travel in cleartext.
- [ ] Cowrie image **pinned to a digest** (not `:latest`) in
      `infra/compose.sensor.yml`.
- [ ] `RETENTION_DAYS` set; `docs/DATA-HANDLING.md` published on the site.

### B1. Provision the datastore
Create a private Postgres database in the dedicated Hunang Coolify project.
Keep it off the public internet; the ingest application connects over the
Coolify Docker network.

Nothing else is needed — the ingest deployment creates its own schema on
first boot.

### B2. Deploy Tier 2 (ingest) first
A Coolify application from this repository with **base directory `/ingest`**,
Dockerfile build pack, and internal ports `8400,8402`. Map separate HTTPS
domains to port 8400 (sensor writes) and port 8402 (web rollups).

Environment variables (Production + Preview):

| Variable | Value |
|---|---|
| `DATABASE_URL` | private Coolify Postgres URL from B1 |
| `PGSSLMODE` | `disable` for the private Docker-network connection |
| `INGEST_TOKEN` | `openssl rand -hex 32` |
| `IP_HASH_SECRET` | `openssl rand -hex 32`, different from the token |
| `ROLLUPS_TOKEN` | `openssl rand -hex 32`, read-only rollups gate |
| `INGEST_PORT`, `ROLLUPS_PORT` | `8400`, `8402` |
| `AGGREGATE_INTERVAL_SECONDS` | `300` |
| `RETENTION_DAYS` | `30` |
| `MAXMIND_ACCOUNT_ID`, `MAXMIND_LICENSE_KEY` | **optional.** Enrichment works with no configuration — the build bundles DB-IP Lite, which needs no account. Set these only to use MaxMind GeoLite2 instead. |

Then verify each mapped domain:

```sh
curl -fsS https://<ingest-domain>/healthz
curl -fsS -H "Authorization: Bearer $ROLLUPS_TOKEN" \
  https://<rollups-domain>/v1/rollups                 # valid dashboard JSON
curl -o /dev/null -w '%{http_code}\n' -X POST \
  https://<ingest-domain>/v1/events                   # 401 — auth is on
```

The long-running service aggregates and enforces retention every five minutes.
Country/ASN enrichment needs no setup, but note that it happens
**at write time**: if a deployment ever ingests events with the databases
missing, those events stay "Unknown" permanently — re-running aggregation
will not backfill them. Confirm `/v1/rollups` reports real country codes
before going live.

### B3. Deploy Tier 3 (public site)
A Vercel project with root directory `web`. Two environment variables:

```
HUNANG_ROLLUPS_URL=https://<rollups-domain>/v1/rollups
HUNANG_ROLLUPS_TOKEN=<same value as ingest ROLLUPS_TOKEN>
```

Add the domain `hunang.kastro.is`. The web tier holds **no** database driver
and neither ingest secret. Its rollups token grants access only to aggregates
that the site publishes anyway; it exists so arbitrary traffic cannot wake
Postgres. Giving the web tier either write secret would collapse the boundary in
`docs/SECURITY.md` S4. Confirm the page renders (empty until the sensor is
live) and that deployment protection is off, since it is a public site.

### B4. Provision the sensor (Tier 1) — last
On the VPS, in this order. Everything before step 6 is reversible; step 6 is
the moment the honeypot goes live.

```sh
# 1) base packages, then move admin SSH to 22022 (key-only) and CONFIRM you
#    can log in on the new port BEFORE freeing port 22 for the bait
# 2) clone the repo to /opt/hunang and create infra/.env:
#      INGEST_URL=https://<fixed-IP-ingest-domain>/v1/events
#      INGEST_TOKEN=<same value as the ingest project>
#      SENSOR_NAME=hp-hel1
# 3) pre-pull and build images NOW, while egress is still open:
cd /opt/hunang/infra
docker compose -f compose.sensor.yml build shipper
docker compose -f compose.sensor.yml pull cowrie

# 4) fill the << >> placeholders in infra/nftables.conf, install and apply it
sudo cp infra/nftables.conf /etc/nftables.conf   # after editing
sudo nft -f /etc/nftables.conf
sudo systemctl enable nftables
sudo systemctl restart docker   # `flush ruleset` wiped Docker's own nft rules

# 5) VERIFY the lockdown — infra/cloud-egress.md, on the host AND in a
#    container. STOP here if any "must fail" test succeeds.

# 6) go live
docker compose -f compose.sensor.yml up -d
```

Watch the first events land:

```sh
docker compose -f compose.sensor.yml logs -f shipper   # batches accepted
curl -fsS -H "Authorization: Bearer $ROLLUPS_TOKEN" \
  https://<rollups-domain>/v1/rollups | jq .totals
journalctl -k | grep -E 'EGRESS-DROP|FWD-DROP'         # drops are the design working
```

The "first attack after going live" stat is anchored to the `sensor_boot_ts`
each shipper batch reports (earliest wins), so it measures the sensor's
uptime and stays accurate however long the ingest tier ran beforehand.

The production shipper persists pending telemetry and its Cowrie byte
checkpoint in the `shipper-state` named volume. Delivery is hourly rather
than immediate. A failed ingest leaves the batch on disk for the next window;
an acknowledgement removes it atomically. Do not delete that volume during a
routine rebuild or outage recovery. It also contains the random, non-access
key used to derive privacy-safe replay IDs; preserving it keeps deduplication
stable across token rotations and container rebuilds.

For a known outage whose records are still in the active Cowrie JSON log,
set `SHIPPER_REPLAY_SINCE` to the first failed-ingest timestamp before the
first deployment of this durable shipper. With no checkpoint yet it scans
from byte zero, queues only events at/after that timestamp, and then persists
its position normally. Clear the variable after recovery. If the outage spans
rotated logs, preserve those files and replay them deliberately before
deleting anything; do not reset the database's cumulative rollup marker.

---

## C. Day-2 operations

### Rotate the ingest token (periodically, or on suspicion)
1. Generate a new token: `openssl rand -hex 32`.
2. Update `INGEST_TOKEN` in the Coolify ingest application and redeploy.
3. On the **sensor**, update `INGEST_TOKEN` in `infra/.env` and
   `docker compose -f compose.sensor.yml up -d shipper`.
4. Confirm batches are accepted again (`logs -f shipper`).

The implementation is single-token, so expect a brief window where the
shipper retries with backoff. It buffers on disk and redelivers; deterministic
duplicate ids are ignored on the way in, so nothing is lost or double-counted.

### Rotate the IP hash secret
Changing `IP_HASH_SECRET` is allowed and safe; it simply means pseudonyms
before and after the rotation no longer correlate (a *feature* for privacy —
it caps how long any source can be tracked). Update it on the ingest project
and redeploy. Past rollups are unaffected; they store no IPs.

### Recover admin SSH after an IP change (lockout)
Admin SSH (22022) is pinned to a single source CIDR in both `nftables.conf`
(`SSH_ADMIN_CIDR`) and the Hetzner Cloud Firewall. If your IP changes, you are
locked out **by design**; recovery is the Hetzner web console:

1. Console → the `hunang` server → **Console** (VNC-style, bypasses the network
   path entirely) and log in locally.
2. Edit `SSH_ADMIN_CIDR` in `/etc/nftables.conf` to the new address and
   `nft -f /etc/nftables.conf && systemctl restart docker` (the flush wipes
   Docker's rules; the restart puts them back).
3. Update the matching inbound 22022 rule on the Cloud Firewall
   (Console → Firewalls, or `hcloud firewall`), then confirm SSH from the new
   address **before** closing the console session.
4. Update the pinned address anywhere it is documented so the next lockout
   diagnosis is fast.

The bait ports (22/23) are unaffected throughout — the honeypot keeps
collecting while you are locked out.

### Recompute rollups / run retention manually

Run `npm run aggregate` from the `ingest/` directory inside the Coolify
application container. This performs the same fold, rollup refresh, and
retention pass as the built-in five-minute timer. Do not schedule a second
recurring job; the transaction advisory lock is a safety net, not a reason to
create overlapping work.

### Production cadence

- shipper: UTC-aligned hourly flush (`SHIPPER_FLUSH_INTERVAL_SECONDS=3600`)
- aggregation/retention: every 300 seconds in the Coolify ingest service
- rollups API: bearer-gated before database initialization
- web ISR/data fetch: 300 seconds, using the read-only token
- `/healthz`: never queries Postgres
- monitor: check that `lastAggregatedAt` advances and the shipper queue drains

### Backup & restore
Configure scheduled backups for the private Coolify Postgres volume and test
restores. Rollups regenerate from events, so events
are the only thing that must survive; but note that **lifetime aggregates
cannot be rebuilt from purged events**, so the `counters`, `distinct_sources`
and `rollup_*` tables are themselves primary data once retention has run.
Back up the whole database, not just `events`.

### Tear down
```sh
# sensor
cd /opt/hunang/infra && docker compose -f compose.sensor.yml down
# then DESTROY the VPS — it's disposable by design
# delete the Vercel web project; delete Coolify ingest, then Postgres last
```

### Incident: suspected sensor compromise beyond Cowrie
This is expected, not an emergency — that's the whole design. Still:
1. Confirm the egress logs show drops, not successful pivots
   (`journalctl -k | grep -E 'EGRESS-DROP|FWD-DROP'`).
2. **Rebuild the sensor from a clean image** (cattle, not pets).
3. Rotate the ingest token (it lived on the box).
4. If telemetry looks polluted, delete the affected window and re-aggregate
   (below).

### Incident: polluted/forged telemetry
1. Identify the window (anomalous volume/shape).
2. `DELETE FROM events WHERE ts BETWEEN … AND …;`
3. Lifetime counters are cumulative and will **not** self-correct, because
   the purged rows were already folded. Reset and re-fold:
   `DELETE FROM meta WHERE key = 'cumulative_ready';` then run the manual
   aggregation command above — it rebuilds every lifetime aggregate from the
   surviving events.
4. Rotate the ingest token.
