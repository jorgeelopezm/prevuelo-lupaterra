import { test } from 'node:test'
import assert from 'node:assert/strict'

import { buildApp } from '../server/app.js'
import { loadConfig } from '../server/config.js'
import { ALL_MODULES } from './registry.js'
import { destinationPath } from '../platform/i18n/segments.js'
import { SUPPORTED_LOCALES } from '../platform/i18n/locale.js'
import { FakePoolFacade } from '../platform/db/fake-pool.js'
import { createTestSession } from '../server/auth/test-session.js'
import { FORBIDDEN_VALUE_PATTERNS, NOTAM_IDENTIFIER } from '../server/views/forbidden-values.js'

function makeConfig() {
  return loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgres://localhost/ga',
    SESSION_SECRET: 's'.repeat(48),
  })
}

const PLACEHOLDER_NOTICE: Record<(typeof SUPPORTED_LOCALES)[number], string> = {
  es: 'En desarrollo',
  pt: 'Em desenvolvimento',
  en: 'In progress',
}

test('every destination redirects an anonymous request to sign-in in all three locales', async () => {
  const app = await buildApp({
    config: makeConfig(),
    pool: new FakePoolFacade(),
    checkDatabase: async () => true,
  })
  // identity-access: "Route protection" — every destination sits behind the
  // wall; nothing renders before a session exists.
  for (const locale of SUPPORTED_LOCALES) {
    for (const mod of ALL_MODULES) {
      const url = destinationPath(mod.id, locale)
      const res = await app.inject({ method: 'GET', url })
      assert.equal(res.statusCode, 302, `${url} redirects an anonymous request`)
      assert.equal(
        res.headers.location,
        `/${locale}/auth/sign-in?next=${encodeURIComponent(url)}`,
        `${url} redirects to its locale's sign-in with itself as the return target`,
      )
      assert.ok(!res.body.includes('<aside'), `${url} renders no shell`)
    }
  }
  await app.close()
})

test('all six destinations return 200 inside the shell in all three locales for a signed-in pilot', async () => {
  const pool = new FakePoolFacade()
  const app = await buildApp({ config: makeConfig(), pool, checkDatabase: async () => true })
  const { cookie } = await createTestSession(pool)
  for (const locale of SUPPORTED_LOCALES) {
    for (const mod of ALL_MODULES) {
      const url = destinationPath(mod.id, locale)
      const res = await app.inject({ method: 'GET', url, headers: { cookie } })
      assert.equal(res.statusCode, 200, `${url} resolves`)
      assert.match(res.headers['content-type'] ?? '', /text\/html/)
      assert.ok(res.body.includes('<!doctype html>'), `${url} is a full document`)
      assert.ok(res.body.includes('<aside'), `${url} renders inside the shell`)
      // Only the documents module is still a placeholder: weather, dashboard,
      // fleet, risk, and checklists have their own capabilities.
      if (mod.id === 'documents') {
        assert.ok(
          res.body.includes(PLACEHOLDER_NOTICE[locale]),
          `${url} shows the localized not-yet-available notice`,
        )
      }
      assert.equal(
        res.body.includes(`aria-current="page"`),
        true,
        `${url} marks its navigation destination active`,
      )
    }
  }
  await app.close()
})

test('every placeholder response is free of operational values and prototype sample strings', async () => {
  const pool = new FakePoolFacade()
  const app = await buildApp({ config: makeConfig(), pool, checkDatabase: async () => true })
  // Placeholders sit behind the wall; render them for a signed-in pilot with
  // no recorded data so the check is on the placeholder itself.
  const { cookie } = await createTestSession(pool)
  // Weather, fleet, risk, dashboard, and checklists are no longer
  // placeholders; each carries its own no-fabrication evals in its own
  // index.test.ts (weather legitimately renders MCP-sourced values once
  // queried).
  for (const locale of SUPPORTED_LOCALES) {
    for (const mod of ALL_MODULES.filter(
      (m) =>
        m.id !== 'weather' &&
        m.id !== 'fleet' &&
        m.id !== 'dashboard' &&
        m.id !== 'risk' &&
        m.id !== 'checklists',
    )) {
      const url = destinationPath(mod.id, locale)
      const res = await app.inject({ method: 'GET', url, headers: { cookie } })
      assert.equal(res.statusCode, 200, `${url} renders for a signed-in pilot`)
      const body = res.body.toUpperCase()
      for (const forbidden of FORBIDDEN_VALUE_PATTERNS) {
        assert.ok(!body.includes(forbidden.toUpperCase()), `${url} must not contain '${forbidden}'`)
      }
      assert.ok(!NOTAM_IDENTIFIER.test(body), `${url} must not contain a NOTAM identifier value`)
    }
  }
  await app.close()
})
