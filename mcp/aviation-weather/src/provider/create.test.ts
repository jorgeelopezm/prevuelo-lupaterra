import { test } from 'node:test'
import assert from 'node:assert/strict'

import { AvwxWeatherProvider } from './avwx.js'
import { createWeatherProvider, WeatherProviderConfigError } from './create.js'

test('mock is constructible with no credentials', () => {
  const provider = createWeatherProvider({ provider: 'mock' })
  assert.equal(provider.id, 'mock')
})

test('avwx without its token aborts naming AVWX_API_TOKEN', () => {
  assert.throws(
    () => createWeatherProvider({ provider: 'avwx' }),
    (error: unknown) =>
      error instanceof WeatherProviderConfigError && /AVWX_API_TOKEN/.test(error.message),
  )
})

test('avwx with its token constructs an AvwxWeatherProvider', () => {
  const provider = createWeatherProvider({ provider: 'avwx', avwxApiToken: 'test-token' })
  assert.ok(provider instanceof AvwxWeatherProvider)
  assert.equal(provider.id, 'avwx')
})

test('aemet without its key aborts naming AEMET_OPENDATA_API_KEY', () => {
  assert.throws(
    () => createWeatherProvider({ provider: 'aemet' }),
    (error: unknown) =>
      error instanceof WeatherProviderConfigError && /AEMET_OPENDATA_API_KEY/.test(error.message),
  )
})

test('aemet with its key still aborts as not-yet-implemented', () => {
  assert.throws(
    () => createWeatherProvider({ provider: 'aemet', aemetApiKey: 'key' }),
    (error: unknown) =>
      error instanceof WeatherProviderConfigError && /not implemented yet/.test(error.message),
  )
})
