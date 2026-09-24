/**
 * The sign-in and registration screens. These cover identity-access: "Sign-in
 * screen presentation" and "Self-registration is switchable and disabled by
 * default", plus the standing-rule evals (44px targets, phone layout, and no
 * operational values).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import type { FastifyInstance } from 'fastify'

import { buildApp, type BuildAppOptions } from '../app.js'
import { loadConfig } from '../config.js'
import { ALL_MODULES } from '../../modules/registry.js'
import { FakePoolFacade } from '../../platform/db/fake-pool.js'
import { CHROME_STRINGS } from '../../platform/i18n/chrome.js'
import { SUPPORTED_LOCALES } from '../../platform/i18n/locale.js'
import { destinationPath } from '../../platform/i18n/segments.js'
import { FORBIDDEN_VALUE_PATTERNS, NOTAM_IDENTIFIER } from '../views/forbidden-values.js'
import { createTestSession, TEST_PILOT_PASSWORD } from './test-session.js'

function makeConfig(env: Record<string, string> = {}) {
  return loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgres://localhost/ga',
    SESSION_SECRET: 's'.repeat(48),
    ...env,
  })
}

async function makeApp(
  opts: { registration?: boolean } & Partial<BuildAppOptions> = {},
): Promise<FastifyInstance> {
  const { registration, ...overrides } = opts
  return buildApp({
    config: makeConfig(registration ? { REGISTRATION_ENABLED: 'true' } : {}),
    pool: new FakePoolFacade(),
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

function formBody(fields: Record<string, string>): string {
  return Object.entries(fields)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')
}

const SIGN_IN_TITLE = { es: 'Iniciar sesión', pt: 'Iniciar sessão', en: 'Sign in' } as const
const EMAIL_LABEL = { es: 'Correo electrónico', pt: 'Correio eletrónico', en: 'Email' } as const

/** Every interactive element in the markup, except hidden inputs. */
function interactiveTags(html: string): string[] {
  return (html.match(/<(a|button|input)\b[^>]*>/g) ?? []).filter(
    (tag) => !/type="hidden"/.test(tag),
  )
}

// --- 4.1: catalog -------------------------------------------------------------

test('every new auth string exists in all three locales', () => {
  const keys = [
    'auth.sign_in_subtitle',
    'auth.password_hint',
    'auth.registration_unavailable_title',
    'auth.registration_unavailable_message',
    'auth.back_to_sign_in',
  ]
  for (const locale of SUPPORTED_LOCALES) {
    for (const key of keys) {
      const value = CHROME_STRINGS[locale][key]
      assert.ok(typeof value === 'string' && value.length > 0, `${locale} has ${key}`)
    }
  }
})

// --- 3.1 / 4.2: layout and localized sign-in ----------------------------------

test('the sign-in screen is localized in every locale and uses the shell-less auth layout', async () => {
  const app = await makeApp()
  for (const locale of SUPPORTED_LOCALES) {
    const res = await app.inject({ method: 'GET', url: `/${locale}/auth/sign-in` })
    assert.equal(res.statusCode, 200)
    const html = res.body
    assert.ok(html.includes(`<html lang="${locale}">`), `${locale}: lang matches the locale`)
    assert.ok(html.includes(`<title>${SIGN_IN_TITLE[locale]}</title>`), `${locale}: title`)
    assert.ok(html.includes(EMAIL_LABEL[locale]), `${locale}: email label`)
    assert.ok(html.includes(CHROME_STRINGS[locale]['auth.sign_in_subtitle'] as string))
    assert.ok(html.includes('href="/assets/app.css"'), 'links the application stylesheet')
    assert.ok(html.includes('PRE-VUELO'), 'presents the product brand')
    assert.ok(!html.includes('PREFLIGHT'), 'the old product name is gone')
    assert.ok(
      html.includes('<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">'),
      'links the favicon',
    )
    // No shell: no sidebar, drawer, tab bar, or destination links.
    assert.ok(!html.includes('<aside'), 'no sidebar or drawer')
    assert.ok(!html.includes('drawer-toggle'), 'no drawer toggle')
    for (const mod of ALL_MODULES) {
      if (mod.id === 'dashboard') continue // the locale root is also a switcher prefix
      const href = destinationPath(mod.id, locale)
      assert.ok(!html.includes(`href="${href}"`), `${locale}: no link to ${href}`)
    }
  }
  await app.close()
})

test('an htmx request for the sign-in screen gets the bare partial', async () => {
  const app = await makeApp()
  const res = await app.inject({
    method: 'GET',
    url: '/es/auth/sign-in',
    headers: { 'hx-request': 'true' },
  })
  assert.equal(res.statusCode, 200)
  assert.ok(!res.body.includes('<html'), 'no document')
  assert.ok(res.body.includes('name="email"'), 'the form partial itself')
  await app.close()
})

