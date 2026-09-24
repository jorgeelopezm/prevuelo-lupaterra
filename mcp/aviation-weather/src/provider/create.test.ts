import { test } from 'node:test'
import assert from 'node:assert/strict'

import { AvwxWeatherProvider } from './avwx.js'
import { AwcWeatherProvider } from './awc.js'
import { createProviders, createWeatherProvider, WeatherProviderConfigError } from './create.js'

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

test('awc constructs with no credential', () => {
  const provider = createWeatherProvider({ provider: 'awc' })
  assert.ok(provider instanceof AwcWeatherProvider)
  assert.equal(provider.id, 'awc')
})

for (const name of ['ipma', 'ead'] as const) {
  test(`${name} aborts as not-yet-implemented under its own name, not asking for an AEMET key`, () => {
    assert.throws(
      () => createWeatherProvider({ provider: name }),
      (error: unknown) =>
        error instanceof WeatherProviderConfigError &&
        error.message.includes(`'${name}'`) &&
        /not implemented yet/.test(error.message) &&
        !/AEMET_OPENDATA_API_KEY/.test(error.message),
    )
  })
}

test('createProviders: awc weather with avwx NOTAMs builds two distinct providers', () => {
  const { weather, notams } = createProviders({
    provider: 'awc',
    notamProvider: 'avwx',
    avwxApiToken: 'test-token',
  })
  assert.equal(weather.id, 'awc')
  assert.equal(notams.id, 'avwx')
  assert.notEqual(weather, notams)
})

test('createProviders: awc weather with mock NOTAMs', () => {
  const { weather, notams } = createProviders({ provider: 'awc', notamProvider: 'mock' })
  assert.equal(weather.id, 'awc')
  assert.equal(notams.id, 'mock')
})

test('createProviders: a NOTAM-capable weather provider serves NOTAMs from the same instance', () => {
  const { weather, notams } = createProviders({
    provider: 'avwx',
    notamProvider: 'avwx',
    avwxApiToken: 'test-token',
  })
  assert.equal(weather, notams)
})

test('createProviders: awc with no NOTAM provider aborts naming NOTAM_PROVIDER', () => {
  assert.throws(
    () => createProviders({ provider: 'awc', notamProvider: null }),
    (error: unknown) =>
      error instanceof WeatherProviderConfigError && /NOTAM_PROVIDER/.test(error.message),
  )
})
