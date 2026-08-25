/**
 * Live end-to-end integration tests guarded by TEST_DATABASE_URL. These boot
 * the real server against a real PostgreSQL with pgvector — migrations applied,
 * a pilot seeded, then every one of the six feature destinations walked in all
 * three locales, both signed out and signed in:
 *   TEST_DATABASE_URL=postgres://ga:ga@localhost:5432/ga_core_test npm test
 * They are skipped unless an operator explicitly targets a test database.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { FastifyInstance } from 'fastify'

import { createCsrfToken } from '../platform/identity/csrf.js'
import { applyMigrations, loadMigrationTemplates } from '../platform/db/migrations.js'
import { createPool } from '../platform/db/pool.js'
import { hashPassword } from '../platform/identity/passwords.js'
import { seedDevDatabase } from '../../db/seed/seed.js'
import { destinationPath } from '../platform/i18n/segments.js'
import { SUPPORTED_LOCALES } from '../platform/i18n/locale.js'
import { ALL_MODULES } from '../modules/registry.js'
import { buildApp } from './app.js'
import { loadConfig } from './config.js'

const testDatabaseUrl = process.env.TEST_DATABASE_URL
const it = testDatabaseUrl ? test : test.skip

const EMBEDDING_DIMENSIONS = 768
const SECRET = 's'.repeat(48)
const E2E_EMAIL = 'e2e@ga-core.local'
const E2E_PASSWORD = 'e2e-dev-1234'
const E2E_DISPLAY_NAME = 'E2E Pilot'

function makeConfig() {
  return loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: testDatabaseUrl,
    SESSION_SECRET: SECRET,
  })
}

async function prepareDatabase() {
  const pool = createPool(testDatabaseUrl as string)
  await applyMigrations(pool, await loadMigrationTemplates('db/migrations', EMBEDDING_DIMENSIONS))
  const passwordHash = await hashPassword(E2E_PASSWORD)
  await seedDevDatabase(pool, {
    environment: 'test',
    pilot: { email: E2E_EMAIL, displayName: E2E_DISPLAY_NAME, locale: 'es', passwordHash },
    documents: [],
  })
  return pool
}

function csrfFrom(html: string): string {
  const match = /name="csrfToken" value="([^"]+)"/.exec(html)
  assert.ok(match, 'sign-in page must embed a csrf token')
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

async function signIn(app: FastifyInstance): Promise<string> {
  const page = await app.inject({ method: 'GET', url: '/es/auth/sign-in' })
  const csrf = csrfFrom(page.body)
  const cookie = cookieHeader(page)
  const res = await app.inject({
    method: 'POST',
    url: '/es/auth/sign-in',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    payload: formBody({ email: E2E_EMAIL, password: E2E_PASSWORD, csrfToken: csrf }),
  })
  assert.equal(res.statusCode, 302, 'sign-in redirects after a successful login')
  const session = res.cookies.find((c) => c.name === 'ga_session')?.value ?? ''
  assert.ok(session.length > 0, 'sign-in sets the session cookie')
  return `ga_session=${session}`
}

it('walks all six destinations in all three locales signed out', async () => {
  const pool = await prepareDatabase()
  const app = await buildApp({ config: makeConfig(), pool, checkDatabase: async () => true })
  try {
    for (const locale of SUPPORTED_LOCALES) {
      for (const mod of ALL_MODULES) {
        const url = destinationPath(mod.id, locale)
        const res = await app.inject({ method: 'GET', url })
        assert.equal(res.statusCode, 200, `${url} resolves against the real database`)
        assert.match(res.headers['content-type'] ?? '', /text\/html/)
        assert.ok(res.body.includes('<!doctype html>'), `${url} is a full document`)
        assert.ok(res.body.includes('<aside'), `${url} renders inside the shell`)
      }
    }
  } finally {
    await app.close()
    await pool.end()
  }
})

it('walks all six destinations in all three locales signed in', async () => {
  const pool = await prepareDatabase()
  const app = await buildApp({ config: makeConfig(), pool, checkDatabase: async () => true })
  try {
    const sessionCookie = await signIn(app)
    for (const locale of SUPPORTED_LOCALES) {
      for (const mod of ALL_MODULES) {
        const url = destinationPath(mod.id, locale)
        const res = await app.inject({ method: 'GET', url, headers: { cookie: sessionCookie } })
        assert.equal(res.statusCode, 200, `${url} resolves signed in`)
        assert.ok(res.body.includes('<aside'), `${url} renders inside the shell`)
        assert.ok(res.body.includes(E2E_DISPLAY_NAME), `${url} shows the signed-in pilot identity`)
      }
    }
  } finally {
    await app.close()
    await pool.end()
  }
})

it('signs out: the prior session cookie is rejected afterwards', async () => {
  const pool = await prepareDatabase()
  const app = await buildApp({ config: makeConfig(), pool, checkDatabase: async () => true })
  try {
    const res = await signIn(app)
    const sessionCookie = /^ga_session=(.+)$/.exec(res)?.[1] ?? ''
    assert.ok(sessionCookie.length > 0)
    const before = await app.inject({ method: 'GET', url: '/es', headers: { cookie: res } })
    assert.equal(before.statusCode, 200)
    assert.ok(before.body.includes(E2E_DISPLAY_NAME), 'signed in before sign-out')

    // Sign out through the authenticated route: the CSRF token is minted over
    // the live session token, then the server-side session is destroyed.
    const csrf = createCsrfToken(SECRET, sessionCookie)
    const out = await app.inject({
      method: 'POST',
      url: '/es/auth/sign-out',
      headers: { cookie: res, 'content-type': 'application/x-www-form-urlencoded' },
      payload: formBody({ csrfToken: csrf }),
    })
    assert.equal(out.statusCode, 302)

    const after = await app.inject({ method: 'GET', url: '/es', headers: { cookie: res } })
    assert.ok(
      !after.body.includes(E2E_DISPLAY_NAME),
      'the destroyed session no longer authenticates',
    )
  } finally {
    await app.close()
    await pool.end()
  }
})
