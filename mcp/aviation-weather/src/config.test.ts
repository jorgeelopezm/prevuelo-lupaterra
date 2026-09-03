import { test } from 'node:test'
import assert from 'node:assert/strict'

import { ConfigError, loadConfig } from './config.js'

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

test('malformed MCP_PORT names the variable and its constraint', () => {
  assert.throws(
    () => loadConfig({ MCP_PORT: 'not-a-number' }),
    (error: unknown) => error instanceof ConfigError && error.message.includes('MCP_PORT'),
  )
})
