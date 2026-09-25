import Link from "next/link";
import { ArchiveHeader } from "@/components/ArchiveHeader";
import { ArchiveFooter } from "@/components/ArchiveFooter";
import { ArchiveChart } from "@/components/ArchiveChart";
import { REPO_URL } from "@/copy/constants";
import { archive, integer, medianCompleteDay, observedAt, percent, protocolLikeAttempts, rankedDays, topTwoCountryAttempts, totals, utcDay } from "@/lib/archive";

export function ArchiveReport() {
  return <div className="archive-shell">
    <ArchiveHeader active="report" />
    <main>
      <div className="archive-hero">
        <div className="archive-eyebrow"><span className="archive-square" /> AN INTERNET FIELD STUDY <span>01 / THE REPORT</span></div>
        <h1>What happened when<br /><em>we opened the door.</em></h1>
        <div className="archive-hero-bottom">
          <p>One decoy server. SSH and Telnet exposed to the open internet. Every unsolicited interaction counted.</p>
          <span>HELSINKI, FINLAND<br />STARTED 06 AUG 2026<br />SNAPSHOT {utcDay(totals.lastAggregatedAt)}</span>
        </div>
      </div>

      <div className="archive-status" role="note"><span className="archive-status-icon">●</span><strong>Field study complete</strong><span>The sensor was powered off on 25 September 2026. These are final, dated counts from the ingest rollups, not live counters.</span></div>

      <section className="archive-section" id="overview">
        <div className="archive-section-kicker">01 / AT A GLANCE</div>
        <div className="archive-intro-grid"><h2>The internet found it<br />in <em>23 seconds.</em></h2><p>Hunang was an unannounced Cowrie honeypot. It emulated a shell and recorded automated traffic sent to one public host. The first recorded attack followed the sensor launch by 23 seconds. What followed was persistent, mostly routine scanning and credential guessing.</p></div>
        <div className="archive-metrics">
          <div><b>{integer(totals.totalLoginAttempts)}</b><span>login attempts</span></div>
          <div><b>{integer(totals.uniqueSources)}</b><span>distinct pseudonymized sources</span></div>
          <div><b>{integer(totals.successfulLogins)}</b><span>honeypot logins accepted</span></div>
          <div><b>{integer(totals.commandsEntered)}</b><span>commands entered in the fake shell</span></div>
        </div>
        <p className="archive-caption">Cumulative counts through {observedAt.replace("T", " ").slice(0, 16)} UTC. A successful honeypot login means the decoy let a visitor into its simulated shell; it does not mean a real server was compromised.</p>
      </section>

      <section className="archive-section archive-section-dark" id="rhythm">
        <div className="archive-section-kicker">02 / THE RHYTHM</div>
        <div className="archive-intro-grid"><h2>Steady pressure.<br /><em>Sudden surges.</em></h2><p>The daily series covers the whole captured period, including days older than the 30-day raw-event retention window. The highest day, {utcDay(rankedDays[0].bucketStart)}, logged {integer(rankedDays[0].count)} attempts—about {(rankedDays[0].count / medianCompleteDay).toFixed(1)} times the median complete day ({integer(medianCompleteDay)}). A daily peak cannot by itself identify one botnet or campaign.</p></div>
        <ArchiveChart />
        <div className="archive-chart-axis"><span>{utcDay(archive.daily[0].bucketStart)}</span><span>DAILY LOGIN ATTEMPTS · UTC</span><span>{utcDay(archive.daily.at(-1)!.bucketStart)}</span></div>
      </section>

      <section className="archive-section" id="findings">
        <div className="archive-section-kicker">03 / WHAT STOOD OUT</div>
        <h2>Three patterns in<br /><em>the noise.</em></h2>
        <div className="archive-findings">
          <article><span className="archive-finding-number">01</span><div><h3>Some “passwords” look like protocol scripts.</h3><p>Three top credential pairs contain literal <code>\x00</code> markers and command-like text such as <code>/bin/busybox UNSTABLE</code>. Together they account for at least <strong>{integer(protocolLikeAttempts)} attempts ({percent(protocolLikeAttempts, totals.totalLoginAttempts)})</strong>. Treating every credential row as a human-readable password dictionary would hide this distinct automated behavior. The rollup cannot prove the underlying exploit or the tool that sent it.</p></div></article>
          <article><span className="archive-finding-number">02</span><div><h3>Source geography is heavily concentrated.</h3><p>The United States and Netherlands account for <strong>{percent(topTwoCountryAttempts, totals.totalLoginAttempts)}</strong> of recorded login attempts. This is where observed network endpoints geolocated, not evidence that operators lived there. Hosted infrastructure, relays, and infected devices can all affect this distribution.</p></div></article>
          <article><span className="archive-finding-number">03</span><div><h3>Scripts continued after the fake login.</h3><p>The decoy accepted <strong>{integer(totals.successfulLogins)}</strong> logins and recorded <strong>{integer(totals.commandsEntered)}</strong> commands. The classifier also counted {integer(archive.attck.find((row) => row.techniqueId === "T1105")?.count ?? 0)} tool-transfer events and {integer(archive.attck.find((row) => row.techniqueId === "T1098.004")?.count ?? 0)} authorized-key manipulation events. Those counts indicate observed actions in an emulated environment; they do not establish distinct attackers or successful malware execution.</p></div></article>
        </div>
      </section>

      <section className="archive-section archive-lessons" id="lessons">
        <div className="archive-section-kicker">04 / PRACTICAL LESSONS</div>
        <div className="archive-intro-grid"><h2>Make the easy path<br /><em>disappear.</em></h2><p>These are defensive implications of the observed behavior, not measured outcomes of an intervention. Hunang did not run a controlled test of each defense.</p></div>
        <div className="archive-lesson-grid">
          <article><span>01 / EXPOSURE</span><h3>Limit who can reach administration.</h3><p>Put SSH behind a VPN, bastion, or source allowlist where possible. The sensor was found quickly because its login service answered on the public internet.</p></article>
          <article><span>02 / AUTHENTICATION</span><h3>Remove password guessing as an option.</h3><p>Use key-only SSH authentication and disable or change factory credentials before first exposure. Repeated defaults and simple guesses filled the leaderboard.</p></article>
          <article><span>03 / AFTER LOGIN</span><h3>Watch commands and outbound traffic.</h3><p>Some sessions moved on to discovery, payload-transfer, and persistence-like actions in the decoy shell. Egress controls and alerts for unexpected commands help limit damage if authentication fails.</p></article>
        </div>
      </section>

      <section className="archive-section archive-method" id="method">
        <div className="archive-section-kicker">05 / METHOD & LIMITS</div>
        <div className="archive-intro-grid"><h2>What the numbers<br /><em>can tell us.</em></h2><div><p>Cowrie emulated SSH and Telnet on an isolated VPS. A shipper forwarded events to an authenticated ingest API. Source IPs were replaced at ingest by a keyed pseudonym and a truncated network prefix. The public site received only aggregate rollups. The 23-second delay compares the recorded sensor-live timestamp with the first captured event.</p><p>Lifetime totals, leaderboards, and daily buckets survive the 30-day event purge. The 24-hour IPv4/IPv6 counts and 48-hour hourly series are windowed observations and are excluded from the long-term conclusions here. ATT&CK counts represent classified events; categories may overlap and must not be summed as incidents.</p><p>This is one sensor at one address, over one period. It is a case study of traffic that reached that sensor, not an estimate of the whole internet or a list of people behind the traffic. GeoIP data came from <a href="https://db-ip.com">DB-IP Lite</a> under CC BY 4.0. <a href={`${REPO_URL}/blob/main/docs/DATA-HANDLING.md`}>Read the data handling policy ↗</a></p></div></div>
      </section>

      <section className="archive-next"><div><span>THE UNDERLYING COUNTS</span><h2>See the collected results.</h2><p>Daily activity, source countries, credentials, client banners, and observed techniques from the dated anonymous rollup snapshot.</p></div><Link href="/results">Explore the results <span aria-hidden>↗</span></Link></section>
    </main>
    <ArchiveFooter />
  </div>;
}
