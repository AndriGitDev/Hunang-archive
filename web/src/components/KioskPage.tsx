import Link from "next/link";
import { getDashboardData } from "@/lib/data";
import { formatDelay, formatInt, formatRate, formatUtc, type Locale } from "@/lib/format";
import { getCopy } from "@/copy";
import { TimeChart } from "@/components/TimeChart";
import { CountryTable, WorldMap } from "@/components/WorldMap";
import { CredentialBoard, MiniBoard } from "@/components/Boards";
import { KioskControls } from "@/components/KioskControls";
import { KastroStar } from "@/components/KastroStar";
import { LocaleSwitch } from "@/components/LocaleSwitch";

const REVALIDATE = 300;

/**
 * Full-screen wall-display view of the same rollup data as the front
 * page, laid out for a 1080p (16:9) screen with no scrolling. Dark
 * palette lives in kiosk.css; the data path is identical to `/`.
 */
export async function KioskPage({ locale }: { locale: Locale }) {
  const { kiosk } = getCopy(locale);
  const { totals, ...data } = await getDashboardData(REVALIDATE);
  const storyHref = locale === "is" ? "/is" : "/";

  return (
    <div className="kiosk-frame">
      <header className="kiosk-header">
        <span className="kiosk-wordmark">
          <KastroStar size={18} />
          hunang
        </span>
        <span className="label">{kiosk.telemetry}</span>
        {!data.hasData && <span className="label">{kiosk.noSource}</span>}
        <span className="kiosk-header-right">
          <Link href={storyHref} className="label kiosk-back">{kiosk.backLink}</Link>
          <LocaleSwitch locale={locale} kiosk />
          <KioskControls updatedLabel={formatUtc(totals.lastAggregatedAt)} copy={kiosk.controls} />
        </span>
      </header>

      <main className="kiosk-grid">
        <section className="kiosk-col" style={{ gridArea: "left" }}>
          <div className="kiosk-panel">
            <span className="label">{kiosk.loginAttempts}</span>
            <div className="kvalue kvalue--hero">{formatInt(totals.totalLoginAttempts, locale)}</div>
            <div className="kstat-row">
              <div className="kstat">
                <span className="label">{kiosk.last24h}</span>
                <div className="kvalue">{formatInt(totals.attempts24h, locale)}</div>
              </div>
              <div className="kstat">
                <span className="label">{kiosk.sources}</span>
                <div className="kvalue">{formatInt(totals.uniqueSources, locale)}</div>
              </div>
              <div className="kstat">
                <span className="label">{kiosk.sessions}</span>
                <div className="kvalue">{formatInt(totals.sessions, locale)}</div>
              </div>
              <div className="kstat">
                <span className="label">{kiosk.commands}</span>
                <div className="kvalue">{formatInt(totals.commandsEntered, locale)}</div>
              </div>
            </div>
            <p className="label kiosk-note">
              {kiosk.firstAttack(formatDelay(totals.firstAttackDelayS, locale))}
              {totals.attempts24h > 0 && (
                <> · {kiosk.oneEvery(formatRate(totals.attempts24h, locale, "short"))}</>
              )}
            </p>
          </div>
          <div className="kiosk-panel kiosk-panel--grow">
            <span className="label kiosk-panel-title">{kiosk.topCredentials}</span>
            <CredentialBoard credentials={data.credentials.slice(0, 8)} locale={locale} />
          </div>
        </section>

        <section className="kiosk-panel kiosk-map" style={{ gridArea: "map" }}>
          <WorldMap countries={data.countries} locale={locale} />
        </section>

        <section className="kiosk-panel" style={{ gridArea: "chart" }}>
          <span className="label kiosk-panel-title">{kiosk.attemptsPerHour}</span>
          <TimeChart
            buckets={data.hourly}
            granularity="hour"
            span={48}
            until={totals.lastAggregatedAt ?? 0}
            stretch
            locale={locale}
          />
        </section>

        <section className="kiosk-col" style={{ gridArea: "right" }}>
          <div className="kiosk-panel kiosk-panel--grow">
            <span className="label kiosk-panel-title">{kiosk.topCountries}</span>
            <CountryTable countries={data.countries} locale={locale} />
          </div>
          <div className="kiosk-panel">
            <div className="kiosk-minis">
              <MiniBoard title={kiosk.topUsernames} rows={data.usernames.slice(0, 7)} locale={locale} />
              <MiniBoard title={kiosk.topPasswords} rows={data.passwords.slice(0, 7)} locale={locale} />
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
