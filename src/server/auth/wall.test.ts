/**
 * The authentication wall (identity-access: "Route protection"). It is
 * deny-by-default: every route needs a session unless it declares itself
 * public. The route-inventory eval below is the guarantee that no route
 * leaks, whichever module added it.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import type { FastifyInstance } from 'fastify'

import { buildApp, type BuildAppOptions } from '../app.js'
import { loadConfig } from '../config.js'
import { FakePoolFacade } from '../../platform/db/fake-pool.js'
import { destinationPath } from '../../platform/i18n/segments.js'
import type { WeatherMcpClient } from '../../platform/weather-mcp/types.js'
import { createTestSession, TEST_PILOT_PASSWORD } from './test-session.js'

function makeConfig() {
  return loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgres://localhost/ga',
    SESSION_SECRET: 's'.repeat(48),
  })
}

/** A weather client that records every call and never returns data. */
function spyWeatherMcp(): WeatherMcpClient & { calls: number } {
  const refuse = async () => {
    client.calls++
    return { ok: false as const, error: { kind: 'provider_error' as const, message: 'spy' } }
  }
  const client = {
    calls: 0,
    getMetar: refuse,
    getTaf: refuse,
    getNotams: refuse,
    getSigmet: refuse,
    decodeMetar: refuse,
    close: async () => {},
  }
  return client
}

