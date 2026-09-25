# Security — threat model of the honeypot system itself

**Historical live-system threat model:** the sensor and ingest service were
stopped on 25 September 2026. See [the archive record](ARCHIVE.md) for the
current deployment state.

Most threat models ask "how do we keep attackers out?" A honeypot inverts
that: attackers are *invited in*. So this document models the system
**itself** as the asset at risk, and the central question is:

> When the sensor is compromised — and it will be — what is the blast
> radius, and why can't it spread?

## Assets

| Asset | Where | Sensitivity |
|---|---|---|
| Third-party systems on the internet | everywhere | **Highest.** The unacceptable outcome is the sensor attacking them. |
| Real infrastructure (the owner's other systems) | separate accounts | High. Must be unreachable from the sensor. |
| Collected telemetry (pseudonymized) | ingest Postgres | Moderate. Contains pseudonymized IPs + attacker inputs. |
| `IP_HASH_SECRET` | ingest deployment only | **High.** With it plus the stored hashes, the IPv4 space is small enough to brute-force back to real addresses. It is why ingest and web are separate deployments. |
| The ingest token | sensor + ingest | Low/Moderate. Write-only; rotatable. |
| The public site | Tier 3 | Low. Serves anonymous aggregates. |

## Trust zones

- **Untrusted:** the internet, **and the sensor host after first contact.**
  We do not trust the sensor even though we run it.
- **Semi-trusted:** the ingest service — trusted to validate, not trusted
  with anything the sensor could poison.
- **Trusted:** the datastore and the build/deploy pipeline.

## Adversary capabilities (assume the worst)

The attacker can: reach the sensor on 22/23 from anywhere; brute-force the
emulated login; run commands in the fake shell; **and — assume a
Cowrie escape or RCE — obtain real root on the sensor host.** We design
for that last case, not against it.

## Scenario walk-throughs

### S1 — Attacker gets a real shell on the sensor (worst case)
- **Wants:** pivot to other hosts, exfiltrate data, join the box to a
  botnet, mine crypto.
- **Stopped by:**
  - *Egress lockdown* (`infra/nftables.conf` + cloud SG): the only
    outbound connection allowed is the telemetry POST. Payload downloads,
    C2, scanning, and lateral SSH all hit `policy drop` and are logged.
  - *Isolation* (`infra/isolation.md`): the sensor is the only host in its
    Hetzner project. The data tier is on separate infrastructure, Postgres is
    private, and the sensor's cloud and host firewalls permit only HTTPS to
    the fixed ingest origin. There is no route to the database or management
    ports.
  - *No secrets to steal:* the box holds only a write-only ingest token.
    No cloud keys, no DB creds, no SSH keys to elsewhere.
- **Residual (accepted, documented):** egress is scoped to one fixed Coolify
  host on port 443. An attacker with root on the sensor could reach another
  HTTPS virtual host sharing that address, but cannot reach arbitrary hosts,
  SSH, scan, spam, tunnel over DNS, or connect to private Postgres.
- **Also residual:** the attacker can wreck the sensor (it's disposable —
  rebuild from image) and can submit junk via the token (validated,
  rate-limited, rotatable). Neither reaches a third party or real infra.

### S2 — Attacker steals the ingest token and POSTs forged events
- **Stopped/limited by:** the token authorizes *only* `POST /v1/events`.
  Forged events are schema-validated, rate-limited, and pseudonymized like
  any other. Worst case is polluted statistics — detectable (volume/shape
  anomalies) and fully reversible by dropping the affected window and
  rotating the token. No read access, no admin, no pivot.

### S3 — Attacker targets the ingest service directly
- The write route is public (it must be — the sensor reaches it over the
  internet) but authenticated: a constant-time bearer check gates everything
  behind it. The surface is one POST route with strict zod validation,
  parameterized statements only (no SQL injection), a 1 MB body cap, and
  process-level rate limits. It makes **no** outbound network calls —
  GeoIP is bundled local files, which is also what lets
  `docs/DATA-HANDLING.md` claim no third-party transfers. A bug here exposes
  pseudonymized telemetry at worst — never real infrastructure.
- **Honest limitation:** the in-process token buckets are per application
  replica. Production currently runs one replica; if it is horizontally
  scaled, a shared or proxy-level limiter is needed for a global ceiling.
  Bearer auth, not rate limiting, is what keeps unauthorized events out.

### S4 — Attacker tries to reach the public site's data backend
- The site fetches the **read-only** rollups API (`GET /v1/rollups`),
  which serves only assembled `rollup_*` data. The web tier holds no
  database driver and no connection to raw events. The rollups API has no
  write path and runs on a separate port from the sensor-only ingest port.
  Its bearer token is a database wake-up gate, not a confidentiality layer:
  the data is already public, but unauthenticated traffic is rejected before
  Postgres opens. Compromising the web tier — or the rollups endpoint itself
  — yields only the anonymous aggregates already shown on the page.
- This is why the dashboard and ingest tier are **separate deployments on
  separate infrastructure**. Only the Coolify ingest environment holds
  `DATABASE_URL` and `IP_HASH_SECRET`; the Vercel web project has neither, so
  compromising it cannot reach raw events or reverse an IP pseudonym.

### S5 — Supply chain / dependency compromise
- The sensor runs upstream Cowrie (pinned image) — we add no exploitable
  service. Ingest and shipper have small, pinned dependency trees. The
  ingest service's no-egress posture means even a malicious dependency
  there cannot exfiltrate. Review `package-lock.json` changes; rebuild
  images on a schedule.

## Blast-radius summary

| If compromised… | Reachable from there | Damage ceiling |
|---|---|---|
| Sensor host (even as root) | telemetry POST only | wreck a disposable VM; submit junk telemetry |
| Ingest token | `POST /v1/events` | pollute stats (reversible) |
| Ingest deployment | its Postgres of pseudonymized events, `IP_HASH_SECRET` | expose pseudonymized telemetry; with the secret, re-identify sources |
| Public web tier | bearer-gated rollups API (read-only, over HTTPS) | expose already-public aggregates; cause additional rollup reads |

At no tier does compromise yield a path to third-party systems or to the
owner's real infrastructure. That separation is the entire security
design.

## Operational security checklist (owner)

- [ ] Sensor in a **dedicated cloud project** with nothing else in it, no
      private network, no peering, no shared VPN.
- [ ] `infra/nftables.conf` **and** the Hetzner Cloud Firewall rules applied
      and **verified** (run the egress tests in `infra/cloud-egress.md`)
      **before** Cowrie starts.
- [ ] Egress allowlist still matches reality: the ingest hostname resolves to
      the single `INGEST_HOST` address allowed by both firewalls.
- [ ] Sensor holds no secret other than the write-only ingest token.
- [ ] Real admin SSH on a non-standard port, key-only, locked to your IP.
- [ ] Coolify ingest/private Postgres and Vercel web are separate resources;
      only ingest has `DATABASE_URL` and `IP_HASH_SECRET`. Both share only the
      read-only `ROLLUPS_TOKEN`/`HUNANG_ROLLUPS_TOKEN` value.
- [ ] `INGEST_TOKEN`, `IP_HASH_SECRET` and `ROLLUPS_TOKEN` are long random
      values, all different, never committed (`.env` is gitignored).
- [ ] Retention window set; data-handling note published.
- [ ] Sensor image rebuildable from scratch; treat the host as cattle.

## Reporting
Found an issue with the system design or code? Open an issue at the repo,
or contact the owner via <https://andri.is>. Please do not post details
that would help someone attack a live deployment before it's fixed.
