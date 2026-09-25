import type { StoryCopy } from "@/copy/types";
import { formatInt, formatShare, type Locale } from "@/lib/format";

interface IpVersionComparisonProps {
  ipv4: number;
  ipv6: number;
  locale: Locale;
  copy: StoryCopy["ipVersions"];
}

export function IpVersionComparison({ ipv4, ipv6, locale, copy }: IpVersionComparisonProps) {
  const total = ipv4 + ipv6;
  const ipv4Share = total > 0 ? ipv4 / total : 0;
  const ipv6Share = total > 0 ? ipv6 / total : 0;
  const ratio = ipv6 > 0 ? ipv4 / ipv6 : null;

  return (
    <div className="ip-compare">
      <div
        className="ip-compare__visual"
        role="img"
        aria-label={`${copy.ipv4}: ${formatInt(ipv4, locale)}. ${copy.ipv6}: ${formatInt(ipv6, locale)}.`}
      >
        {total > 0 ? (
          <>
            <div className="ip-compare__side ip-compare__side--v4">
              <span className="ip-compare__version">4</span>
              <div>
                <span className="label">{copy.ipv4}</span>
                <strong>{formatInt(ipv4, locale)}</strong>
                <span>{copy.attempts}</span>
              </div>
            </div>
            <div className="ip-compare__side ip-compare__side--v6">
              <span className="ip-compare__version">6</span>
              <div>
                <span className="label">{copy.ipv6}</span>
                <strong>{formatInt(ipv6, locale)}</strong>
                <span>{copy.attempts}</span>
              </div>
            </div>
            <div className="ip-compare__rail" aria-hidden="true">
              <span style={{ width: `${ipv4Share * 100}%` }} />
            </div>
          </>
        ) : (
          <p className="ip-compare__empty">{copy.noTraffic}</p>
        )}
      </div>

      <div className="ip-compare__readout">
        <div className="ip-compare__shares">
          <div>
            <span className="label">{copy.ipv4}</span>
            <strong>{formatShare(ipv4Share, locale)}</strong>
            <span>{copy.share}</span>
          </div>
          <div>
            <span className="label">{copy.ipv6}</span>
            <strong>{formatShare(ipv6Share, locale)}</strong>
            <span>{copy.share}</span>
          </div>
        </div>
        {ratio !== null && ratio > 1 && (
          <p className="ip-compare__ratio">{copy.ratio(new Intl.NumberFormat(locale === "is" ? "is-IS" : "en-US", { maximumFractionDigits: 1 }).format(ratio))}</p>
        )}
        <p className="prose muted">{copy.prose}</p>
      </div>
    </div>
  );
}
