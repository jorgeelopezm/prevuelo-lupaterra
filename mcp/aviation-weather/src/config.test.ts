import { test } from 'node:test'
import assert from 'node:assert/strict'

import { ConfigError, loadConfig, resolveNotamProvider } from './config.js'

test('mock is the default provider with no credentials and startup succeeds', () => {
  const config = loadConfig({})
  assert.equal(config.WEATHER_PROVIDER, 'mock')
  assert.equal(config.MCP_TRANSPORT, 'stdio')
  assert.equal(config.MCP_PORT, 3001)
  assert.equal(config.MCP_CACHE_TTL_SECONDS, 60)
  assert.equal(config.MCP_RATE_LIMIT_PER_MINUTE, 30)
  assert.equal(config.MCP_PROVIDER_TIMEOUT_MS, 5000)
})

test('MCP configuration does not require web-only variables', () => {
  const config = loadConfig({ WEATHER_PROVIDER: 'mock' })
  assert.equal(config.WEATHER_PROVIDER, 'mock')
  assert.equal(config.LOG_LEVEL, 'info')
})

test('a non-mock provider without its credential aborts naming provider and key', () => {
  assert.throws(
    () => loadConfig({ WEATHER_PROVIDER: 'aemet' }),
    (error: unknown) => {
      assert.ok(error instanceof ConfigError)
      assert.match(error.message, /WEATHER_PROVIDER/)
      assert.match(error.message, /'aemet'/)
      assert.match(error.message, /AEMET_OPENDATA_API_KEY/)
      return true
    },
  )
})

test('a non-mock provider with its key parses successfully', () => {
  const config = loadConfig({
    WEATHER_PROVIDER: 'aemet',
    AEMET_OPENDATA_API_KEY: 'aemet-key',
  })
  assert.equal(config.WEATHER_PROVIDER, 'aemet')
  assert.equal(config.AEMET_OPENDATA_API_KEY, 'aemet-key')
})

test('avwx without its token aborts naming AVWX_API_TOKEN specifically', () => {
  assert.throws(
    () => loadConfig({ WEATHER_PROVIDER: 'avwx' }),
    (error: unknown) => {
      assert.ok(error instanceof ConfigError)
      assert.match(error.message, /AVWX_API_TOKEN/)
      assert.doesNotMatch(error.message, /AEMET_OPENDATA_API_KEY/)
      return true
    },
  )
})

test('avwx with its token parses successfully', () => {
  const config = loadConfig({ WEATHER_PROVIDER: 'avwx', AVWX_API_TOKEN: 'avwx-token' })
  assert.equal(config.WEATHER_PROVIDER, 'avwx')
  assert.equal(config.AVWX_API_TOKEN, 'avwx-token')
})

test('awc with a mock NOTAM provider parses, and the NOTAM provider resolves to it', () => {
  const config = loadConfig({ WEATHER_PROVIDER: 'awc', NOTAM_PROVIDER: 'mock' })
  assert.equal(config.WEATHER_PROVIDER, 'awc')
  assert.equal(resolveNotamProvider(config), 'mock')
})

test('awc without a NOTAM provider aborts naming NOTAM_PROVIDER — no silent sample NOTAMs', () => {
  assert.throws(
    () => loadConfig({ WEATHER_PROVIDER: 'awc' }),
    (error: unknown) => error instanceof ConfigError && /NOTAM_PROVIDER/.test(error.message),
  )
})

test('an unset NOTAM provider defaults to a NOTAM-capable weather provider', () => {
  assert.equal(resolveNotamProvider(loadConfig({})), 'mock')
  assert.equal(
    resolveNotamProvider(loadConfig({ WEATHER_PROVIDER: 'avwx', AVWX_API_TOKEN: 't' })),
    'avwx',
  )
})

test('malformed MCP_PORT names the variable and its constraint', () => {
  assert.throws(
    () => loadConfig({ MCP_PORT: 'not-a-number' }),
    (error: unknown) => error instanceof ConfigError && error.message.includes('MCP_PORT'),
  )
})

test('PORT is used when MCP_PORT is not set, for a platform runtime service', () => {
  const config = loadConfig({ PORT: '19042' })
  assert.equal(config.MCP_PORT, 19042)
})

test('an explicit MCP_PORT always wins over PORT', () => {
  const config = loadConfig({ PORT: '19042', MCP_PORT: '4000' })
  assert.equal(config.MCP_PORT, 4000)
})

test('with neither PORT nor MCP_PORT set, the schema default applies', () => {
  const config = loadConfig({})
  assert.equal(config.MCP_PORT, 3001)
})