async function makeApp(overrides: Partial<BuildAppOptions> = {}): Promise<FastifyInstance> {
  return buildApp({
    config: makeConfig(),
    pool: new FakePoolFacade(),
    checkDatabase: async () => true,
    weatherMcp: spyWeatherMcp(),
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

function formBody(fields: Record<string, string>): string {
  return Object.entries(fields)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')
}

const signInFor = (path: string, locale = 'es') =>
  `/${locale}/auth/sign-in?next=${encodeURIComponent(path)}`

// --- 2.2: the global hook ---------------------------------------------------

test('a route that declares nothing is protected: anonymous redirects, signed-in renders', async () => {
  const pool = new FakePoolFacade()
  const app = await makeApp({
    pool,
    plugins: [
      async (instance) => {
        instance.get('/:locale/unmarked', async () => 'UNMARKED-CONTENT')
      },
    ],
  })

  const anonymous = await app.inject({ method: 'GET', url: '/pt/unmarked?x=1' })
  assert.equal(anonymous.statusCode, 302)
  assert.equal(anonymous.headers.location, signInFor('/pt/unmarked?x=1', 'pt'))
  assert.ok(!anonymous.body.includes('UNMARKED-CONTENT'))

  const { cookie } = await createTestSession(pool)
  const signedIn = await app.inject({ method: 'GET', url: '/pt/unmarked', headers: { cookie } })
  assert.equal(signedIn.statusCode, 200)
  assert.equal(signedIn.body, 'UNMARKED-CONTENT')
  await app.close()
})

test('an anonymous fragment request to an undeclared route gets HX-Redirect, not the fragment', async () => {
  const app = await makeApp({
    plugins: [
      async (instance) => {
        instance.get('/:locale/unmarked-fragment', async () => 'FRAGMENT-CONTENT')
      },
    ],
  })
  const res = await app.inject({
    method: 'GET',
    url: '/es/unmarked-fragment',
    headers: { 'hx-request': 'true' },
  })
  assert.equal(res.statusCode, 401)
  assert.equal(res.headers['hx-redirect'], signInFor('/es/unmarked-fragment'))
  assert.equal(res.body, '')
  await app.close()
})

test('an anonymous POST to a protected route is redirected before CSRF or body handling', async () => {
  let handled = false
  const app = await makeApp({
    plugins: [
      async (instance) => {
        instance.post('/:locale/unmarked-action', async () => {
          handled = true
          return 'DONE'
        })
      },
    ],
  })
  const res = await app.inject({
    method: 'POST',
    url: '/es/unmarked-action',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: 'a=1',
  })
  assert.equal(res.statusCode, 302)
  assert.equal(res.headers.location, signInFor('/es/unmarked-action'))
  assert.equal(handled, false, 'the handler never ran')
  await app.close()
})

// --- 2.3: the public list ----------------------------------------------------

test('public routes stay reachable anonymously', async () => {
  const app = await makeApp()
  for (const url of ['/es/auth/sign-in', '/pt/auth/sign-in', '/es/auth/register']) {
    const res = await app.inject({ method: 'GET', url })
    assert.equal(res.statusCode, 200, `${url} renders anonymously`)
  }
  for (const url of ['/health/live', '/health/ready']) {
    const res = await app.inject({ method: 'GET', url })
    assert.equal(res.statusCode, 200, `${url} answers probes without a session`)
  }
  const root = await app.inject({
    method: 'GET',
    url: '/',
    headers: { 'accept-language': 'es-ES,es;q=0.9' },
  })
  assert.equal(root.statusCode, 302)
  assert.equal(root.headers.location, '/es', 'the root redirect runs, then the wall applies')

  // Assets are only served once built (the static plugin is skipped
  // otherwise). Either way the stylesheet must never be walled.
  for (const asset of ['/assets/app.css', '/assets/favicon.svg']) {
    const res = await app.inject({ method: 'GET', url: asset })
    assert.ok(
      !(res.headers.location ?? '').includes('/auth/sign-in'),
      `${asset}, which the sign-in screen needs, is not behind the wall`,
    )
  }
  await app.close()
})

// --- 2.4: deny-by-default eval ------------------------------------------------

/** The complete public surface (identity-access: "Route protection"). Adding
 * to it is a deliberate, reviewed change. Static-asset routes are checked
 * separately because they exist only when assets are built. */
const EXPECTED_PUBLIC_ROUTES = [
  'GET /',
  'GET /:locale/auth/register',
  'GET /:locale/auth/sign-in',
  'GET /health/live',
  'GET /health/ready',
  'POST /:locale/auth/register',
  'POST /:locale/auth/sign-in',
  'POST /:locale/auth/sign-out',
]

/** A concrete URL for a route pattern: every parameter becomes a
 * well-formed id and the locale parameter a supported locale. */
function concreteUrl(pattern: string): string {
  return pattern
    .replace(/:locale\b/g, 'es')
    .replace(/:[A-Za-z]+/g, '00000000-0000-4000-8000-000000000000')
    .replace(/\*$/, 'x')
}

test('eval: protection is deny-by-default across every registered route', async () => {
  const app = await makeApp()
  await app.ready()
  const routes = app.routeInventory.filter((r) => r.method === 'GET' || r.method === 'POST')
  assert.ok(routes.length > 50, 'the inventory records the full route table')

  const assets = routes.filter((r) => r.url.startsWith('/assets/'))
  for (const r of assets) assert.ok(r.public, `${r.method} ${r.url} is public`)

  const publicRoutes = routes
    .filter((r) => r.public && !r.url.startsWith('/assets/'))
    .map((r) => `${r.method} ${r.url}`)
    .sort()
  assert.deepEqual(publicRoutes, EXPECTED_PUBLIC_ROUTES, 'the public surface is exactly the list')

  for (const r of routes.filter((route) => !route.public)) {
    const url = concreteUrl(r.url)
    const res = await app.inject({
      method: r.method as 'GET' | 'POST',
      url,
      ...(r.method === 'POST'
        ? { headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: '' }
        : {}),
    })
    assert.equal(res.statusCode, 302, `${r.method} ${r.url} redirects an anonymous request`)
    assert.match(
      res.headers.location ?? '',
      /^\/(es|pt|en)\/auth\/sign-in\?next=/,
      `${r.method} ${r.url} redirects to sign-in`,
    )
  }
  await app.close()
})

// --- 2.5: previously open pages ---------------------------------------------

test('previously open pages are walled and perform no weather lookup for an anonymous visitor', async () => {
  const weatherMcp = spyWeatherMcp()
  const app = await makeApp({ weatherMcp })
  const weather = destinationPath('weather', 'es')
  const cases: Array<{ url: string; hx?: boolean }> = [
    { url: '/es' },
    { url: '/pt' },
    { url: weather },
    { url: `${weather}?icao=LEMD` },
    { url: `${weather}?icao=LEMD`, hx: true },
    { url: '/es/resumen-meteorologico' },
    { url: '/es/resumen-meteorologico', hx: true },
    { url: destinationPath('documents', 'es') },
  ]
  for (const { url, hx } of cases) {
    const res = await app.inject({
      method: 'GET',
      url,
      headers: hx ? { 'hx-request': 'true' } : {},
    })
    const locale = url.split('/')[1] ?? 'es'
    if (hx) {
      assert.equal(res.statusCode, 401, `${url} (htmx) is refused`)
      assert.equal(res.headers['hx-redirect'], signInFor(url, locale))
    } else {
      assert.equal(res.statusCode, 302, `${url} redirects`)
      assert.equal(res.headers.location, signInFor(url, locale))
    }
    for (const forbidden of ['METAR', 'TAF', 'NOTAM', 'LEMD 0', '<aside']) {
      assert.ok(!res.body.includes(forbidden), `${url} body must not contain ${forbidden}`)
    }
  }
  assert.equal(weatherMcp.calls, 0, 'no weather lookup on behalf of an anonymous visitor')
  await app.close()
})

// --- 2.6: return-target round trip ------------------------------------------

test('the requested path and query survive the sign-in round trip', async () => {
  const pool = new FakePoolFacade()
  const app = await makeApp({ pool })
  const { pilot } = await createTestSession(pool, { email: 'round-trip@example.com' })
  const requested = `${destinationPath('weather', 'es')}?icao=SKBO`

  const walled = await app.inject({ method: 'GET', url: requested })
  assert.equal(walled.statusCode, 302)
  const signInUrl = walled.headers.location as string
  assert.equal(signInUrl, signInFor(requested))

  const page = await app.inject({ method: 'GET', url: signInUrl })
  assert.equal(page.statusCode, 200)
  assert.match(page.body, /name="next" value="\/es\/meteorologia\?icao=SKBO"/)
  const res = await app.inject({
    method: 'POST',
    url: '/es/auth/sign-in',
    headers: { cookie: cookieHeader(page), 'content-type': 'application/x-www-form-urlencoded' },
    payload: formBody({
      email: pilot.email,
      password: TEST_PILOT_PASSWORD,
      csrfToken: csrfFrom(page.body),
      next: new URL(signInUrl, 'http://x').searchParams.get('next') ?? '',
    }),
  })
  assert.equal(res.statusCode, 302)
  assert.equal(res.headers.location, requested)
  await app.close()
})
