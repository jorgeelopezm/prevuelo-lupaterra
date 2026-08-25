/**
 * Per-provider sliding-window rate limiter. Calls that would exceed the
 * configured ceiling within the window are rejected with a retry-after
 * indication rather than dispatched upstream.
 */
export class RateLimitError extends Error {
  readonly provider: string
  readonly retryAfterSeconds: number

  constructor(provider: string, retryAfterSeconds: number) {
    super(`Rate limit exceeded for provider '${provider}'; retry after ${retryAfterSeconds}s`)
    this.name = 'RateLimitError'
    this.provider = provider
    this.retryAfterSeconds = retryAfterSeconds
  }
}

export class RateLimiter {
  private readonly windows = new Map<string, number[]>()

  constructor(
    private readonly maxPerMinute: number,
    private readonly windowMs = 60_000,
  ) {}

  /**
   * Records one call for `providerId` or throws {@link RateLimitError} with a
   * retry indication when the ceiling is already reached in the current window.
   */
  acquire(providerId: string): void {
    const now = Date.now()
    const window = (this.windows.get(providerId) ?? []).filter(
      (timestamp) => now - timestamp < this.windowMs,
    )
    if (window.length >= this.maxPerMinute) {
      const oldest = window[0] ?? now
      const retryAfterSeconds = Math.max(1, Math.ceil((oldest + this.windowMs - now) / 1000))
      throw new RateLimitError(providerId, retryAfterSeconds)
    }
    window.push(now)
    this.windows.set(providerId, window)
  }
}
