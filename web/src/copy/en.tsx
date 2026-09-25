import type { Copy } from "./types";
import { REPO_URL } from "./constants";

export const en: Copy = {
  locale: "en",

  meta: {
    title: "Hunang — a honeypot, counted honestly | Kastro Labs",
    description:
      "Live telemetry from an SSH/Telnet honeypot: automated bots guessing default passwords around the clock. The internet's background noise, written down.",
    ogTitle: "Hunang — a honeypot, counted honestly | Kastro Labs",
    ogDescription:
      "What happens when you put a machine on the internet: constant automated credential spraying, mapped to MITRE ATT&CK.",
    kioskTitle: "Hunang live dashboard | Kastro Labs",
    kioskDescription: "Full-screen live view of the Hunang honeypot telemetry.",
  },

  story: {
    nav: {
      numbers: "Numbers",
      map: "Map",
      ipVersions: "IPv6",
      credentials: "Credentials",
      attck: "ATT&CK",
      defense: "Defense",
      method: "Method",
      dashboard: "Dashboard ↗",
    },
    hero: {
      eyebrow: "Live honeypot telemetry",
      sensor: "SSH + Telnet sensor",
      location: "Helsinki, Finland",
      title: (
        <>
          Put a machine online.
          <br />
          Count what happens.
        </>
      ),
      standfirst: (delay) => (
        <>
          This site is wired to a honeypot, a decoy server that accepts the internet&apos;s
          unsolicited login attempts and writes them down. Nobody was told it exists.{" "}
          <strong>The first attack arrived {delay} after it went live</strong>, and it has not
          been quiet since. Nothing here is targeted; every attempt comes from a bot working its
          way through the whole internet.
        </>
      ),
    },
    numbers: {
      heading: "The numbers",
      sub: (since) => <>lifetime · since {since}</>,
      calloutLabel: "Read this before the charts",
      callout: (
        <>
          <p>
            Everything on this page is automated background noise. No human chose this machine;
            botnets scan the entire internet and try default passwords on whatever answers. This
            machine just wrote it down. If you put a server online with password authentication
            and a guessable credential, this traffic finds it, usually within the hour.
          </p>
          <p>
            So none of this took a skilled attacker, and the numbers below are not threat
            intelligence. What they measure is the baseline: how hostile the open internet is,
            and how little it takes to get compromised by accident.
          </p>
        </>
      ),
    },
    clock: {
      heading: "Around the clock",
      sub: "login attempts over time",
      prose: (
        <>
          There is no quiet hour. The botnets doing this are spread across every timezone and
          never stop; the dips and spikes come from campaigns starting and ending, not from
          anyone&apos;s working day.
        </>
      ),
    },
    where: {
      heading: "Where it comes from",
      sub: "aggregate counts only",
      asnHeading: "Top source networks (ASN)",
      prose: (
        <>
          Country and network tell you where infected machines and cheap VPSes are, not where
          an &ldquo;attacker&rdquo; sits. A large share of this traffic is compromised
          devices whose owners have no idea.
        </>
      ),
    },
    ipVersions: {
      heading: "IPv4 versus IPv6",
      sub: "login attempts · last 24 hours",
      ipv4: "IPv4",
      ipv6: "IPv6",
      attempts: "attempts",
      share: "of observed traffic",
      ratio: (ratio) => <><strong>{ratio}×</strong> as many attempts arrived over IPv4.</>,
      noTraffic: <>No login attempts were recorded in this window.</>,
      prose: (
        <>
          The sensor listens on both address families. IPv4 is scanned by mature botnets that can
          sweep its smaller address space cheaply; IPv6 is vast enough that blind scanning is far
          less practical. This is a comparison of traffic that reached this one sensor, not a
          measure of either protocol&apos;s security.
        </>
      ),
    },
    credentials: {
      heading: "What they try",
      sub: "most-attempted credentials",
      topUsernames: "Top usernames",
      topPasswords: "Top passwords",
      tooling: "Attack tooling (SSH client banners)",
      prose: (
        <>
          There is no clever exploit here, just dictionaries. The bots try{" "}
          <span className="cred">root<span className="sep">/</span>123456</span> because
          somewhere out there it still works often enough to keep a botnet growing.
        </>
      ),
    },
    attck: {
      heading: "Mapped to MITRE ATT&CK",
      sub: "observed behavior → technique",
      intro: (
        <>
          Each captured behavior is classified against{" "}
          <a href="https://attack.mitre.org/" rel="noopener noreferrer">MITRE ATT&amp;CK</a>, the
          shared vocabulary defenders use to talk about attacker techniques. The mapping is
          deliberately conservative: a technique is only counted when the event is direct
          evidence of it (the classifier and its tests are{" "}
          <a href={REPO_URL} rel="noopener noreferrer">open source</a>).
        </>
      ),
      outro: (
        <>
          Counts are events, not incidents. A single bot session typically produces one
          connection, a burst of password guesses, and, if it gets a shell, a short scripted run
          of discovery, payload download, and persistence attempts. The shell it gets here is
          fake.
        </>
      ),
    },
    defense: {
      heading: "What would have stopped this",
      sub: "per attack class, the boring control that works",
      cards: [
        {
          label: (observed) => <>Password guessing · observed {observed}×</>,
          title: "Credential spraying",
          body: (
            <>
              Endless dictionaries of common passwords against <span className="mono">root</span>{" "}
              and <span className="mono">admin</span>. Volume does the work.
            </>
          ),
          fix: (
            <>
              <strong>Stopped by:</strong> disabling password authentication entirely
              (<span className="mono">PasswordAuthentication no</span>) and using SSH keys.
              Fail2ban and rate limiting cut the noise, but key-only auth is what ends the game.
            </>
          ),
        },
        {
          label: (observed) => <>Default accounts · observed {observed}×</>,
          title: "Factory credentials",
          body: (
            <>
              <span className="cred">pi<span className="sep">/</span>raspberry</span>,{" "}
              <span className="cred">ubnt<span className="sep">/</span>ubnt</span>: devices shipped
              with documented logins and never changed.
            </>
          ),
          fix: (
            <>
              <strong>Stopped by:</strong> changing or disabling default accounts before the
              machine ever faces the network. Treat first boot as part of deployment, not a TODO.
            </>
          ),
        },
        {
          label: (observed) => <>Tool transfer · observed {observed}×</>,
          title: "Malware staging",
          body: (
            <>
              After a &ldquo;successful&rdquo; login: <span className="mono">wget</span> a payload
              to <span className="mono">/tmp</span>, <span className="mono">chmod 777</span>, run
              it. Usually a Mirai variant or a cryptominer.
            </>
          ),
          fix: (
            <>
              <strong>Stopped by:</strong> egress filtering (servers rarely need arbitrary
              outbound HTTP), <span className="mono">noexec</span> on world-writable mounts, and
              alerting on new executables.
            </>
          ),
        },
        {
          label: (observed) => <>Persistence · observed {observed}×</>,
          title: "Keys and cron jobs",
          body: (
            <>
              Appending an attacker key to <span className="mono">authorized_keys</span> or
              installing a cron entry, so the bot can come back even after a password change.
            </>
          ),
          fix: (
            <>
              <strong>Stopped by:</strong> file-integrity monitoring on{" "}
              <span className="mono">~/.ssh</span> and cron directories (auditd, Wazuh), and
              alerting on authorized_keys changes you didn&apos;t make.
            </>
          ),
        },
        {
          label: (observed) => <>Discovery · observed {observed}×</>,
          title: "Scripted recon",
          body: (
            <>
              <span className="mono">uname -a</span>, <span className="mono">cat /proc/cpuinfo</span>,{" "}
              <span className="mono">cat /etc/passwd</span>: the bot sizing up the machine for
              mining profitability or botnet duty.
            </>
          ),
          fix: (
            <>
              <strong>Stopped by:</strong> everything above. Once recon runs, the machine is
              already compromised; prevention happens at authentication and exposure. What this
              row gives you is a tripwire.
            </>
          ),
        },
        {
          label: () => <>Exposure · the root cause</>,
          title: "The open port itself",
          body: (
            <>
              All of this traffic exists because port 22 answered. Most machines don&apos;t need
              SSH reachable from the entire internet.
            </>
          ),
          fix: (
            <>
              <strong>Stopped by:</strong> not exposing SSH publicly. Use WireGuard, an IP
              allowlist, or a bastion host. Moving to a nonstandard port only reduces the noise;
              scanners check those too.
            </>
          ),
        },
      ],
    },
    method: {
      heading: "Method & data handling",
      sub: "how this works, and what it stores",
      how: (
        <>
          <h3 style={{ marginBottom: "0.5rem" }}>How it works</h3>
          <p>
            The sensor is <a href="https://github.com/cowrie/cowrie" rel="noopener noreferrer">Cowrie</a>,
            an established honeypot that emulates an SSH/Telnet server with a fake shell, so
            attackers interact with a recording rather than a real system. It runs on an isolated, disposable host
            with outbound traffic firewalled to a single telemetry channel, and holds no
            credentials for anything real.
          </p>
          <p>
            Events flow one way: sensor → authenticated ingest API → database → pre-aggregated
            rollups → this page. The site you are reading never connects to the honeypot and
            renders only aggregate data. Full architecture, threat model, and runbook are{" "}
            <a href={REPO_URL} rel="noopener noreferrer">on GitHub</a>.
          </p>
        </>
      ),
      data: (
        <>
          <h3 style={{ marginBottom: "0.5rem" }}>Data handling</h3>
          <p>
            Source IP addresses are personal data under GDPR and are treated accordingly: at
            ingest they are replaced with a keyed pseudonym (HMAC) and a truncated network
            prefix (/24 or /48). Raw IPs are never stored or displayed. Raw event records are
            deleted after 30 days; the numbers on this page are anonymous lifetime aggregates,
            folded once from each event and kept with no per-source data behind them.
          </p>
          <p>
            Captured usernames, passwords, and commands shown here were typed by automated
            tooling at a decoy machine. This site sets no cookies. It uses Vercel Web
            Analytics for anonymous, aggregate page-view statistics. Geolocation for attack
            traffic is resolved from database files held on the server, so an observed attack
            address is never sent to a third party; the pseudonymized event store is hosted on
            Kastro Labs&apos; self-managed Coolify infrastructure in the EU. Country and network
            data from{" "}
            <a href="https://db-ip.com" rel="noopener noreferrer">DB-IP</a> (CC BY 4.0).
            Questions: <a href="https://andri.is">andri.is</a>.
          </p>
        </>
      ),
    },
    footer: {
      credit: (
        <>
          hunang (is. honey) · a{" "}
          <a href="https://kastro.is">kastro labs</a> project · built, broken &amp; shipped by{" "}
          <a href="https://andri.is">Andri</a>
        </>
      ),
      source: "Source on GitHub",
      privacy: "No cookies · anonymous page analytics · attack aggregates only",
      tagline: "viva la firewall",
    },
    ticker: {
      loginAttempts: "Login attempts captured",
      lifetimeNote: "lifetime · since the sensor went live",
      last24h: "Last 24 hours",
      oneEveryPrefix: "≈ one every ",
      oneEverySuffix: "",
      sources: "Distinct sources",
      sourcesNote: "lifetime · pseudonymized at ingest",
      firstAttack: "First attack after going live",
      firstAttackNote: "nobody was told this machine exists",
      updatedPrefix: "updated ",
      updatedSuffix: " · refreshes automatically",
    },
  },

  kiosk: {
    telemetry: "live honeypot telemetry · ssh + telnet",
    noSource: "no rollup source configured",
    backLink: "← the full story",
    loginAttempts: "Login attempts · lifetime",
    last24h: "Last 24 h",
    sources: "Sources",
    sessions: "Sessions",
    commands: "Commands",
    firstAttack: (delay) => `first attack ${delay} after going live`,
    oneEvery: (rate) => `≈ one every ${rate}`,
    topCredentials: "Top credentials tried",
    attemptsPerHour: "Attempts per hour · last 48 h",
    topCountries: "Top source countries",
    topUsernames: "Top usernames",
    topPasswords: "Top passwords",
    controls: {
      updated: "updated",
      fullscreen: "⛶ fullscreen",
    },
  },

  ui: {
    credTable: { rank: "#", userPass: "Username / password", tries: "Tries" },
    attckTable: { technique: "Technique", tactic: "Tactic", observed: "Observed" },
    countryTable: { rank: "#", country: "Source country", attempts: "Attempts", share: "Share" },
    mapAria: "World map of login attempts by source country",
    legend: { fewer: "fewer", more: "more", none: "none recorded" },
    mapTooltipCount: (count) => `: ${count} login attempts`,
    mapTooltipNone: ": no attempts recorded",
    mapUnknown: "Unknown",
    chartAria: (granularity, span) => `Login attempts per ${granularity}, last ${span} ${granularity}s`,
    chartCaption: (granularity, span, peak) =>
      `${granularity === "hour" ? `last ${span} hours` : `last ${span} days`} · peak ${peak} / ${granularity} · UTC`,
    chartTooltip: (count) => `— ${count} attempts`,
  },
};
