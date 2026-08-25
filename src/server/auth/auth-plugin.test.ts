import { test } from 'node:test'
import assert from 'node:assert/strict'

import type { FastifyInstance } from 'fastify'

import { buildApp, type BuildAppOptions } from '../app.js'
import { loadConfig } from '../config.js'
import { createRequireAuthHook } from './auth-plugin.js'
import { createCsrfToken } from '../../platform/identity/csrf.js'
import { tokenDigest } from '../../platform/identity/tokens.js'
import { FakePoolFacade } from '../../platform/db/fake-pool.js'

const SECRET = 's'.repeat(48)
const DEV_EMAIL = 'piloto@ga-core.local'
const DEV_PASSWORD = 'piloto-dev-1234'

function makeConfig() {
  return loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgres://localhost/ga',
    SESSION_SECRET: SECRET,
    AUTH_MAX_FAILED_ATTEMPTS: '3',
    AUTH_FAILURE_WINDOW_MINUTES: '15',
  })
}

async function makeApp(overrides: Partial<BuildAppOptions> = {}): Promise<FastifyInstance> {
  const pool = overrides.pool ?? new FakePoolFacade()
  return buildApp({
    config: makeConfig(),
    pool,
    checkDatabase: async () => true,
    ...overrides,
  })
}

function csrfFrom(html: string): string {
  const match = /name="csrfToken" value="([^"]+)"/.exec(html)
  assert.ok(match, 'page must embed a csrf token')
  return match[1] as string
}

function cookieHeader(res: { cookies: Array<{ name: string; value: string }> }): string {
  return res.cookies.map((c) => `${c.name}=${c.value}`).join('; ')
}

function sessionCookie(res: { cookies: Array<{ name: string; value: string }> }): string {
  return res.cookies.find((c) => c.name === 'ga_session')?.value ?? ''
}

function formBody(fields: Record<string, string>): string {
  return Object.entries(fields)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')
}

async function registerViaHttp(app: FastifyInstance, fields: Record<string, string> = {}) {
  const page = await app.inject({ method: 'GET', url: '/es/auth/register' })
  const csrf = csrfFrom(page.body)
  const cookie = cookieHeader(page)
  return app.inject({
    method: 'POST',
    url: '/es/auth/register',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    payload: formBody({
      email: DEV_EMAIL,
      displayName: 'Piloto de Desarrollo',
      password: DEV_PASSWORD,
      csrfToken: csrf,
      ...fields,
    }),
  })
}

test('registration creates an account and signs the pilot in', async () => {
  const pool = new FakePoolFacade()
  const app = await makeApp({ pool })
  const res = await registerViaHttp(app)
  assert.equal(res.statusCode, 302)
  assert.equal(res.headers.location, '/es')
  assert.ok(sessionCookie(res).length > 0)
  assert.equal(pool.pilots.length, 1)
  await app.close()
})

test('a duplicate registration (case-insensitive) is rejected', async () => {
  const app = await makeApp()
  await registerViaHttp(app)
  const res = await registerViaHttp(app, { email: 'PILOTO@ga-core.local' })
  assert.equal(res.statusCode, 409)
  assert.match(res.body, /ya existe una cuenta/i)
  await app.close()
})

