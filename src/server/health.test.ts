import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Writable } from 'node:stream'

import { buildApp } from './app.js'
import { loadConfig } from './config.js'
import { createLogger, resolveCorrelationId } from './logger.js'

function makeConfig(overrides: Record<string, string | undefined> = {}) {
  return loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgres://localhost/ga',
    SESSION_SECRET: 's'.repeat(48),
    ...overrides,
  })
}

function capturingSink(lines: string[]) {
  return new Writable({
    write(chunk: unknown, _encoding, callback) {
      lines.push(String(chunk))
      callback()
    },
  })
}

test('liveness returns 200 ok', async () => {
  const app = await buildApp({
    config: makeConfig(),
    checkDatabase: async () => true,
  })
  const res = await app.inject({ method: 'GET', url: '/health/live' })
  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.json(), { status: 'ok' })
  await app.close()
})

test('readiness returns 200 and reports database up when reachable', async () => {
  const app = await buildApp({
    config: makeConfig(),
    checkDatabase: async () => true,
  })
  const res = await app.inject({ method: 'GET', url: '/health/ready' })
  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.json(), {
    status: 'ok',
    checks: { database: 'up' },
  })
  await app.close()
})

test('readiness returns 503 naming the database when unreachable', async () => {
  const app = await buildApp({
    config: makeConfig(),
    checkDatabase: async () => false,
  })
  const res = await app.inject({ method: 'GET', url: '/health/ready' })
  assert.equal(res.statusCode, 503)
  assert.deepEqual(res.json(), {
    status: 'error',
    checks: { database: 'down' },
  })
  await app.close()
})

test('readiness treats a throwing probe as unreachable', async () => {
  const app = await buildApp({
    config: makeConfig(),
    checkDatabase: async () => {
      throw new Error('connection refused')
    },
  })
  const res = await app.inject({ method: 'GET', url: '/health/ready' })
  assert.equal(res.statusCode, 503)
  assert.equal(res.json().checks.database, 'down')
  await app.close()
})

test('correlation id is generated when absent, echoed in a header, and present on every record', async () => {
  const lines: string[] = []
  const sink = capturingSink(lines)
  const logger = createLogger({
    level: 'info',
    // pino's DestinationStream type; wraps the capturing Writable.
    stream: { write: (msg: string) => sink.write(msg) },
  })

  const app = await buildApp({
    config: makeConfig(),
    logger,
    checkDatabase: async () => true,
  })

  const res = await app.inject({
    method: 'GET',
    url: '/health/live',
    headers: { cookie: 'session=top-secret-session-value' },
  })

  const echoed = res.headers['x-correlation-id']
  assert.equal(typeof echoed, 'string', 'expected a correlation id header')
  const echoedValue = echoed as string
  assert.ok(echoedValue.length > 0)

  await app.close()

  const all = lines.join('\n')
  // Every request record carries the correlation id, method, route, status,
  // locale, and duration.
  assert.match(all, /"type":"request"/)
  assert.match(all, /"method":"GET"/)
  assert.match(all, /"route":"\/health\/live"/)
  assert.match(all, /"status":200/)
  assert.match(all, /"locale":"es"/)
  assert.ok(all.includes(`"correlationId":"${echoedValue}"`), 'correlation id on record')

  // The session cookie value never leaks into output.
  assert.ok(!all.includes('top-secret-session-value'))
})

test('inbound correlation id is respected and echoed', async () => {
  const app = await buildApp({
    config: makeConfig(),
    checkDatabase: async () => true,
  })
  const res = await app.inject({
    method: 'GET',
    url: '/health/live',
    headers: { 'x-correlation-id': 'client-trace-abc' },
  })
  assert.equal(res.headers['x-correlation-id'], 'client-trace-abc')
  await app.close()
})

test('resolveCorrelationId honours a valid inbound value and otherwise generates', () => {
  assert.equal(resolveCorrelationId('inbound-1'), 'inbound-1')
  assert.equal(resolveCorrelationId(['inbound-2']), 'inbound-2')
  assert.equal(resolveCorrelationId('   ').length, 36) // uuid
  assert.equal(resolveCorrelationId(undefined).length, 36)
})
