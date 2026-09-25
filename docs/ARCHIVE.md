# Hunang archive

The sensor was powered off on 25 September 2026. The v2 site is an English
report and a static results browser. It renders a
checked-in copy of the anonymous `/v1/rollups` response. The browser and the
site's server routes no longer need the live ingest service.

## Evidence and scope

The source is `web/src/archive/final-rollups.json`, also published at
`/archive/rollups.json`. It contains lifetime totals, UTC daily login-attempt
buckets, country counts, and the API's top credential, username, password,
ASN, client-banner, and ATT&CK rows. The API limits those leaderboards; the
archive does not represent a complete inventory of every observed string.
Its 24-hour and hourly fields are kept in the downloadable source for audit,
but not used for conclusions after shutdown.

The export verifies that the daily and country login-attempt counts both sum
to the lifetime total. This guards against a partial rollup response, but it
does not prove that every Cowrie log line reached ingest. The sensor's raw
Cowrie logs and any undrained shipper queue were not available from this
workspace at the time the report was prepared.

The report's three findings use these explicit denominators:

- The protocol-like credential minimum is the sum of top-pair rows whose
  username or password contains the literal `\\x00` sequence, divided by
  lifetime login attempts. Other such pairs may be outside the top 20.
- The US/Netherlands share is the sum of those two country login-attempt
  rows divided by lifetime login attempts. GeoIP is about observed network
  endpoints, not people.
- Post-login event counts come from the lifetime totals and ATT&CK event
  rollups. They are not unique sessions, actors, successful malware
  executions, or independent incidents.

## Refreshing the snapshot

From `web/`, set `HUNANG_ROLLUPS_URL` and `HUNANG_ROLLUPS_TOKEN` in the shell
environment, then run `npm run archive:export`. The command writes both the
bundled and downloadable JSON files and prints only timestamp and total.
Never add the token, raw source IPs, or Cowrie logs to the repository.

The sensor should stop first. Wait for the five-minute aggregation cycle and
take a new export. Compare a second export after another cycle; the lifetime
counts should be stable before labeling the snapshot final. If a shipper
backlog later drains, export again and update the report before publishing.

## Operational closeout — 25 September 2026

- The owner powered off the Hetzner sensor. Two post-shutdown five-minute
  rollup exports stayed at **450,635** lifetime login attempts; the committed
  snapshot was aggregated at **14:52:50 UTC**.
- The English archive was deployed to `hunang.kastro.is`. The report, results,
  JSON download, legacy redirects, and static `/api/stats` were verified on
  the production domain after the data services stopped.
- A private local Coolify Postgres backup completed successfully (40,627,502
  bytes). Its configuration is
  disabled and local-only. This is a host-local backup, not an offsite copy.
- Coolify ingest stopped. Coolify accepted database stop requests but left
  Postgres running; the exact Hunang container was stopped directly and
  verified `Exited (0)` with restart policy `unless-stopped`. Coolify's API
  status still lagged the actual Docker state at closeout. No database,
  persistent volume, or backup was deleted.
- The web project's obsolete rollups URL and token were removed from Vercel.
  Production was redeployed afterward so the current archive deployment does
  not carry those environment variables.

The archive uses Vercel Web Analytics for page views. This measures visitors to
the static report and results pages; it does not restart honeypot collection
or alter the frozen experiment data. The project-level setting is enabled and
the site includes the Analytics component in its layouts.

The obsolete Vercel `hunang-ingest` project was deleted by the owner. The
archive's live ingest service and database are stopped. The deletion did not
affect the archive site.
