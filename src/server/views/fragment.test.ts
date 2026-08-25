import { test } from 'node:test'
import assert from 'node:assert/strict'

import { buildApp } from '../app.js'
import { loadConfig } from '../config.js'

function makeConfig() {
  return loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgres://localhost/ga',
    SESSION_SECRET: 's'.repeat(48),
  })
}

async function makeApp() {
  return buildApp({ config: makeConfig(), checkDatabase: async () => true })
}

test('a fragment request renders the partial without the document shell', async () => {
  const app = await makeApp()
  const fragment = await app.inject({
    method: 'GET',
    url: '/es/meteorologia',
    headers: { 'hx-request': 'true' },
  })
  assert.equal(fragment.statusCode, 200)
  assert.ok(!fragment.body.includes('<html'), 'no document shell')
  assert.ok(!fragment.body.includes('<head>'), 'no head')
  assert.ok(!fragment.body.includes('<aside'), 'no sidebar')
  assert.ok(!fragment.body.includes('<body'), 'no body wrapper')
  assert.ok(fragment.body.includes('En desarrollo'), 'the partial content is present')
  await app.close()
})

test('the same route requested as a full page embeds that exact fragment', async () => {
  const app = await makeApp()
  const fragment = await app.inject({
    method: 'GET',
    url: '/es/meteorologia',
    headers: { 'hx-request': 'true' },
  })
  const page = await app.inject({ method: 'GET', url: '/es/meteorologia' })
  assert.equal(page.statusCode, 200)
  assert.match(page.headers['content-type'] ?? '', /text\/html/)
  assert.ok(page.body.includes('<html'), 'full page has the document shell')
  assert.ok(page.body.includes('<aside'), 'full page has the shell')

  const needle = fragment.body.trim()
  assert.ok(needle.length > 0)
  assert.ok(
    page.body.includes(needle),
    'the fragment markup is contained in the full-page response',
  )
  await app.close()
})

test('fragments still render the components, not a shell stub', async () => {
  const app = await makeApp()
  const fragment = await app.inject({
    method: 'GET',
    url: '/en/weather',
    headers: { 'hx-request': 'true' },
  })
  assert.equal(fragment.statusCode, 200)
  assert.match(fragment.headers['content-type'] ?? '', /text\/html/)
  assert.ok(fragment.body.includes('In progress'), 'localized placeholder text (en)')
  assert.ok(!fragment.body.includes('PREFLIGHT'), 'branding lives only in the shell')
  await app.close()
})
