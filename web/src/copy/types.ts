import type { ReactNode } from "react";
import type { Locale } from "@/lib/format";

export type { Locale };

/**
 * Copy that crosses the server → client boundary (LiveTicker,
 * KioskControls) must stay flat serializable strings. Everything else
 * renders on the server and may hold JSX; interpolated sentences are
 * functions so each locale controls its own word order.
 */

export interface TickerCopy {
  loginAttempts: string;
  lifetimeNote: string;
  last24h: string;
  oneEveryPrefix: string;
  oneEverySuffix: string;
  sources: string;
  sourcesNote: string;
  firstAttack: string;
  firstAttackNote: string;
  updatedPrefix: string;
  updatedSuffix: string;
}

export interface KioskControlsCopy {
  updated: string;
  fullscreen: string;
}

export interface UiCopy {
  credTable: { rank: string; userPass: string; tries: string };
  attckTable: { technique: string; tactic: string; observed: string };
  countryTable: { rank: string; country: string; attempts: string; share: string };
  mapAria: string;
  legend: { fewer: string; more: string; none: string };
  mapTooltipCount: (count: string, n: number) => string;
  mapTooltipNone: string;
  mapUnknown: string;
  chartAria: (granularity: "hour" | "day", span: number) => string;
  chartCaption: (granularity: "hour" | "day", span: number, peak: string) => string;
  chartTooltip: (count: string, n: number) => string;
}

export interface DefenseCard {
  label: (observed: string) => ReactNode;
  title: string;
  body: ReactNode;
  fix: ReactNode;
}

export interface StoryCopy {
  nav: {
    numbers: string;
    map: string;
    ipVersions: string;
    credentials: string;
    attck: string;
    defense: string;
    method: string;
    dashboard: string;
  };
  hero: {
    eyebrow: string;
    sensor: string;
    location: string;
    title: ReactNode;
    standfirst: (delay: string) => ReactNode;
  };
  numbers: {
    heading: string;
    sub: (since: string) => ReactNode;
    calloutLabel: string;
    callout: ReactNode;
  };
  clock: { heading: string; sub: string; prose: ReactNode };
  where: { heading: string; sub: string; asnHeading: string; prose: ReactNode };
  ipVersions: {
    heading: string;
    sub: string;
    ipv4: string;
    ipv6: string;
    attempts: string;
    share: string;
    ratio: (ratio: string) => ReactNode;
    noTraffic: ReactNode;
    prose: ReactNode;
  };
  credentials: {
    heading: string;
    sub: string;
    topUsernames: string;
    topPasswords: string;
    tooling: string;
    prose: ReactNode;
  };
  attck: { heading: string; sub: string; intro: ReactNode; outro: ReactNode };
  defense: { heading: string; sub: string; cards: DefenseCard[] };
  method: { heading: string; sub: string; how: ReactNode; data: ReactNode };
  footer: { credit: ReactNode; source: string; privacy: string; tagline: string };
  ticker: TickerCopy;
}

export interface KioskCopy {
  telemetry: string;
  noSource: string;
  backLink: string;
  loginAttempts: string;
  last24h: string;
  sources: string;
  sessions: string;
  commands: string;
  firstAttack: (delay: string) => string;
  oneEvery: (rate: string) => string;
  topCredentials: string;
  attemptsPerHour: string;
  topCountries: string;
  topUsernames: string;
  topPasswords: string;
  controls: KioskControlsCopy;
}

export interface MetaCopy {
  title: string;
  description: string;
  ogTitle: string;
  ogDescription: string;
  kioskTitle: string;
  kioskDescription: string;
}

export interface Copy {
  locale: Locale;
  meta: MetaCopy;
  story: StoryCopy;
  kiosk: KioskCopy;
  ui: UiCopy;
}
