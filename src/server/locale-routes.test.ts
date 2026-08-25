import { test } from 'node:test'
import assert from 'node:assert/strict'

import { buildApp } from './app.js'
import { loadConfig } from './config.js'

function makeConfig() {
  return loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgres://localhost/ga',
    SESSION_SECRET: 's'.repeat(48),
  })
}

test('root path redirects to the resolved locale home route', async () => {
  const app = await buildApp({ config: makeConfig(), checkDatabase: async () => true })
  const res = await app.inject({
    method: 'GET',
    url: '/',
    headers: { 'accept-language': 'pt-BR,pt;q=0.9' },
  })
  assert.equal(res.statusCode, 302)
  assert.equal(res.headers.location, '/pt')
  await app.close()
})

test('stored pilot preference wins over Accept-Language for the root redirect', async () => {
  const app = await buildApp({
    config: makeConfig(),
    checkDatabase: async () => true,
    resolveStoredLocale: async () => 'pt',
  })
  const res = await app.inject({
    method: 'GET',
    url: '/',
    headers: { 'accept-language': 'en-US,en;q=0.9' },
  })
  assert.equal(res.statusCode, 302)
  assert.equal(res.headers.location, '/pt')
  await app.close()
})

test('unsupported locale segment returns 404 rather than silently falling back', async () => {
  const app = await buildApp({ config: makeConfig(), checkDatabase: async () => true })
  const res = await app.inject({ method: 'GET', url: '/xx/anything' })
  assert.equal(res.statusCode, 404)
  assert.match(res.headers['content-type'] ?? '', /text\/html/)
  assert.match(res.body, /Página no encontrada/)
  await app.close()
})

test('a route missing under a supported locale returns 404 (no fallback)', async () => {
  const app = await buildApp({ config: makeConfig(), checkDatabase: async () => true })
  const res = await app.inject({ method: 'GET', url: '/es/no-such-route' })
  assert.equal(res.statusCode, 404)
  assert.match(res.headers['content-type'] ?? '', /text\/html/)
  assert.match(res.body, /Página no encontrada/)
  assert.ok(!res.body.includes('Cannot GET'), '404 pages never leak the framework message')
  await app.close()
})

test('health endpoints remain reachable with locale routing active', async () => {
  const app = await buildApp({ config: makeConfig(), checkDatabase: async () => true })
  const live = await app.inject({ method: 'GET', url: '/health/live' })
  assert.equal(live.statusCode, 200)
  await app.close()
})
