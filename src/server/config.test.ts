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
