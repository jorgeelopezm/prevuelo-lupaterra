import { test } from 'node:test'
import assert from 'node:assert/strict'

import type { FastifyInstance } from 'fastify'

import { buildApp, type BuildAppOptions } from '../app.js'
import { loadConfig } from '../config.js'
import { FakePoolFacade } from '../../platform/db/fake-pool.js'

function makeConfig() {
  return loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgres://localhost/ga',
    SESSION_SECRET: 's'.repeat(48),
    // These tests sign pilots up through the registration route.
    REGISTRATION_ENABLED: 'true',
  })
}

async function makeApp(overrides: Partial<BuildAppOptions> = {}) {
  return buildApp({ config: makeConfig(), checkDatabase: async () => true, ...overrides })
}

function csrfFrom(html: string): string {
  const match = /name="csrfToken" value="([^"]+)"/.exec(html)
  assert.ok(match, 'page must embed a csrf token')
  return match[1] as string
}

function cookieHeader(res: { cookies: Array<{ name: string; value: string }> }): string {
  return res.cookies.map((c) => `${c.name}=${c.value}`).join('; ')
}

function formBody(fields: Record<string, string>): string {
  return Object.entries(fields)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')
}

async function signUpPilot(app: FastifyInstance): Promise<string> {
  const page = await app.inject({ method: 'GET', url: '/es/auth/register' })
  const csrf = csrfFrom(page.body)
  const cookie = cookieHeader(page)
  const res = await app.inject({
    method: 'POST',
    url: '/es/auth/register',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    payload: formBody({
      email: 'piloto@example.com',
      displayName: 'Piloto de Prueba',
      password: 'super-secret-1234',
      csrfToken: csrf,
    }),
  })
  const sessionCookie = res.cookies.find((c) => c.name === 'ga_session')?.value ?? ''
  return `ga_session=${sessionCookie}`
}

test('a fragment request renders the partial without the document shell', async () => {
  const app = await makeApp({ pool: new FakePoolFacade() })
  const cookie = await signUpPilot(app)
  const fragment = await app.inject({
    method: 'GET',
    url: '/es/meteorologia',
    headers: { cookie, 'hx-request': 'true' },
  })
  assert.equal(fragment.statusCode, 200)
  assert.ok(!fragment.body.includes('<html'), 'no document shell')
  assert.ok(!fragment.body.includes('<head>'), 'no head')
  assert.ok(!fragment.body.includes('<aside'), 'no sidebar')
  assert.ok(!fragment.body.includes('<body'), 'no body wrapper')
  assert.ok(fragment.body.includes('Indicadores OACI'), 'the partial content is present')
  await app.close()
})

test('the same route requested as a full page embeds that exact fragment', async () => {
  const app = await makeApp({ pool: new FakePoolFacade() })
  const cookie = await signUpPilot(app)
  const fragment = await app.inject({
    method: 'GET',
    url: '/es/meteorologia',
    headers: { cookie, 'hx-request': 'true' },
  })
  const page = await app.inject({ method: 'GET', url: '/es/meteorologia', headers: { cookie } })
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
  const app = await makeApp({ pool: new FakePoolFacade() })
  const cookie = await signUpPilot(app)
  const fragment = await app.inject({
    method: 'GET',
    url: '/en/weather',
    headers: { cookie, 'hx-request': 'true' },
  })
  assert.equal(fragment.statusCode, 200)
  assert.match(fragment.headers['content-type'] ?? '', /text\/html/)
  assert.ok(fragment.body.includes('ICAO indicators'), 'localized screen content (en)')
  assert.ok(!fragment.body.includes('PRE-VUELO'), 'branding lives only in the shell')
  await app.close()
})

test('the aircraft screen fragment renders the real screen, not the shared placeholder', async () => {
  const app = await makeApp({ pool: new FakePoolFacade() })
  const cookie = await signUpPilot(app)
  const fragment = await app.inject({
    method: 'GET',
    url: '/es/aeronave',
    headers: { cookie, 'hx-request': 'true' },
  })
  assert.equal(fragment.statusCode, 200)
  assert.ok(!fragment.body.includes('<aside'), 'no sidebar in a fragment response')
  assert.ok(
    fragment.body.includes('Ninguna aeronave registrada'),
    'the real empty state, not the shared "En desarrollo" placeholder text',
  )
  assert.ok(!fragment.body.includes('En desarrollo'), 'not the shared placeholder notice')

  const page = await app.inject({ method: 'GET', url: '/es/aeronave', headers: { cookie } })
  assert.ok(page.body.includes('<aside'), 'full page has the shell')
  assert.ok(page.body.includes(fragment.body.trim()), 'full page embeds the same fragment markup')
  await app.close()
})

test('the risk screen fragment renders the real screen, not the shared placeholder', async () => {
  const app = await makeApp({ pool: new FakePoolFacade() })
  const cookie = await signUpPilot(app)
  const fragment = await app.inject({
    method: 'GET',
    url: '/es/riesgo',
    headers: { cookie, 'hx-request': 'true' },
  })
  assert.equal(fragment.statusCode, 200)
  assert.ok(!fragment.body.includes('<aside'), 'no sidebar in a fragment response')
  assert.ok(
    fragment.body.includes('Sin planes de vuelo'),
    'the real empty state, not the shared "En desarrollo" placeholder text',
  )
  assert.ok(!fragment.body.includes('En desarrollo'), 'not the shared placeholder notice')

  const page = await app.inject({ method: 'GET', url: '/es/riesgo', headers: { cookie } })
  assert.ok(page.body.includes('<aside'), 'full page has the shell')
  assert.ok(page.body.includes(fragment.body.trim()), 'full page embeds the same fragment markup')
  await app.close()
})