test('sign-in rotates the session: the prior session cookie is invalidated', async () => {
  const pool = new FakePoolFacade()
  const app = await makeApp({ pool })
  const first = await registerViaHttp(app)
  const token1 = sessionCookie(first)
  assert.ok(token1.length > 0)

  // The pilot is already authenticated; force a fresh sign-in with the existing
  // session cookie present (the fixation scenario). CSRF must be minted over the
  // session token that will be attached.
  const csrfOverSession = createCsrfToken(SECRET, token1)
  const res = await app.inject({
    method: 'POST',
    url: '/es/auth/sign-in',
    headers: {
      cookie: `ga_session=${token1}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    payload: formBody({
      email: DEV_EMAIL,
      password: DEV_PASSWORD,
      csrfToken: csrfOverSession,
    }),
  })
  assert.equal(res.statusCode, 302)
  const token2 = sessionCookie(res)
  assert.ok(token2.length > 0)
  assert.notEqual(token2, token1, 'a new session identifier must be issued')

  // The prior session is gone from the store; the new one is live.
  assert.equal(
    pool.sessions.some((s) => s.token_hash === tokenDigest(token1)),
    false,
  )
  assert.equal(
    pool.sessions.some((s) => s.token_hash === tokenDigest(token2)),
    true,
  )
  await app.close()
})

test('sign-out destroys the server-side session and the old cookie no longer authenticates', async () => {
  const pool = new FakePoolFacade()
  const app = await makeApp({
    pool,
    plugins: [
      async (instance) => {
        instance.get(
          '/:locale/secret',
          {
            onRequest: createRequireAuthHook((req) => {
              const locale = (req.params as { locale: string }).locale
              return `/${locale}/auth/sign-in?next=${encodeURIComponent(req.url)}`
            }),
          },
          async () => 'TOP-SECRET-CONTENT',
        )
      },
    ],
  })
  const registered = await registerViaHttp(app)
  const token = sessionCookie(registered)

  const csrf = createCsrfToken(SECRET, token)
  const out = await app.inject({
    method: 'POST',
    url: '/es/auth/sign-out',
    headers: { cookie: `ga_session=${token}`, 'content-type': 'application/x-www-form-urlencoded' },
    payload: formBody({ csrfToken: csrf }),
  })
  assert.equal(out.statusCode, 302)
  assert.equal(pool.sessions.length, 0, 'server-side session destroyed')

  // Reusing the prior cookie no longer authenticates: a protected route redirects.
  const protectedRes = await app.inject({
    method: 'GET',
    url: '/es/secret',
    headers: { cookie: `ga_session=${token}` },
  })
  assert.equal(protectedRes.statusCode, 302)
  assert.match(protectedRes.headers.location ?? '', /\/auth\/sign-in\?next=/)
  await app.close()
})

test('failed sign-in is generic and does not disclose account existence', async () => {
  const app = await makeApp()
  // Register a pilot, then try wrong passwords against both the real and an
  // unknown account: the response body must be identical.
  await registerViaHttp(app)
  const page = await app.inject({ method: 'GET', url: '/es/auth/sign-in' })
  const csrf = csrfFrom(page.body)
  const cookie = cookieHeader(page)
  const post = (email: string) =>
    app.inject({
      method: 'POST',
      url: '/es/auth/sign-in',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      payload: formBody({ email, password: 'wrong-password-1', csrfToken: csrf }),
    })
  const known = await post(DEV_EMAIL)
  const unknown = await post('no-such@example.com')
  assert.equal(known.statusCode, 401)
  assert.equal(unknown.statusCode, 401)
  const alertOf = (html: string) => /<p role="alert">([^<]+)<\/p>/.exec(html)?.[1] ?? ''
  const knownAlert = alertOf(known.body)
  const unknownAlert = alertOf(unknown.body)
  assert.equal(knownAlert, unknownAlert, 'the failure message does not disclose account existence')
  assert.match(knownAlert, /no válidos|inválidos/i)
  assert.ok(!knownAlert.includes(DEV_EMAIL) && !knownAlert.includes('no-such@example.com'))
  await app.close()
})

test('sign-in rate limiting rejects beyond the threshold with a non-disclosing message', async () => {
  const app = await makeApp()
  const page = await app.inject({ method: 'GET', url: '/es/auth/sign-in' })
  const csrf = csrfFrom(page.body)
  const cookie = cookieHeader(page)

  const attempt = () =>
    app.inject({
      method: 'POST',
      url: '/es/auth/sign-in',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      payload: formBody({ email: 'rate@example.com', password: 'wrong-pass-123', csrfToken: csrf }),
    })

  const codes: number[] = []
  for (let i = 0; i < 4; i++) codes.push((await attempt()).statusCode)
  assert.deepEqual(codes, [401, 401, 401, 429])
  const limited = await attempt()
  assert.equal(limited.statusCode, 429)
  assert.match(limited.body, /más tarde|later/i)
  await app.close()
})

test('route protection: anonymous requests redirect to sign-in with a return path and leak no content', async () => {
  const app = await makeApp({
    plugins: [
      async (instance) => {
        instance.get(
          '/:locale/secret',
          {
            onRequest: createRequireAuthHook((req) => {
              const locale = (req.params as { locale: string }).locale
              return `/${locale}/auth/sign-in?next=${encodeURIComponent(req.url)}`
            }),
          },
          async () => 'TOP-SECRET-CONTENT',
        )
      },
    ],
  })

  const res = await app.inject({ method: 'GET', url: '/es/secret' })
  assert.equal(res.statusCode, 302)
  assert.match(res.headers.location ?? '', /\/es\/auth\/sign-in\?next=%2Fes%2Fsecret/)
  assert.ok(!res.body.includes('TOP-SECRET-CONTENT'))
  await app.close()
})

test('route protection: fragment requests get a client-actionable HX-Redirect', async () => {
  const app = await makeApp({
    plugins: [
      async (instance) => {
        instance.get(
          '/:locale/secret-fragment',
          {
            onRequest: createRequireAuthHook((req) => {
              const locale = (req.params as { locale: string }).locale
              return `/${locale}/auth/sign-in?next=${encodeURIComponent(req.url)}`
            }),
          },
          async () => 'TOP-SECRET-FRAGMENT',
        )
      },
    ],
  })
  const res = await app.inject({
    method: 'GET',
    url: '/es/secret-fragment',
    headers: { 'hx-request': 'true' },
  })
  assert.equal(res.statusCode, 401)
  assert.match(String(res.headers['hx-redirect'] ?? ''), /\/es\/auth\/sign-in\?next=/)
  assert.ok(!res.body.includes('TOP-SECRET-FRAGMENT'))
  await app.close()
})

test('the return path is honored after a successful sign-in', async () => {
  const app = await makeApp()
  await registerViaHttp(app)

  const page = await app.inject({ method: 'GET', url: '/es/auth/sign-in?next=%2Fes%2Fsecret' })
  const csrf = csrfFrom(page.body)
  const cookie = cookieHeader(page)
  const res = await app.inject({
    method: 'POST',
    url: '/es/auth/sign-in',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    payload: formBody({
      email: DEV_EMAIL,
      password: DEV_PASSWORD,
      csrfToken: csrf,
      next: '/es/secret',
    }),
  })
  assert.equal(res.statusCode, 302)
  assert.equal(res.headers.location, '/es/secret')
  await app.close()
})

test('CSRF: absent token rejected 403 with no state change', async () => {
  const pool = new FakePoolFacade()
  const app = await makeApp({ pool })
  const res = await app.inject({
    method: 'POST',
    url: '/es/auth/sign-in',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: formBody({ email: DEV_EMAIL, password: DEV_PASSWORD }),
  })
  assert.equal(res.statusCode, 403)
  assert.equal(pool.pilots.length, 0, 'no state change on rejection')
  await app.close()
})

test('CSRF: a token from another session is rejected 403', async () => {
  const app = await makeApp()
  const page = await app.inject({ method: 'GET', url: '/es/auth/sign-in' })
  const nonceCookie = cookieHeader(page)
  // Mint the token for a session identity that will NOT be attached.
  const foreignToken = createCsrfToken(SECRET, 'some-other-session')
  const res = await app.inject({
    method: 'POST',
    url: '/es/auth/sign-in',
    headers: { cookie: nonceCookie, 'content-type': 'application/x-www-form-urlencoded' },
    payload: formBody({ email: DEV_EMAIL, password: DEV_PASSWORD, csrfToken: foreignToken }),
  })
  assert.equal(res.statusCode, 403)
  await app.close()
})
