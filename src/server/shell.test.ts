import { test } from 'node:test'
import assert from 'node:assert/strict'

import type { FastifyInstance } from 'fastify'

import { buildApp, type BuildAppOptions } from './app.js'
import { loadConfig } from './config.js'
import { ALL_MODULES } from '../modules/registry.js'
import { destinationPath } from '../platform/i18n/segments.js'
import { SUPPORTED_LOCALES } from '../platform/i18n/locale.js'
import { FakePoolFacade } from '../platform/db/fake-pool.js'
import { createTestSession } from './auth/test-session.js'

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

/** The shell only renders behind the wall, so shell tests run signed in. */
async function makeSignedInApp(): Promise<{ app: FastifyInstance; cookie: string }> {
  const pool = new FakePoolFacade()
  const app = await makeApp({ pool })
  const { cookie } = await createTestSession(pool)
  return { app, cookie }
}

/** A placeholder destination: its only links and controls are the shell's. */
const PLACEHOLDER_URL = destinationPath('documents', 'es')

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

const PHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15'
const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0'

test('the shell renders identical markup for phone and desktop user agents', async () => {
  const { app, cookie } = await makeSignedInApp()
  const phone = await app.inject({
    method: 'GET',
    url: PLACEHOLDER_URL,
    headers: { cookie, 'user-agent': PHONE_UA },
  })
  const desktop = await app.inject({
    method: 'GET',
    url: PLACEHOLDER_URL,
    headers: { cookie, 'user-agent': DESKTOP_UA },
  })
  assert.equal(phone.statusCode, 200)
  assert.equal(phone.body, desktop.body, 'no user-agent sniffing: one layout for all widths')
  await app.close()
})

test('all three navigation presentations render from the one destination list', async () => {
  const { app, cookie } = await makeSignedInApp()
  const res = await app.inject({ method: 'GET', url: '/es/meteorologia', headers: { cookie } })
  const html = res.body

  // Desktop sidebar (hidden below lg), off-canvas drawer, and phone tab bar.
  assert.match(html, /hidden lg:flex lg:w-56/, 'sidebar is permanent from the large breakpoint up')
  assert.match(
    html,
    /-translate-x-full peer-checked:translate-x-0/,
    'drawer is off-canvas below lg',
  )
  assert.match(html, /lg:hidden sticky bottom-0/, 'tab bar sits at the bottom below lg')

  // Every destination renders once per navigation presentation (3 presentations
  // × 6 items). Non-active destinations appear exactly 3×; the active one also
  // appears in the switcher's "same path in current locale" link.
  for (const mod of ALL_MODULES) {
    const href = destinationPath(mod.id, 'es')
    const occurrences = (html.match(new RegExp(`href="${href}"`, 'g')) ?? []).length
    assert.ok(
      occurrences >= 3,
      `destination ${mod.id} (${href}) must appear in sidebar, drawer, and tab bar`,
    )
  }
  // A destination that is NOT the current page has no switcher links, so it is
  // exactly 3×: once per presentation.
  assert.equal((html.match(/href="\/es"([^>]*)?/g) ?? []).length, 3)

  // No JS-dependent navigation: every nav control is a real hyperlink.
  const navLinks = html.match(/<a href="\/(?:es|pt|en)[^"]*"/g) ?? []
  assert.ok(navLinks.length >= 18, 'navigation is reachable as plain hyperlinks')
  assert.ok(!html.includes('onclick='), 'no click handlers in the shell')
  await app.close()
})

test('aria-current="page" marks the active destination', async () => {
  const { app, cookie } = await makeSignedInApp()

  const home = await app.inject({ method: 'GET', url: '/es', headers: { cookie } })
  assert.equal((home.body.match(/aria-current="page"/g) ?? []).length, 3)
  assert.match(home.body, /href="\/es"[^>]*aria-current="page"/)

  const weather = await app.inject({
    method: 'GET',
    url: '/es/meteorologia',
    headers: { cookie },
  })
  assert.equal((weather.body.match(/aria-current="page"/g) ?? []).length, 3)
  assert.match(weather.body, /href="\/es\/meteorologia"[^>]*aria-current="page"/)
  await app.close()
})

