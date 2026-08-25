/**
 * Response cache with a configurable time-to-live. Repeated calls for the same
 * tool arguments within the TTL are served without a second upstream request.
 */
export class ResponseCache {
  private readonly entries = new Map<string, { value: unknown; fetchedAt: number }>()

  constructor(private readonly ttlMs: number) {}

  /**
   * Returns the cached value and its age in seconds, or `null` on a miss or
   * when the entry is older than the configured TTL.
   */
  get<T>(key: string): { value: T; ageSeconds: number } | null {
    const entry = this.entries.get(key)
    if (!entry) return null
    const ageMs = Date.now() - entry.fetchedAt
    if (this.ttlMs <= 0 || ageMs > this.ttlMs) {
      this.entries.delete(key)
      return null
    }
    return { value: entry.value as T, ageSeconds: Math.floor(ageMs / 1000) }
  }

  set(key: string, value: unknown): void {
    this.entries.set(key, { value, fetchedAt: Date.now() })
  }

  clear(): void {
    this.entries.clear()
  }

  get size(): number {
    return this.entries.size
  }
}