test('sign-in fields carry the input semantics mobile keyboards and password managers need', async () => {
  const app = await makeApp()
  const html = (await app.inject({ method: 'GET', url: '/es/auth/sign-in' })).body
  assert.match(html, /<input id="sign-in-email" type="email"[^>]*autocomplete="email"/)
  assert.match(html, /<input id="sign-in-email"[^>]*inputmode="email"/)
  assert.match(html, /<input id="sign-in-email"[^>]*autocapitalize="none"/)
  assert.match(
    html,
    /<input id="sign-in-password" type="password"[^>]*autocomplete="current-password"/,
  )
  assert.match(html, /<label for="sign-in-email"/, 'email has a programmatic label')
  assert.match(html, /<label for="sign-in-password"/, 'password has a programmatic label')
  await app.close()
})

test('a failed sign-in states the error in text, keeps the email, and never echoes the password', async () => {
  const app = await makeApp()
  const page = await app.inject({ method: 'GET', url: '/es/auth/sign-in' })
  const res = await app.inject({
    method: 'POST',
    url: '/es/auth/sign-in',
    headers: { cookie: cookieHeader(page), 'content-type': 'application/x-www-form-urlencoded' },
    payload: formBody({
      email: 'nadie@example.com',
      password: 'secret-typed-here',
      csrfToken: csrfFrom(page.body),
    }),
  })
  assert.equal(res.statusCode, 401)
  assert.match(res.body, /role="alert" id="auth-error"/)
  assert.match(res.body, /<span>Correo o contraseña no válidos\.<\/span>/, 'the error is text')
  assert.match(res.body, /aria-describedby="auth-error"/, 'inputs reference the error')
  assert.match(res.body, /value="nadie@example.com"/, 'the email is preserved')
  assert.ok(!res.body.includes('secret-typed-here'), 'the password is not echoed')
  await app.close()
})

test('a signed-in pilot visiting sign-in is redirected home', async () => {
  const pool = new FakePoolFacade()
  const app = await makeApp({ pool })
  const { cookie } = await createTestSession(pool)
  const res = await app.inject({ method: 'GET', url: '/pt/auth/sign-in', headers: { cookie } })
  assert.equal(res.statusCode, 302)
  assert.equal(res.headers.location, '/pt')
  await app.close()
})

// --- 4.7: locale switch --------------------------------------------------------

test('the sign-in locale switch keeps the return target and drops an unsafe one', async () => {
  const app = await makeApp()
  const next = encodeURIComponent('/es/meteorologia?icao=LEMD')
  const res = await app.inject({ method: 'GET', url: `/es/auth/sign-in?next=${next}` })
  for (const code of SUPPORTED_LOCALES) {
    assert.ok(
      res.body.includes(`href="/${code}/auth/sign-in?next=${next}"`),
      `switch to ${code} keeps the return target`,
    )
  }
  assert.match(res.body, /href="\/es\/auth\/sign-in[^"]*"[^>]*aria-current="true"/)

  const unsafe = await app.inject({
    method: 'GET',
    url: `/es/auth/sign-in?next=${encodeURIComponent('//evil.example')}`,
  })
  assert.ok(!unsafe.body.includes('evil.example'), 'an off-site target is dropped everywhere')
  assert.ok(unsafe.body.includes('href="/pt/auth/sign-in"'), 'the switch links carry no target')
  await app.close()
})

// --- 4.5 / 4.6: registration switch -------------------------------------------

test('registration is disabled by default', () => {
  assert.equal(makeConfig().REGISTRATION_ENABLED, false)
  assert.equal(makeConfig({ REGISTRATION_ENABLED: 'true' }).REGISTRATION_ENABLED, true)
})

test('while registration is disabled, sign-in shows no registration link', async () => {
  const app = await makeApp()
  const res = await app.inject({ method: 'GET', url: '/es/auth/sign-in' })
  assert.ok(!res.body.includes('/auth/register'), 'no link or control leads to registration')
  assert.ok(!res.body.includes('¿No tienes cuenta?'))
  await app.close()
})

test('while registration is disabled, the registration screen is a notice with no form', async () => {
  const app = await makeApp()
  for (const locale of SUPPORTED_LOCALES) {
    const res = await app.inject({ method: 'GET', url: `/${locale}/auth/register` })
    assert.equal(res.statusCode, 200)
    const strings = CHROME_STRINGS[locale]
    assert.ok(res.body.includes(strings['auth.registration_unavailable_title'] as string))
    assert.ok(res.body.includes(strings['auth.registration_unavailable_message'] as string))
    assert.ok(res.body.includes(`href="/${locale}/auth/sign-in"`), 'links back to sign-in')
    assert.ok(!res.body.includes('<form'), 'no registration form')
    assert.ok(!res.body.includes('name="password"'))
  }
  await app.close()
})

