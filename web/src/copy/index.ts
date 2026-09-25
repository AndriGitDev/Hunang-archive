import { en } from "./en";
import { is } from "./is";
import type { Copy, Locale } from "./types";

const COPY: Record<Locale, Copy> = { en, is };

export function getCopy(locale: Locale): Copy {
  return COPY[locale];
}

export { REPO_URL } from "./constants";
export type { Copy, Locale, TickerCopy, KioskControlsCopy } from "./types";
