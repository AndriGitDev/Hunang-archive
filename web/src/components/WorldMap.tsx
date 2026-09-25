import { geoNaturalEarth1, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import worldData from "world-atlas/countries-110m.json";
import iso3166 from "iso-3166-1";
import { countryName, formatInt, formatShare, type Locale } from "@/lib/format";
import { getCopy } from "@/copy";
import type { CountRow } from "@/lib/data";

/**
 * Server-rendered choropleth: pure SVG, zero client JavaScript, built
 * from aggregate per-country counts only. Honey-colored by volume on a
 * log scale (attack volume is heavy-tailed).
 */

const SHADES = [
  "var(--map-shade-1)",
  "var(--map-shade-2)",
  "var(--map-shade-3)",
  "var(--map-shade-4)",
  "var(--map-shade-5)",
] as const;
const NO_DATA = "var(--map-none)";

interface CountryFeature {
  type: "Feature";
  id?: string | number;
  properties: { name?: string };
  geometry: GeoJSON.Geometry;
}

export function WorldMap({ countries, locale = "en" }: { countries: CountRow[]; locale?: Locale }) {
  const { ui } = getCopy(locale);
  // topojson → geojson features
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const topo = worldData as any;
  const features = (feature(topo, topo.objects.countries) as unknown as {
    features: CountryFeature[];
  }).features.filter((f) => String(f.id) !== "010"); // drop Antarctica

  const counts = new Map(countries.filter((c) => c.key !== "??").map((c) => [c.key, c.count]));
  const max = Math.max(1, ...counts.values());

  const shadeFor = (count: number | undefined): string => {
    if (!count) return NO_DATA;
    const t = Math.log(count + 1) / Math.log(max + 1);
    return SHADES[Math.min(SHADES.length - 1, Math.floor(t * SHADES.length))]!;
  };

  const width = 960;
  const height = 460;
  const projection = geoNaturalEarth1().fitSize([width, height], {
    type: "FeatureCollection",
    features,
  } as never);
  const path = geoPath(projection);

  return (
    <div>
      <div className="map-frame">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={ui.mapAria}
          style={{ display: "block", width: "100%", height: "auto" }}
        >
          {features.map((f) => {
            const numeric = String(f.id ?? "").padStart(3, "0");
            const alpha2 = iso3166.whereNumeric(numeric)?.alpha2;
            const count = alpha2 ? counts.get(alpha2) : undefined;
            const d = path(f as never);
            if (!d) return null;
            const name =
              locale === "is" && alpha2
                ? countryName(alpha2, locale)
                : f.properties.name ?? ui.mapUnknown;
            return (
              <path key={numeric + (f.properties.name ?? "")} d={d} fill={shadeFor(count)} stroke="var(--map-stroke)" strokeWidth={0.4}>
                <title>
                  {name}
                  {count ? ui.mapTooltipCount(formatInt(count, locale), count) : ui.mapTooltipNone}
                </title>
              </path>
            );
          })}
        </svg>
      </div>
      <div className="legend label">
        <span>{ui.legend.fewer}</span>
        {SHADES.map((s) => (
          <span key={s} className="swatch" style={{ background: s }} />
        ))}
        <span>{ui.legend.more}</span>
        <span style={{ marginLeft: "1rem" }}>
          <span className="swatch" style={{ background: NO_DATA }} /> {ui.legend.none}
        </span>
      </div>
    </div>
  );
}

export function CountryTable({ countries, locale = "en" }: { countries: CountRow[]; locale?: Locale }) {
  const { ui } = getCopy(locale);
  const total = countries.reduce((s, c) => s + c.count, 0) || 1;
  const top = countries.slice(0, 10);
  const max = top[0]?.count ?? 1;
  return (
    <table>
      <thead>
        <tr>
          <th>{ui.countryTable.rank}</th>
          <th>{ui.countryTable.country}</th>
          <th className="num">{ui.countryTable.attempts}</th>
          <th className="num">{ui.countryTable.share}</th>
        </tr>
      </thead>
      <tbody>
        {top.map((c, i) => (
          <tr key={c.key}>
            <td className="rank">{String(i + 1).padStart(2, "0")}</td>
            <td>
              {countryName(c.key, locale)}
              <span
                className="countbar"
                style={{ width: `${Math.max(2, (c.count / max) * 100)}%` }}
                aria-hidden
              />
            </td>
            <td className="num">{formatInt(c.count, locale)}</td>
            <td className="num">{formatShare(c.count / total, locale)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