test('while registration is disabled, a valid submission is refused with 403 and creates nothing', async () => {
  const pool = new FakePoolFacade()
  const app = await makeApp({ pool })
  // The disabled registration screen renders no form, so the valid token
  // (bound to the same anonymous nonce) comes from the sign-in screen. The
  // point is that the 403 is the flag's refusal, not a CSRF failure.
  const page = await app.inject({ method: 'GET', url: '/es/auth/sign-in' })
  const res = await app.inject({
    method: 'POST',
    url: '/es/auth/register',
    headers: { cookie: cookieHeader(page), 'content-type': 'application/x-www-form-urlencoded' },
    payload: formBody({
      email: 'nuevo@example.com',
      displayName: 'Nuevo Piloto',
      password: 'super-secret-1234',
      csrfToken: csrfFrom(page.body),
    }),
  })
  assert.equal(res.statusCode, 403)
  assert.ok(res.body.includes('Registro no disponible'), 'the not-available notice')
  assert.equal(pool.pilots.length, 0, 'no account created')
  assert.ok(!res.cookies.some((c) => c.name === 'ga_session'), 'no session opened')
  await app.close()
})

test('with registration enabled, sign-in and registration link to each other and sign-up works', async () => {
  const pool = new FakePoolFacade()
  const app = await makeApp({ pool, registration: true })
  const next = encodeURIComponent('/es/riesgo')

  const signIn = await app.inject({ method: 'GET', url: `/es/auth/sign-in?next=${next}` })
  assert.ok(signIn.body.includes(`href="/es/auth/register?next=${next}"`), 'sign-in → register')

  const page = await app.inject({ method: 'GET', url: `/es/auth/register?next=${next}` })
  assert.equal(page.statusCode, 200)
  assert.ok(page.body.includes(`href="/es/auth/sign-in?next=${next}"`), 'register → sign-in')
  assert.match(page.body, /autocomplete="new-password" minlength="8"/)

  const res = await app.inject({
    method: 'POST',
    url: '/es/auth/register',
    headers: { cookie: cookieHeader(page), 'content-type': 'application/x-www-form-urlencoded' },
    payload: formBody({
      email: 'nuevo@example.com',
      displayName: 'Nuevo Piloto',
      password: TEST_PILOT_PASSWORD,
      csrfToken: csrfFrom(page.body),
      next: '/es/riesgo',
    }),
  })
  assert.equal(res.statusCode, 302)
  assert.equal(res.headers.location, '/es/riesgo')
  assert.equal(pool.pilots.length, 1)
  assert.ok(res.cookies.some((c) => c.name === 'ga_session' && c.value.length > 0))
  await app.close()
})

// --- 7.1: touch targets ------------------------------------------------------

test('eval: every control on the auth screens meets the 44px touch-target rule', async () => {
  const disabled = await makeApp()
  const enabled = await makeApp({ registration: true })
  const pages = [
    (await enabled.inject({ method: 'GET', url: '/es/auth/sign-in' })).body,
    (await enabled.inject({ method: 'GET', url: '/es/auth/register' })).body,
    (await disabled.inject({ method: 'GET', url: '/es/auth/sign-in' })).body,
    (await disabled.inject({ method: 'GET', url: '/es/auth/register' })).body,
  ]
  for (const html of pages) {
    const tags = interactiveTags(html)
    assert.ok(tags.length > 0)
    for (const tag of tags) {
      assert.match(tag, /class="[^"]*\b(min-h-11|touch-target)\b/, `44px target: ${tag}`)
    }
  }
  await disabled.close()
  await enabled.close()
})

// --- 7.2: phone layout -------------------------------------------------------

test('eval: the auth screens are one fluid column at 320px with no fixed width above it', async () => {
  const app = await makeApp({ registration: true })
  for (const url of ['/es/auth/sign-in', '/es/auth/register']) {
    const html = (await app.inject({ method: 'GET', url })).body
    assert.match(html, /name="viewport" content="width=device-width, initial-scale=1.0/)
    assert.match(html, /<main id="main" class="[^"]*\bw-full\b[^"]*\bmax-w-sm\b/, 'fluid column')
    for (const [, px] of html.matchAll(/\b(?:min-)?w-\[(\d+)px\]/g)) {
      assert.ok(Number(px) <= 320, `${url}: no fixed width above 320px (found ${px}px)`)
    }
    assert.ok(!/\bgrid-cols-[2-9]\b/.test(html), `${url}: no multi-column grid at the base width`)
    assert.ok(!/<script\b/.test(html), `${url}: no scripting required`)
  }
  await app.close()
})

// --- 7.3: provenance ---------------------------------------------------------

test('eval: the auth screens carry no operational values or prototype sample strings', async () => {
  const disabled = await makeApp()
  const enabled = await makeApp({ registration: true })
  for (const locale of SUPPORTED_LOCALES) {
    for (const [app, path] of [
      [enabled, 'sign-in'],
      [enabled, 'register'],
      [disabled, 'register'],
    ] as const) {
      const url = `/${locale}/auth/${path}`
      const body = (await app.inject({ method: 'GET', url })).body.toUpperCase()
      for (const forbidden of FORBIDDEN_VALUE_PATTERNS) {
        assert.ok(!body.includes(forbidden.toUpperCase()), `${url} must not contain '${forbidden}'`)
      }
      assert.ok(!NOTAM_IDENTIFIER.test(body), `${url} must not contain a NOTAM identifier`)
    }
  }
  await disabled.close()
  await enabled.close()
})
