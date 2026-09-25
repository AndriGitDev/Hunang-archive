import Link from "next/link";
import { getDashboardData, type AttckRow } from "@/lib/data";
import { formatDelay, formatInt, formatUtc, type Locale } from "@/lib/format";
import { getCopy, REPO_URL } from "@/copy";
import { LiveTicker } from "@/components/LiveTicker";
import { TimeChart } from "@/components/TimeChart";
import { CountryTable, WorldMap } from "@/components/WorldMap";
import { AttckTable, CredentialBoard, MiniBoard } from "@/components/Boards";
import { KastroStar } from "@/components/KastroStar";
import { LocaleSwitch } from "@/components/LocaleSwitch";
import { IpVersionComparison } from "@/components/IpVersionComparison";

const REVALIDATE = 300;

// Technique IDs backing each defense card's observed counter, in card
// order; null means the card carries no counter.
const CARD_TECHNIQUES: (string[] | null)[] = [
  ["T1110.001"],
  ["T1078.001"],
  ["T1105", "T1222.002"],
  ["T1098.004", "T1053.003"],
  ["T1082", "T1016", "T1057", "T1003.008"],
  null,
];

export async function StoryPage({ locale }: { locale: Locale }) {
  const { story } = getCopy(locale);
  const data = await getDashboardData(REVALIDATE);
  const { totals } = data;
  const observed = (ids: string[]) =>
    data.attck.filter((t: AttckRow) => ids.includes(t.techniqueId)).reduce((s, t) => s + t.count, 0);
  const dashboardHref = locale === "is" ? "/is/dashboard" : "/dashboard";

  return (
    <div className="container">
      <header className="masthead">
        <span className="wordmark">
          <KastroStar size={16} color="#1A1A1A" />
          hunang
        </span>
        <nav aria-label="Sections">
          <a href="#numbers" className="label">{story.nav.numbers}</a>
          <a href="#where" className="label">{story.nav.map}</a>
          <a href="#ip-versions" className="label">{story.nav.ipVersions}</a>
          <a href="#credentials" className="label">{story.nav.credentials}</a>
          <a href="#attck" className="label">{story.nav.attck}</a>
          <a href="#defense" className="label">{story.nav.defense}</a>
          <a href="#method" className="label">{story.nav.method}</a>
          <Link href={dashboardHref} className="label label--accent">{story.nav.dashboard}</Link>
          <LocaleSwitch locale={locale} />
        </nav>
      </header>

      <section className="hero">
        <div className="kicker-row">
          <span className="label label--accent label--eyebrow">
            <KastroStar size={11} /> {story.hero.eyebrow}
          </span>
          <span className="label">{story.hero.sensor}</span>
          <span className="label">{story.hero.location}</span>
        </div>
        <h1 className="display">{story.hero.title}</h1>
        <p className="standfirst prose">
          {story.hero.standfirst(formatDelay(totals.firstAttackDelayS, locale))}
        </p>
      </section>

      <section className="section" id="numbers">
        <div className="section-head">
          <KastroStar size={11} />
          <span className="index">01</span>
          <h2>{story.numbers.heading}</h2>
          <span className="label sub">{story.numbers.sub(formatUtc(totals.sensorLiveTs))}</span>
        </div>
        <LiveTicker initial={totals} locale={locale} copy={story.ticker} />

        <div className="callout">
          <span className="label label--accent">{story.numbers.calloutLabel}</span>
          {story.numbers.callout}
        </div>
      </section>

      <section className="section" id="when">
        <div className="section-head">
          <KastroStar size={11} />
          <span className="index">02</span>
          <h2>{story.clock.heading}</h2>
          <span className="label sub">{story.clock.sub}</span>
        </div>
        <div className="two-col">
          <TimeChart
            buckets={data.hourly}
            granularity="hour"
            span={48}
            until={totals.lastAggregatedAt ?? Date.now()}
            locale={locale}
          />
          <TimeChart
            buckets={data.daily}
            granularity="day"
            span={30}
            until={totals.lastAggregatedAt ?? Date.now()}
            locale={locale}
          />
        </div>
        <p className="prose muted" style={{ marginTop: "1.25rem" }}>
          {story.clock.prose}
        </p>
      </section>

      <section className="section" id="where">
        <div className="section-head">
          <KastroStar size={11} />
          <span className="index">03</span>
          <h2>{story.where.heading}</h2>
          <span className="label sub">{story.where.sub}</span>
        </div>
        <WorldMap countries={data.countries} locale={locale} />
        <div className="two-col" style={{ marginTop: "2rem" }}>
          <CountryTable countries={data.countries} locale={locale} />
          <div>
            {data.asns.length > 0 && (
              <>
                <h3 className="label" style={{ marginBottom: "0.5rem" }}>
                  {story.where.asnHeading}
                </h3>
                <table>
                  <tbody>
                    {data.asns.map((a) => (
                      <tr key={a.asn}>
                        <td className="mono">AS{a.asn}</td>
                        <td>{a.org ?? "—"}</td>
                        <td className="num">{formatInt(a.count, locale)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
            <p className="prose muted" style={{ marginTop: "1rem" }}>
              {story.where.prose}
            </p>
          </div>
        </div>
      </section>

      <section className="section" id="ip-versions">
        <div className="section-head">
          <KastroStar size={11} />
          <span className="index">04</span>
          <h2>{story.ipVersions.heading}</h2>
          <span className="label sub">{story.ipVersions.sub}</span>
        </div>
        <IpVersionComparison
          ipv4={totals.ipv4Attempts24h}
          ipv6={totals.ipv6Attempts24h}
          locale={locale}
          copy={story.ipVersions}
        />
      </section>

      <section className="section" id="credentials">
        <div className="section-head">
          <KastroStar size={11} />
          <span className="index">05</span>
          <h2>{story.credentials.heading}</h2>
          <span className="label sub">{story.credentials.sub}</span>
        </div>
        <div className="two-col">
          <CredentialBoard credentials={data.credentials} locale={locale} />
          <div>
            <div className="two-col">
              <MiniBoard title={story.credentials.topUsernames} rows={data.usernames} locale={locale} />
              <MiniBoard title={story.credentials.topPasswords} rows={data.passwords} locale={locale} />
            </div>
            {data.clients.length > 0 && (
              <div style={{ marginTop: "2rem" }}>
                <MiniBoard title={story.credentials.tooling} rows={data.clients} locale={locale} />
              </div>
            )}
            <p className="prose muted" style={{ marginTop: "1.5rem" }}>
              {story.credentials.prose}
            </p>
          </div>
        </div>
      </section>

      <section className="section" id="attck">
        <div className="section-head">
          <KastroStar size={11} />
          <span className="index">06</span>
          <h2>{story.attck.heading}</h2>
          <span className="label sub">{story.attck.sub}</span>
        </div>
        <p className="prose" style={{ marginBottom: "1.5rem" }}>
          {story.attck.intro}
        </p>
        <AttckTable attck={data.attck} locale={locale} />
        <p className="prose muted" style={{ marginTop: "1.25rem" }}>
          {story.attck.outro}
        </p>
      </section>

      <section className="section" id="defense">
        <div className="section-head">
          <KastroStar size={11} />
          <span className="index">07</span>
          <h2>{story.defense.heading}</h2>
          <span className="label sub">{story.defense.sub}</span>
        </div>
        <div className="card-grid">
          {story.defense.cards.map((card, i) => {
            const ids = CARD_TECHNIQUES[i];
            return (
              <div className="card" key={card.title}>
                <span className="label">
                  {card.label(ids ? formatInt(observed(ids), locale) : "")}
                </span>
                <h3>{card.title}</h3>
                <p>{card.body}</p>
                <p className="fix">{card.fix}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="section" id="method">
        <div className="section-head">
          <KastroStar size={11} />
          <span className="index">08</span>
          <h2>{story.method.heading}</h2>
          <span className="label sub">{story.method.sub}</span>
        </div>
        <div className="two-col">
          <div className="prose">{story.method.how}</div>
          <div className="prose">{story.method.data}</div>
        </div>
      </section>

      <footer className="footer">
        <span className="label">
          <KastroStar size={12} /> {story.footer.credit}
        </span>
        <a className="label" href={REPO_URL} rel="noopener noreferrer">
          {story.footer.source}
        </a>
        <span className="label">{story.footer.privacy}</span>
        <span className="label label--accent">{story.footer.tagline}</span>
      </footer>
    </div>
  );
}