test('the shell cannot scroll horizontally: min-w-0 columns and no fixed pixel widths', async () => {
  const { app, cookie } = await makeSignedInApp()
  const res = await app.inject({ method: 'GET', url: PLACEHOLDER_URL, headers: { cookie } })
  const html = res.body
  assert.match(html, /min-w-0/, 'flex columns carry min-w-0 so content cannot force overflow')
  // No fixed pixel widths in the shell (the 224px sidebar is a rem-based class).
  assert.ok(!/\bw-\[[0-9]+px\]/.test(html), 'no fixed pixel widths in the shell markup')
  await app.close()
})

test('locale switcher offers the other locales and keeps the active one marked', async () => {
  const { app, cookie } = await makeSignedInApp()
  const res = await app.inject({ method: 'GET', url: '/es/meteorologia', headers: { cookie } })
  const html = res.body
  for (const code of SUPPORTED_LOCALES) {
    assert.ok(html.includes(`>${code}<`), `switcher offers ${code}`)
  }
  assert.match(html, /href="\/pt\/meteorologia"/, 'verbatim path switch to pt preserves the route')
  assert.match(html, /href="\/en\/weather"/, 'verbatim path switch to en preserves the route')
  await app.close()
})

test('the shell header shows no registration and the localized none-selected text when no aircraft is active', async () => {
  const { app, cookie } = await makeSignedInApp()
  const res = await app.inject({ method: 'GET', url: PLACEHOLDER_URL, headers: { cookie } })
  assert.ok(res.body.includes('Sin aeronave activa'))
  await app.close()
})

test('an unauthenticated request never renders the shell', async () => {
  const app = await makeApp({ pool: new FakePoolFacade() })
  const res = await app.inject({ method: 'GET', url: '/es' })
  assert.equal(res.statusCode, 302)
  assert.ok(!res.body.includes('Sin aeronave activa'))
  assert.ok(!res.body.includes('<aside'))
  await app.close()
})

test("the shell header shows the pilot's active aircraft registration when designated", async () => {
  const app = await makeApp({ pool: new FakePoolFacade() })
  const cookie = await signUpPilot(app)

  // Add and activate an aircraft through the real fleet routes.
  const formPage = await app.inject({
    method: 'GET',
    url: '/es/aeronave/aviones/nuevo',
    headers: { cookie },
  })
  const csrf = csrfFrom(formPage.body)
  const created = await app.inject({
    method: 'POST',
    url: '/es/aeronave/aviones/nuevo',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    payload: formBody({
      registration: 'EC-XYZ',
      icaoType: 'C172',
      manufacturer: 'Cessna',
      model: '172S',
      csrfToken: csrf,
    }),
  })
  const aircraftId = new URL(created.headers.location as string, 'http://x').searchParams.get(
    'aircraft',
  ) as string

  const listPage = await app.inject({
    method: 'GET',
    url: created.headers.location as string,
    headers: { cookie },
  })
  const csrf2 = csrfFrom(listPage.body)
  await app.inject({
    method: 'POST',
    url: `/es/aeronave/aviones/${aircraftId}/activar`,
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    payload: formBody({ csrfToken: csrf2 }),
  })

  const dashboard = await app.inject({ method: 'GET', url: '/es', headers: { cookie } })
  assert.ok(dashboard.body.includes('EC-XYZ'), 'active aircraft registration shown on any screen')
  assert.ok(!dashboard.body.includes('Sin aeronave activa'))
  await app.close()
})

test('the active-aircraft control is present at 320px with a 44px touch target', async () => {
  const { app, cookie } = await makeSignedInApp()
  const res = await app.inject({ method: 'GET', url: '/es', headers: { cookie } })
  // The phone header's control carries the shared touch-target class, which
  // the component tests already assert resolves to a 44px activatable region.
  assert.match(
    res.body,
    /<a href="\/es\/aeronave" class="touch-target ml-auto flex items-center/,
    'phone header active-aircraft control is present with the 44px touch-target class',
  )
  await app.close()
})
