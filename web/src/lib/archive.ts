import snapshot from "@/archive/final-rollups.json";

// The archived site reads a checked-in copy of the anonymous public rollups.
// No request to the ingest service is made by this module.
export const archive = snapshot;
export const totals = archive.totals;
export const observedAt = new Date(totals.lastAggregatedAt).toISOString();

export const integer = (value: number) => new Intl.NumberFormat("en-US").format(value);
export const percent = (part: number, whole: number) =>
  whole > 0 ? `${(100 * part / whole).toFixed(1)}%` : "—";
export const utcDay = (value: number) => new Date(value).toISOString().slice(0, 10);

export const rankedDays = [...archive.daily].sort((a, b) => b.count - a.count);
const completeDayCounts = archive.daily.slice(1, -1).map((day) => day.count).sort((a, b) => a - b);
export const medianCompleteDay = completeDayCounts[Math.floor(completeDayCounts.length / 2)] ?? 0;
export const topTwoCountryAttempts = archive.countries.slice(0, 2).reduce((sum, row) => sum + row.count, 0);
export const protocolLikeAttempts = archive.credentials
  .filter((row) => row.username.includes("\\x00") || row.password.includes("\\x00"))
  .reduce((sum, row) => sum + row.count, 0);
