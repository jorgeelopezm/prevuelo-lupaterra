import type { ResponseCache } from '../cache.js'
import { decodeMetar, type DecodedMetar } from '../decode.js'
import type {
  MetarResult,
  NotamResult,
  SigmetResult,
  TafResult,
  WeatherLocale,
  WeatherProvenance,
  WeatherProvider,
} from '../provider/types.js'
import type { RateLimiter } from '../rate-limit.js'

export interface ToolServiceDeps {
  provider: WeatherProvider
  cache: ResponseCache
  rateLimiter: RateLimiter
  /** Upper bound per provider request; exceeded requests return a timeout error. */
  timeoutMs: number
}

/** Structured upstream timeout; carries the provider name and no report text. */
export class ProviderTimeoutError extends Error {
  readonly provider: string
  readonly timeoutMs: number

  constructor(provider: string, timeoutMs: number) {
    super(`Provider '${provider}' timed out after ${timeoutMs}ms`)
    this.name = 'ProviderTimeoutError'
    this.provider = provider
    this.timeoutMs = timeoutMs
  }
}

/** Structured upstream failure; carries the provider name and no report text. */
export class ProviderError extends Error {
  readonly provider: string

  constructor(provider: string, cause: string) {
    super(`Provider '${provider}' failed: ${cause}`)
    this.name = 'ProviderError'
    this.provider = provider
  }
}

/**
 * Tool service: the single path from a tool call to a provider result. It
 * applies the per-provider rate ceiling, serves cached responses within the
 * TTL without a second upstream request, and converts provider hangs or
 * failures into structured errors that carry no report content.
 */
export class WeatherToolService {
  private readonly provider: WeatherProvider
  private readonly cache: ResponseCache
  private readonly rateLimiter: RateLimiter
  private readonly timeoutMs: number

  constructor(deps: ToolServiceDeps) {
    this.provider = deps.provider
    this.cache = deps.cache
    this.rateLimiter = deps.rateLimiter
    this.timeoutMs = deps.timeoutMs
  }

  getMetar(icaos: readonly string[]): Promise<MetarResult> {
    return this.cachedFetch(`get_metar:${icaos.join(',')}`, () => this.provider.getMetar(icaos))
  }

  getTaf(icaos: readonly string[]): Promise<TafResult> {
    return this.cachedFetch(`get_taf:${icaos.join(',')}`, () => this.provider.getTaf(icaos))
  }

  getNotams(icaos: readonly string[]): Promise<NotamResult> {
    return this.cachedFetch(`get_notams:${icaos.join(',')}`, () => this.provider.getNotams(icaos))
  }

  getSigmet(firs: readonly string[]): Promise<SigmetResult> {
    return this.cachedFetch(`get_sigmet:${firs.join(',')}`, () => this.provider.getSigmet(firs))
  }

  /** Decoding is a pure function over the caller's report; no provider involved. */
  decode(raw: string, locale: WeatherLocale): DecodedMetar {
    return decodeMetar(raw, locale)
  }

  private async cachedFetch<T extends WeatherProvenance>(
    key: string,
    fetch: () => Promise<T>,
  ): Promise<T> {
    this.rateLimiter.acquire(this.provider.id)
    const hit = this.cache.get<T>(key)
    if (hit) return { ...hit.value, cached: true, cacheAgeSeconds: hit.ageSeconds }
    const fresh = await this.withTimeout(() => fetch())
    this.cache.set(key, fresh)
    return fresh
  }

  private async withTimeout<T>(work: () => Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new ProviderTimeoutError(this.provider.id, this.timeoutMs)),
        this.timeoutMs,
      )
    })
    try {
      return await Promise.race([work(), timeout])
    } catch (error) {
      if (error instanceof ProviderTimeoutError) throw error
      throw new ProviderError(
        this.provider.id,
        error instanceof Error ? error.message : String(error),
      )
    } finally {
      if (timer) clearTimeout(timer)
    }
  }
}
