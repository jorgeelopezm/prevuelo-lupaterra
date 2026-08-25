import { test } from 'node:test'
import assert from 'node:assert/strict'

import { buildApp } from './app.js'
import { loadConfig } from './config.js'

function makeConfig(overrides: Record<string, string> = {}) {
  return loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgres://localhost/ga',
    SESSION_SECRET: 's'.repeat(48),
    ...overrides,
  })
}

test('unknown routes render a localized 404 inside the shell without leaking internals', async () => {
  const app = await buildApp({ config: makeConfig(), checkDatabase: async () => true })
  const res = await app.inject({ method: 'GET', url: '/es/this-route-does-not-exist' })
  assert.equal(res.statusCode, 404)
  assert.match(res.headers['content-type'] ?? '', /text\/html/)
  assert.ok(res.body.includes('Página no encontrada'))
  assert.ok(res.body.includes('<html'), 'rendered inside the shell')
  assert.ok(!res.body.includes('Cannot GET'))
  assert.ok(!res.body.includes('node_modules'))
  assert.ok(!/at .*\.ts/.test(res.body), 'no file paths or stack frames')
  await app.close()
})

test('unsupported locale segments return a localized 404', async () => {
  const app = await buildApp({ config: makeConfig(), checkDatabase: async () => true })
  const res = await app.inject({ method: 'GET', url: '/zz/whatever' })
  assert.equal(res.statusCode, 404)
  assert.match(res.headers['content-type'] ?? '', /text\/html/)
  assert.ok(res.body.includes('Página no encontrada'))
  await app.close()
})

test('a production 500 renders the localized page with the correlation id and no internals', async () => {
  const app = await buildApp({
    config: makeConfig({ NODE_ENV: 'production' }),
    checkDatabase: async () => true,
    plugins: [
      async (instance) => {
        instance.get('/:locale/boom', async () => {
          throw new Error('boom: SELECT secret FROM pilots')
        })
      },
    ],
  })
  const res = await app.inject({ method: 'GET', url: '/es/boom' })
  assert.equal(res.statusCode, 500)
  assert.match(res.headers['content-type'] ?? '', /text\/html/)

  const correlationId = String(res.headers['x-correlation-id'])
  assert.ok(correlationId.length > 0)
  assert.ok(res.body.includes(correlationId), 'the 500 page carries the correlation id')

  // Production must not leak the exception details, SQL, or internal paths.
  // (The word 'boom' itself may legitimately appear in the locale-switcher
  // links that preserve the current path verbatim.)
  assert.match(res.body, /Algo salió mal/, 'generic localized message is shown')
  assert.ok(!res.body.includes('SELECT secret'), 'no SQL leaked into the page')
  assert.ok(!res.body.includes('Error: boom'), 'no error message leaked into the page')
  assert.ok(!res.body.includes('node_modules'))
  assert.ok(!/at .*\.ts/.test(res.body))
  await app.close()
})

test('development mode may include the error message on a 500 page', async () => {
  const app = await buildApp({
    config: makeConfig({ NODE_ENV: 'development' }),
    checkDatabase: async () => true,
    plugins: [
      async (instance) => {
        instance.get('/:locale/boom', async () => {
          throw new Error('dev-only detail visible here')
        })
      },
    ],
  })
  const res = await app.inject({ method: 'GET', url: '/es/boom' })
  assert.equal(res.statusCode, 500)
  assert.match(res.headers['content-type'] ?? '', /text\/html/)
  assert.ok(res.body.includes('dev-only detail visible here'))
  await app.close()
})
