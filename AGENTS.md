# Repository guidance

- Hunang has three Node workspaces: `honeypot/shipper`, `ingest`, and `web`. Install and validate each independently with its checked-in lockfile.
- Cowrie source IPs reach ingest as `src_ip`, then are immediately replaced by a keyed HMAC pseudonym and a truncated `/24` (IPv4) or `/48` (IPv6) prefix. Raw IPs must never enter storage, rollups, logs, or the web tier.
- Public dashboard data must come only from anonymous `rollup_*` tables through `ingest/src/rollups.ts`; mirror any wire-contract changes in `web/src/lib/data.ts` and preserve empty defaults for staggered deployments.
- Lifetime aggregates survive the 30-day event purge through the fold mechanism. Do not reset cumulative aggregates to add a new historical metric because purged history cannot be rebuilt from Postgres. Prefer an accurately scoped retained window unless a complete external replay is deliberately planned.
- The story site is bilingual. Update `web/src/copy/types.ts`, `en.tsx`, and `is.tsx` together, including navigation and explanatory caveats.
- Author and commit PR changes as `AndriGitDev <andri@andri.is>` so Vercel recognizes the commit as belonging to the project team.
- Validation commands: `cd ingest && npm test && npm run typecheck`; `cd honeypot/shipper && npm test && npm run typecheck`; `cd web && npm run typecheck && npm run build`.
