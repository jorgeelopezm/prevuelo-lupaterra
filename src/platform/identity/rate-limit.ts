export interface RateLimitOptions {
  limit: number
  windowMs: number
}

/**
 * In-memory sliding-window rate limiter keyed by an arbitrary string (account
 * email, source IP). Non-disclosing by construction: callers must apply the
 * same generic rejection regardless of which key tripped.
 */
export class SlidingWindowRateLimiter {
  private readonly hits = new Map<string, number[]>()

  constructor(private readonly options: RateLimitOptions) {}

  /**
   * Record a hit and return `true` when still within the limit, `false` when
   * the window is exhausted. A rejected attempt is not counted again.
   */
  tryAcquire(key: string): boolean {
    const now = Date.now()
    const cutoff = now - this.options.windowMs
    const recent = (this.hits.get(key) ?? []).filter((t) => t > cutoff)
    if (recent.length >= this.options.limit) {
      this.hits.set(key, recent)
      return false
    }
    recent.push(now)
    this.hits.set(key, recent)
    return true
  }

  /** Attempts recorded in the current window for a key. */
  count(key: string): number {
    const cutoff = Date.now() - this.options.windowMs
    return (this.hits.get(key) ?? []).filter((t) => t > cutoff).length
  }

  reset(key: string): void {
    this.hits.delete(key)
  }
}
