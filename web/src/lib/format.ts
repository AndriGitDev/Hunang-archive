export type Locale = "en" | "is";

const LOCALE_TAGS: Record<Locale, string> = { en: "en-US", is: "is-IS" };

const INT_FORMATS = Object.fromEntries(
  (Object.keys(LOCALE_TAGS) as Locale[]).map((l) => [l, new Intl.NumberFormat(LOCALE_TAGS[l])]),
) as Record<Locale, Intl.NumberFormat>;

const SHARE_FORMATS = Object.fromEntries(
  (Object.keys(LOCALE_TAGS) as Locale[]).map((l) => [
    l,
    new Intl.NumberFormat(LOCALE_TAGS[l], {
      style: "percent",
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }),
  ]),
) as Record<Locale, Intl.NumberFormat>;

export function formatInt(n: number, locale: Locale = "en"): string {
  return INT_FORMATS[locale].format(n);
}

export function formatShare(fraction: number, locale: Locale = "en"): string {
  return SHARE_FORMATS[locale].format(fraction);
}

// Icelandic units take the singular with 1, 21, 31… but not 11 (21 mínúta,
// 11 mínútur). All delay/rate phrases on the site place the count where the
// accusative is required (after "eftir" / "á … fresti" takes the genitive),
// so each unit carries the case its phrase needs.
function isSingular(n: number): boolean {
  return n % 10 === 1 && n % 100 !== 11;
}

export function pluralIs(n: number, singular: string, plural: string): string {
  return isSingular(n) ? singular : plural;
}

const isUnit = pluralIs;

export function formatDelay(seconds: number | null, locale: Locale = "en"): string {
  if (seconds === null) return "—";
  if (locale === "is") {
    if (seconds < 60) return `${seconds} ${isUnit(seconds, "sekúndu", "sekúndur")}`;
    const minutes = Math.round(seconds / 60);
    if (minutes < 90) return `${minutes} ${isUnit(minutes, "mínútu", "mínútur")}`;
    const hours = Math.round(minutes / 60);
    return `${hours} ${isUnit(hours, "klukkustund", "klukkustundir")}`;
  }
  if (seconds < 60) return `${seconds} seconds`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes} minutes`;
  return `${Math.round(minutes / 60)} hours`;
}

// "≈ one every {rate}" / "≈ ein á {rate} fresti" — the Icelandic long form
// is genitive because of the "á … fresti" idiom.
export function formatRate(
  perDay: number,
  locale: Locale = "en",
  style: "long" | "short" = "long",
): string {
  if (perDay <= 0) return "—";
  const seconds = Math.round(86_400 / perDay);
  if (locale === "is") {
    if (style === "short") {
      if (seconds < 120) return `${seconds} sek.`;
      return `${Math.round(seconds / 60)} mín.`;
    }
    if (seconds < 120) return `${seconds} ${isUnit(seconds, "sekúndu", "sekúndna")}`;
    const minutes = Math.round(seconds / 60);
    return `${minutes} ${isUnit(minutes, "mínútu", "mínútna")}`;
  }
  if (style === "short") {
    if (seconds < 120) return `${seconds} s`;
    return `${Math.round(seconds / 60)} min`;
  }
  if (seconds < 120) return `${seconds} seconds`;
  return `${Math.round(seconds / 60)} minutes`;
}

export function formatUtc(tsMs: number | null): string {
  if (tsMs === null) return "—";
  return new Date(tsMs).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

const COUNTRY_NAMES: Record<Locale, Intl.DisplayNames> = {
  en: new Intl.DisplayNames(["en"], { type: "region" }),
  is: new Intl.DisplayNames(["is"], { type: "region" }),
};

const UNKNOWN_COUNTRY: Record<Locale, string> = { en: "Unknown", is: "Óþekkt" };

export function countryName(alpha2: string, locale: Locale = "en"): string {
  if (alpha2 === "??") return UNKNOWN_COUNTRY[locale];
  try {
    return COUNTRY_NAMES[locale].of(alpha2) ?? alpha2;
  } catch {
    return alpha2;
  }
}
