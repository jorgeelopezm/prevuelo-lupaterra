import { test } from 'node:test'
import assert from 'node:assert/strict'

import { buildApp } from './app.js'
import { loadConfig } from './config.js'
import { ALL_MODULES } from '../modules/registry.js'
import { destinationPath } from '../platform/i18n/segments.js'
import { SUPPORTED_LOCALES } from '../platform/i18n/locale.js'

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

const PHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15'
const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0'

test('the shell renders identical markup for phone and desktop user agents', async () => {
  const app = await makeApp()
  const phone = await app.inject({ method: 'GET', url: '/es', headers: { 'user-agent': PHONE_UA } })
  const desktop = await app.inject({
    method: 'GET',
    url: '/es',
    headers: { 'user-agent': DESKTOP_UA },
  })
  assert.equal(phone.statusCode, 200)
  assert.equal(phone.body, desktop.body, 'no user-agent sniffing: one layout for all widths')
  await app.close()
})

test('all three navigation presentations render from the one destination list', async () => {
  const app = await makeApp()
  const res = await app.inject({ method: 'GET', url: '/es/meteorologia' })
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
  const app = await makeApp()

  const home = await app.inject({ method: 'GET', url: '/es' })
  assert.equal((home.body.match(/aria-current="page"/g) ?? []).length, 3)
  assert.match(home.body, /href="\/es"[^>]*aria-current="page"/)

  const weather = await app.inject({ method: 'GET', url: '/es/meteorologia' })
  assert.equal((weather.body.match(/aria-current="page"/g) ?? []).length, 3)
  assert.match(weather.body, /href="\/es\/meteorologia"[^>]*aria-current="page"/)
  await app.close()
})

test('the shell cannot scroll horizontally: min-w-0 columns and no fixed pixel widths', async () => {
  const app = await makeApp()
  const res = await app.inject({ method: 'GET', url: '/es' })
  const html = res.body
  assert.match(html, /min-w-0/, 'flex columns carry min-w-0 so content cannot force overflow')
  // No fixed pixel widths in the shell (the 224px sidebar is a rem-based class).
  assert.ok(!/\bw-\[[0-9]+px\]/.test(html), 'no fixed pixel widths in the shell markup')
  await app.close()
})

test('locale switcher offers the other locales and keeps the active one marked', async () => {
  const app = await makeApp()
  const res = await app.inject({ method: 'GET', url: '/es/meteorologia' })
  const html = res.body
  for (const code of SUPPORTED_LOCALES) {
    assert.ok(html.includes(`>${code}<`), `switcher offers ${code}`)
  }
  assert.match(html, /href="\/pt\/meteorologia"/, 'verbatim path switch to pt preserves the route')
  assert.match(html, /href="\/en\/weather"/, 'verbatim path switch to en preserves the route')
  await app.close()
})
