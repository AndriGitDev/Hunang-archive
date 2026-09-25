import Link from "next/link";
import type { Locale } from "@/lib/format";

/**
 * Cross-locale link between the two root layouts. Navigation is a full
 * page load by design (the layouts differ), so a plain Link is enough.
 */
export function LocaleSwitch({ locale, kiosk = false }: { locale: Locale; kiosk?: boolean }) {
  const target: Locale = locale === "is" ? "en" : "is";
  const href =
    target === "is" ? (kiosk ? "/is/dashboard" : "/is") : kiosk ? "/dashboard" : "/";
  return (
    <Link href={href} className="label" lang={target} hrefLang={target} rel="alternate">
      {target === "is" ? "IS" : "EN"}
    </Link>
  );
}
