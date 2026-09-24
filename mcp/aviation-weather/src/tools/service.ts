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
  /** Serves METAR, TAF, and SIGMET. */
  provider: WeatherProvider
  /** Serves NOTAMs; defaults to `provider`. A distinct upstream gets its own rate budget and error naming. */
  notamProvider?: WeatherProvider
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
  private readonly notamProvider: WeatherProvider
  private readonly cache: ResponseCache
  private readonly rateLimiter: RateLimiter
  private readonly timeoutMs: number

  constructor(deps: ToolServiceDeps) {
    this.provider = deps.provider
    this.notamProvider = deps.notamProvider ?? deps.provider
    this.cache = deps.cache
    this.rateLimiter = deps.rateLimiter
    this.timeoutMs = deps.timeoutMs
  }

  getMetar(icaos: readonly string[]): Promise<MetarResult> {
    return this.cachedFetch(this.provider, `get_metar:${icaos.join(',')}`, () =>
      this.provider.getMetar(icaos),
    )
  }

  getTaf(icaos: readonly string[]): Promise<TafResult> {
    return this.cachedFetch(this.provider, `get_taf:${icaos.join(',')}`, () =>
      this.provider.getTaf(icaos),
    )
  }

  getNotams(icaos: readonly string[]): Promise<NotamResult> {
    return this.cachedFetch(this.notamProvider, `get_notams:${icaos.join(',')}`, () =>
      this.notamProvider.getNotams(icaos),
    )
  }

  getSigmet(firs: readonly string[]): Promise<SigmetResult> {
    return this.cachedFetch(this.provider, `get_sigmet:${firs.join(',')}`, () =>
      this.provider.getSigmet(firs),
    )
  }

  /** Decoding is a pure function over the caller's report; no provider involved. */
  decode(raw: string, locale: WeatherLocale): DecodedMetar {
    return decodeMetar(raw, locale)
  }

  /** Rate ceiling, cache, and error naming all belong to the upstream that serves the call. */
  private async cachedFetch<T extends WeatherProvenance>(
    upstream: WeatherProvider,
    key: string,
    fetch: () => Promise<T>,
  ): Promise<T> {
    this.rateLimiter.acquire(upstream.id)
    const cacheKey = `${upstream.id}:${key}`
    const hit = this.cache.get<T>(cacheKey)
    if (hit) return { ...hit.value, cached: true, cacheAgeSeconds: hit.ageSeconds }
    const fresh = await this.withTimeout(upstream.id, () => fetch())
    this.cache.set(cacheKey, fresh)
    return fresh
  }

  private async withTimeout<T>(providerId: string, work: () => Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new ProviderTimeoutError(providerId, this.timeoutMs)),
        this.timeoutMs,
      )
    })
    try {
      return await Promise.race([work(), timeout])
    } catch (error) {
      if (error instanceof ProviderTimeoutError) throw error
      throw new ProviderError(providerId, error instanceof Error ? error.message : String(error))
    } finally {
      if (timer) clearTimeout(timer)
    }
  }
}
