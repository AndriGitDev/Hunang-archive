/**
 * In-memory token bucket. One bucket per key (client IP), plus the
 * caller can use a fixed key for a global limit. Honest limitation:
 * per-process only — fine for a single-instance ingest.
 */
export class TokenBucket {
  private buckets = new Map<string, { tokens: number; updated: number }>();

  constructor(
    private readonly capacity: number,
    private readonly refillPerSecond: number,
    private readonly maxKeys = 10_000,
  ) {}

  /** Returns true if the request is allowed. */
  take(key: string, now: number = Date.now()): boolean {
    let b = this.buckets.get(key);
    if (!b) {
      if (this.buckets.size >= this.maxKeys) this.evictOldest(now);
      b = { tokens: this.capacity, updated: now };
      this.buckets.set(key, b);
    }
    const elapsed = (now - b.updated) / 1000;
    b.tokens = Math.min(this.capacity, b.tokens + elapsed * this.refillPerSecond);
    b.updated = now;
    if (b.tokens >= 1) {
      b.tokens -= 1;
      return true;
    }
    return false;
  }

  private evictOldest(now: number): void {
    let oldestKey: string | null = null;
    let oldestTime = now;
    for (const [k, v] of this.buckets) {
      if (v.updated <= oldestTime) {
        oldestTime = v.updated;
        oldestKey = k;
      }
    }
    if (oldestKey !== null) this.buckets.delete(oldestKey);
  }
}
