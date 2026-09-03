import { test } from 'node:test'
import assert from 'node:assert/strict'

import { ConfigError, loadConfig } from './config.js'

const SECRET = 's'.repeat(48)

function baseEnv(
  overrides: Record<string, string | undefined> = {},
): Record<string, string | undefined> {
  return {
    NODE_ENV: 'test',
    DATABASE_URL: 'postgres://localhost/ga',
    SESSION_SECRET: SECRET,
    ...overrides,
  }
}

test('missing required DATABASE_URL aborts and names the variable', () => {
  const env = { NODE_ENV: 'test', SESSION_SECRET: SECRET }
  assert.throws(
    () => loadConfig(env),
    (err) =>
      err instanceof ConfigError &&
      err.message.includes('DATABASE_URL') &&
      (err as ConfigError).issues.some((i) => i.path[0] === 'DATABASE_URL'),
  )
})

test('missing SESSION_SECRET aborts and names the variable', () => {
  const env = { NODE_ENV: 'test', DATABASE_URL: 'postgres://localhost/ga' }
  assert.throws(
    () => loadConfig(env),
    (err) => err instanceof ConfigError && err.message.includes('SESSION_SECRET'),
  )
})

test('malformed value names the variable and its constraint', () => {
  const env = baseEnv({ PORT: 'not-a-number' })
  assert.throws(
    () => loadConfig(env),
    (err) =>
      err instanceof ConfigError && err.message.includes('PORT') && /PORT/i.test(err.message),
  )
})

test('error output never contains a supplied secret value', () => {
  const memorableSecret = 'SuperSecret-Value-!-12345-Sup3rSecre7'
  const env = { NODE_ENV: 'test', SESSION_SECRET: memorableSecret } // no DATABASE_URL
  assert.throws(
    () => loadConfig(env),
    (err) => err instanceof ConfigError && !err.message.includes(memorableSecret),
  )
})

test('non-mock embedding provider without its key aborts naming the key', () => {
  const env = baseEnv({ EMBEDDING_PROVIDER: 'openai' })
  assert.throws(
    () => loadConfig(env),
    (err) => err instanceof ConfigError && err.message.includes('EMBEDDING_API_KEY'),
  )
})

test('non-mock weather provider without its key aborts naming the key', () => {
  const env = baseEnv({ WEATHER_PROVIDER: 'aemet' })
  assert.throws(
    () => loadConfig(env),
    (err) => err instanceof ConfigError && err.message.includes('AEMET_OPENDATA_API_KEY'),
  )
})

test('valid minimal environment parses and applies defaults', () => {
  const cfg = loadConfig(baseEnv())
  assert.equal(cfg.NODE_ENV, 'test')
  assert.equal(cfg.WEATHER_PROVIDER, 'mock')
  assert.equal(cfg.EMBEDDING_PROVIDER, 'mock')
  assert.equal(cfg.EMBEDDING_DIMENSIONS, 768)
  assert.equal(cfg.PORT, 3000)
  assert.equal(cfg.MCP_TRANSPORT, 'stdio')
  assert.equal(cfg.LOG_LEVEL, 'info')
})

test('valid minimal environment defaults the weather MCP client to stdio', () => {
  const cfg = loadConfig(baseEnv())
  assert.equal(cfg.WEATHER_MCP_TRANSPORT, 'stdio')
  assert.equal(cfg.WEATHER_MCP_TIMEOUT_MS, 8000)
  assert.equal(cfg.WEATHER_MCP_URL, undefined)
})

test('WEATHER_MCP_TRANSPORT http without WEATHER_MCP_URL aborts naming the variable', () => {
  const env = baseEnv({ WEATHER_MCP_TRANSPORT: 'http' })
  assert.throws(
    () => loadConfig(env),
    (err) => err instanceof ConfigError && err.message.includes('WEATHER_MCP_URL'),
  )
})

test('WEATHER_MCP_TRANSPORT http with WEATHER_MCP_URL parses successfully', () => {
  const cfg = loadConfig(
    baseEnv({ WEATHER_MCP_TRANSPORT: 'http', WEATHER_MCP_URL: 'http://localhost:3001/mcp' }),
  )
  assert.equal(cfg.WEATHER_MCP_TRANSPORT, 'http')
  assert.equal(cfg.WEATHER_MCP_URL, 'http://localhost:3001/mcp')
})

test('avwx weather provider without its token aborts naming AVWX_API_TOKEN, not another provider\'s credential', () => {
  const env = baseEnv({ WEATHER_PROVIDER: 'avwx' })
  assert.throws(
    () => loadConfig(env),
    (err) =>
      err instanceof ConfigError &&
      err.message.includes('AVWX_API_TOKEN') &&
      !err.message.includes('AEMET_OPENDATA_API_KEY'),
  )
})

test('avwx weather provider with its token parses successfully', () => {
  const cfg = loadConfig(baseEnv({ WEATHER_PROVIDER: 'avwx', AVWX_API_TOKEN: 'avwx-token' }))
  assert.equal(cfg.WEATHER_PROVIDER, 'avwx')
  assert.equal(cfg.AVWX_API_TOKEN, 'avwx-token')
})

test('non-mock provider with its key set parses successfully', () => {
  const cfg = loadConfig(
    baseEnv({
      EMBEDDING_PROVIDER: 'openai',
      EMBEDDING_API_KEY: 'sk-test',
      WEATHER_PROVIDER: 'aemet',
      AEMET_OPENDATA_API_KEY: 'aemet-key',
    }),
  )
  assert.equal(cfg.EMBEDDING_PROVIDER, 'openai')
  assert.equal(cfg.WEATHER_PROVIDER, 'aemet')
})
