import { test } from 'node:test'
import assert from 'node:assert/strict'

import { ResponseCache } from '../cache.js'
import { createMockWeatherProvider } from '../provider/mock.js'
import type {
  MetarResult,
  NotamResult,
  SigmetResult,
  TafResult,
  WeatherProvider,
} from '../provider/types.js'
import { RateLimiter } from '../rate-limit.js'
import { ProviderError, ProviderTimeoutError, WeatherToolService } from './service.js'

class CountingProvider implements WeatherProvider {
  readonly id = 'counting'
  metarCalls = 0
  failMetarWith: Error | null = null
  metarDelayMs = 0

  constructor(private readonly delegate: WeatherProvider) {}

  getMetar(icaos: readonly string[]): Promise<MetarResult> {
    this.metarCalls += 1
    if (this.failMetarWith) return Promise.reject(this.failMetarWith)
    if (this.metarDelayMs > 0) {
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          if (this.failMetarWith) reject(this.failMetarWith)
          else void this.delegate.getMetar(icaos).then(resolve, reject)
        }, this.metarDelayMs)
      })
    }
    return this.delegate.getMetar(icaos)
  }

  getTaf(icaos: readonly string[]): Promise<TafResult> {
    return this.delegate.getTaf(icaos)
  }

  getNotams(icaos: readonly string[]): Promise<NotamResult> {
    return this.delegate.getNotams(icaos)
  }

  getSigmet(firs: readonly string[]): Promise<SigmetResult> {
    return this.delegate.getSigmet(firs)
  }
}

function service(
  provider: WeatherProvider,
  overrides: Partial<{ ttlMs: number; maxPerMinute: number; timeoutMs: number }> = {},
) {
  return new WeatherToolService({
    provider,
    cache: new ResponseCache(overrides.ttlMs ?? 60_000),
    rateLimiter: new RateLimiter(overrides.maxPerMinute ?? 1000),
    timeoutMs: overrides.timeoutMs ?? 5000,
  })
}

test('a cache hit within the TTL performs no second upstream request and is marked cached', async () => {
  const counting = new CountingProvider(createMockWeatherProvider())
  const svc = service(counting)

  const first = await svc.getMetar(['LEMD'])
  assert.equal(first.cached, false)
  assert.equal(counting.metarCalls, 1)

  const second = await svc.getMetar(['LEMD'])
  assert.equal(second.cached, true, 'second call is marked cached')
  assert.equal(counting.metarCalls, 1, 'no second upstream request')
  assert.ok(second.cacheAgeSeconds >= 0, 'carries its age')
})

test('a cache miss for a different indicator still reaches the provider', async () => {
  const counting = new CountingProvider(createMockWeatherProvider())
  const svc = service(counting)

  await svc.getMetar(['LEMD'])
  await svc.getMetar(['LEBL'])
  assert.equal(counting.metarCalls, 2)
})

test('the per-provider rate ceiling rejects excess calls with a retry indication', async () => {
  const counting = new CountingProvider(createMockWeatherProvider())
  const svc = service(counting, { maxPerMinute: 1 })

  await svc.getMetar(['LEMD'])
  await assert.rejects(svc.getMetar(['LEBL']), (error: unknown) => {
    assert.ok(error instanceof Error)
    assert.match(error.message, /rate limit/i)
    assert.match(error.message, /retry/i)
    return true
  })
})

test('an upstream timeout returns a structured error naming the provider with no report text', async () => {
  const counting = new CountingProvider(createMockWeatherProvider())
  counting.metarDelayMs = 500
  const svc = service(counting, { timeoutMs: 20 })

  await assert.rejects(svc.getMetar(['LEMD']), (error: unknown) => {
    assert.ok(error instanceof ProviderTimeoutError)
    assert.equal(error.provider, 'counting')
    assert.match(error.message, /timed out after 20ms/)
    assert.ok(!error.message.includes('LEMD'), 'no report content in the error')
    return true
  })
})

test('an upstream error returns a structured provider error with no report text', async () => {
  const counting = new CountingProvider(createMockWeatherProvider())
  counting.failMetarWith = new Error('upstream says 503')
  const svc = service(counting)

  await assert.rejects(svc.getMetar(['LEMD']), (error: unknown) => {
    assert.ok(error instanceof ProviderError)
    assert.equal(error.provider, 'counting')
    assert.match(error.message, /'counting' failed: upstream says 503/)
    return true
  })
})

/** A NOTAM-only upstream with its own id, optionally failing. */
function notamUpstream(id: string, failWith: Error | null = null): WeatherProvider {
  const mock = createMockWeatherProvider()
  return {
    ...mock,
    id,
    getNotams: async (icaos) => {
      if (failWith) throw failWith
      return { ...(await mock.getNotams(icaos)), provider: id }
    },
  }
}

function splitService(weather: WeatherProvider, notams: WeatherProvider, maxPerMinute = 1000) {
  return new WeatherToolService({
    provider: weather,
    notamProvider: notams,
    cache: new ResponseCache(60_000),
    rateLimiter: new RateLimiter(maxPerMinute),
    timeoutMs: 5000,
  })
}

test('get_notams is served by the NOTAM provider, and its provenance names that provider', async () => {
  const weather = new CountingProvider(createMockWeatherProvider())
  const svc = splitService(weather, notamUpstream('avwx'))
  const result = await svc.getNotams(['LEMD'])
  assert.equal(result.provider, 'avwx')
  assert.equal(weather.metarCalls, 0)
})

test('an exhausted NOTAM rate budget rejects get_notams while get_metar is still served', async () => {
  const weather = new CountingProvider(createMockWeatherProvider())
  const svc = splitService(weather, notamUpstream('avwx'), 1)
  await svc.getNotams(['LEMD'])
  await assert.rejects(svc.getNotams(['LEBL']), /rate limit/i)
  const metar = await svc.getMetar(['LEMD'])
  assert.ok(metar.entries[0]?.report, 'the weather upstream has its own budget')
})

test('a failing NOTAM upstream yields a ProviderError naming it, leaving METAR unaffected', async () => {
  const weather = new CountingProvider(createMockWeatherProvider())
  const svc = splitService(
    weather,
    notamUpstream('avwx', new Error('403 enterprise plan required')),
  )
  await assert.rejects(svc.getNotams(['LEMD']), (error: unknown) => {
    assert.ok(error instanceof ProviderError)
    assert.equal(error.provider, 'avwx')
    return true
  })
  const metar = await svc.getMetar(['LEMD'])
  assert.equal(metar.provider, 'mock')
  assert.equal(weather.metarCalls, 1)
})

test('without a separate NOTAM provider, NOTAMs come from the weather provider as before', async () => {
  const svc = service(createMockWeatherProvider())
  const result = await svc.getNotams(['LEMD'])
  assert.equal(result.provider, 'mock')
})
