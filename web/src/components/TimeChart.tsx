import { formatInt, type Locale } from "@/lib/format";
import { getCopy } from "@/copy";
import type { TimeBucket } from "@/lib/data";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/**
 * Server-rendered SVG bar chart. Buckets are filled densely up to the
 * last aggregation time so gaps mean "zero attacks", not "missing data".
 */
export function TimeChart({
  buckets,
  granularity,
  span,
  until,
  stretch = false,
  locale = "en",
}: {
  buckets: TimeBucket[];
  granularity: "hour" | "day";
  span: number; // how many buckets to show
  until: number; // typically last_aggregated_at
  stretch?: boolean; // fill the parent's height instead of keeping aspect ratio (kiosk)
  locale?: Locale;
}) {
  const { ui } = getCopy(locale);
  const size = granularity === "hour" ? HOUR : DAY;
  const end = Math.floor(until / size) * size;
  const start = end - (span - 1) * size;

  const byStart = new Map(buckets.map((b) => [b.bucketStart, b.count]));
  const dense: { t: number; count: number }[] = [];
  for (let t = start; t <= end; t += size) dense.push({ t, count: byStart.get(t) ?? 0 });

  const max = Math.max(1, ...dense.map((d) => d.count));
  const W = 480;
  const H = 130;
  const PAD_BOTTOM = 4;
  const gap = 1.5;
  const barW = (W - gap * (dense.length - 1)) / dense.length;

  return (
    <figure className="chart-frame">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio={stretch ? "none" : undefined}
        role="img"
        aria-label={ui.chartAria(granularity, span)}
        style={{ display: "block", width: "100%", height: stretch ? "100%" : "auto" }}
      >
        {dense.map((d, i) => {
          const h = Math.max(d.count > 0 ? 2 : 0.75, (d.count / max) * (H - PAD_BOTTOM - 14));
          return (
            <rect
              key={d.t}
              x={i * (barW + gap)}
              y={H - PAD_BOTTOM - h}
              width={barW}
              height={h}
              fill={d.count > 0 ? "var(--chart-bar)" : "var(--chart-zero)"}
            >
              <title>
                {new Date(d.t).toISOString().slice(0, granularity === "hour" ? 13 : 10)}
                {granularity === "hour" ? ":00 UTC" : ""} {ui.chartTooltip(formatInt(d.count, locale), d.count)}
              </title>
            </rect>
          );
        })}
        <line x1={0} y1={H - PAD_BOTTOM + 1.5} x2={W} y2={H - PAD_BOTTOM + 1.5} stroke="var(--chart-axis)" strokeWidth={3} />
      </svg>
      <figcaption className="label">
        {ui.chartCaption(granularity, span, formatInt(max, locale))}
      </figcaption>
    </figure>
  );
}
