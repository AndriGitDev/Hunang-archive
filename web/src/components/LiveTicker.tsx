"use client";

import { useEffect, useState } from "react";
import { formatDelay, formatInt, formatRate, formatUtc, type Locale } from "@/lib/format";
import type { TickerCopy } from "@/copy/types";
import type { Totals } from "@/lib/data";

/**
 * The only client-side data fetching on the site, and it only talks to
 * this site's own /api/stats route — which serves rollup totals. The
 * browser never connects anywhere near the honeypot. Labels arrive as
 * flat strings from the server parent; numbers are re-formatted here on
 * every refresh, so the formatter needs the locale too.
 */
export function LiveTicker({
  initial,
  locale = "en",
  copy,
}: {
  initial: Totals;
  locale?: Locale;
  copy: TickerCopy;
}) {
  const [totals, setTotals] = useState(initial);

  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const res = await fetch("/api/stats");
        if (res.ok) {
          const body = (await res.json()) as { totals: Totals };
          setTotals(body.totals);
        }
      } catch {
        // network hiccup — keep showing the last numbers
      }
    }, 5 * 60_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div>
      <div className="stat-grid">
        <div className="stat">
          <span className="label">{copy.loginAttempts}</span>
          <div className="value accent">{formatInt(totals.totalLoginAttempts, locale)}</div>
          <div className="note">{copy.lifetimeNote}</div>
        </div>
        <div className="stat">
          <span className="label">{copy.last24h}</span>
          <div className="value">{formatInt(totals.attempts24h, locale)}</div>
          <div className="note">
            {copy.oneEveryPrefix}
            {formatRate(totals.attempts24h, locale)}
            {copy.oneEverySuffix}
          </div>
        </div>
        <div className="stat">
          <span className="label">{copy.sources}</span>
          <div className="value">{formatInt(totals.uniqueSources, locale)}</div>
          <div className="note">{copy.sourcesNote}</div>
        </div>
        <div className="stat">
          <span className="label">{copy.firstAttack}</span>
          <div className="value accent">{formatDelay(totals.firstAttackDelayS, locale)}</div>
          <div className="note">{copy.firstAttackNote}</div>
        </div>
      </div>
      <p className="label" style={{ marginTop: "0.75rem" }}>
        <span className="live-dot" aria-hidden />
        {copy.updatedPrefix}
        {formatUtc(totals.lastAggregatedAt)}
        {copy.updatedSuffix}
      </p>
    </div>
  );
}
