#!/usr/bin/env node
/**
 * Download the IP→country and IP→ASN databases into ./geoip at build time.
 *
 * Why build time: enrichment is offline by design — the ingest path never
 * sends an attacker's IP to a third party, which is what lets
 * docs/DATA-HANDLING.md state there are no external transfers. Bundling the
 * databases with the function keeps that true in a serverless deployment.
 *
 * Why country rather than city: the dashboard only shows country and ASN.
 * The country databases are a few MB; city-level data would be an order of
 * magnitude larger for something we never display, and more identifying than
 * this project has any business holding.
 *
 * Two sources, in order of preference:
 *
 *   1. MaxMind GeoLite2, if MAXMIND_LICENSE_KEY is set. Free, but needs an
 *      account. Updated twice weekly and generally the more accurate of the
 *      two.
 *   2. DB-IP Lite otherwise. Free, CC BY 4.0, monthly, and needs **no
 *      account or key at all** — which keeps `git clone && deploy` working
 *      for anyone reproducing this project. Attribution is required and is
 *      published on the site's "Method & data handling" section.
 *
 * Both ship the same MMDB format, so `maxmind`'s reader handles either and
 * nothing downstream knows the difference. If neither source is reachable
 * the build still succeeds: sources aggregate as "Unknown", which the
 * dashboard renders honestly.
 */
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readdir, rm, writeFile, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const OUT_DIR = resolve(process.cwd(), "geoip");

const licenseKey = process.env.MAXMIND_LICENSE_KEY ?? "";
const accountId = process.env.MAXMIND_ACCOUNT_ID ?? "";

await mkdir(OUT_DIR, { recursive: true });

const targets = licenseKey
  ? [
      { out: "country.mmdb", fetch: () => fetchMaxmind("GeoLite2-Country") },
      { out: "asn.mmdb", fetch: () => fetchMaxmind("GeoLite2-ASN") },
    ]
  : [
      { out: "country.mmdb", fetch: () => fetchDbIp("country") },
      { out: "asn.mmdb", fetch: () => fetchDbIp("asn") },
    ];

console.log(`[geoip] source: ${licenseKey ? "MaxMind GeoLite2" : "DB-IP Lite (no account required)"}`);

for (const target of targets) {
  try {
    await target.fetch().then((path) => copyFile(path, join(OUT_DIR, target.out)));
    console.log(`[geoip] ${target.out} ready`);
  } catch (err) {
    // A GeoIP failure must not break the deployment — the ingest path works
    // without enrichment. Fail loudly in the log, succeed in the build.
    console.warn(`[geoip] ${target.out} unavailable: ${err instanceof Error ? err.message : err}`);
  }
}

/**
 * DB-IP publishes one file per calendar month. On the 1st the new month may
 * not exist yet, so fall back to the previous month rather than shipping a
 * build with no geolocation at all.
 */
async function fetchDbIp(kind) {
  const now = new Date();
  const months = [0, 1].map((back) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });

  let lastError;
  for (const month of months) {
    const url = `https://download.db-ip.com/free/dbip-${kind}-lite-${month}.mmdb.gz`;
    try {
      const response = await fetch(url, { redirect: "follow" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const work = await mkdtemp(join(tmpdir(), "hunang-geoip-"));
      const gz = join(work, "db.mmdb.gz");
      await writeFile(gz, Buffer.from(await response.arrayBuffer()));
      await run("gunzip", ["-f", gz]);
      return join(work, "db.mmdb");
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(`no DB-IP release for ${months.join(" or ")}: ${lastError}`);
}

async function fetchMaxmind(edition) {
  const url = new URL("https://download.maxmind.com/app/geoip_download");
  url.searchParams.set("edition_id", edition);
  url.searchParams.set("suffix", "tar.gz");
  const headers = {};
  if (accountId) {
    // Newer MaxMind accounts authenticate with account id + licence key.
    headers.Authorization = `Basic ${Buffer.from(`${accountId}:${licenseKey}`).toString("base64")}`;
  } else {
    url.searchParams.set("license_key", licenseKey);
  }

  const response = await fetch(url, { headers, redirect: "follow" });
  if (!response.ok) throw new Error(`download failed: HTTP ${response.status}`);

  const work = await mkdtemp(join(tmpdir(), "hunang-geoip-"));
  const archive = join(work, `${edition}.tar.gz`);
  await writeFile(archive, Buffer.from(await response.arrayBuffer()));
  await run("tar", ["-xzf", archive, "-C", work]);

  const mmdb = await findMmdb(work);
  if (!mmdb) throw new Error("archive contained no .mmdb file");
  return mmdb;
}

async function findMmdb(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = await findMmdb(path);
      if (found) return found;
    } else if (entry.name.endsWith(".mmdb")) {
      return path;
    }
  }
  return null;
}
