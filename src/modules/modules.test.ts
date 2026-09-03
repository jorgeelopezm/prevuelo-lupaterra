import { test } from 'node:test'
import assert from 'node:assert/strict'

import { buildApp } from '../server/app.js'
import { loadConfig } from '../server/config.js'
import { ALL_MODULES } from './registry.js'
import { destinationPath } from '../platform/i18n/segments.js'
import { SUPPORTED_LOCALES } from '../platform/i18n/locale.js'
import { FakePoolFacade } from '../platform/db/fake-pool.js'

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

test('all six destinations return 200 inside the shell in all three locales', async () => {
  const app = await buildApp({
    config: makeConfig(),
    pool: new FakePoolFacade(),
    checkDatabase: async () => true,
  })
  for (const locale of SUPPORTED_LOCALES) {
    for (const mod of ALL_MODULES) {
      const url = destinationPath(mod.id, locale)
      const res = await app.inject({ method: 'GET', url })
      assert.equal(res.statusCode, 200, `${url} resolves`)
      assert.match(res.headers['content-type'] ?? '', /text\/html/)
      assert.ok(res.body.includes('<!doctype html>'), `${url} is a full document`)
      assert.ok(res.body.includes('<aside'), `${url} renders inside the shell`)
      // The weather module is no longer a placeholder (weather-notams-page
      // capability); every other module still is.
      if (mod.id !== 'weather') {
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

/** Words that never belong on a placeholder screen (task 7.7 / spec). */
const FORBIDDEN_VALUE_PATTERNS = [
  'METAR',
  'TAF',
  'SIGMET',
  'engine',
  'fuel',
  'maintenance',
  'VFR',
  'IFR',
  'LIFR',
  'MVFR',
  'QNH',
  'hobbs',
  'tach',
  'pts',
  'score',
  // Prototype sample data that must not leak onto placeholder screens.
  'N4521G',
  'Cessna 172S',
  'Piper',
  'Beechcraft',
  'KBOS',
  'KJFK',
  'KORD',
  'KORH',
  'KMHT',
  'KACK',
  'CHT',
  'EGT',
  '1,203.7',
  '18.2 hrs',
  'Annual Inspection',
  'ELT Battery',
  // The prototype shows the pilot as "PPL · 312 hrs TT"; assert the value
  // shape (the bare word 'PPL' is also a substring of 'application').
  'PPL ·',
  '312 hrs',
  '22 / 100',
]

/**
 * NOTAM identifiers look like `!ORH 07/009` (or `ORH 07/009`). The word NOTAM
 * itself legitimately appears in the weather nav label ("Weather & NOTAMs"),
 * so absence is asserted on the value shape instead of the word.
 */
const NOTAM_IDENTIFIER = /![A-Z]{3,4}\s\d{2}\/\d{3}|\d{2}\/\d{3}\s[A-Z]{3,4}\b/

test('every placeholder response is free of operational values and prototype sample strings', async () => {
  const app = await buildApp({
    config: makeConfig(),
    pool: new FakePoolFacade(),
    checkDatabase: async () => true,
  })
  // The weather module is no longer a placeholder; its screen legitimately
  // renders real MCP-sourced values once queried (covered by its own tests),
  // so it is excluded from this placeholder-only check.
  for (const locale of SUPPORTED_LOCALES) {
    for (const mod of ALL_MODULES.filter((m) => m.id !== 'weather')) {
      const url = destinationPath(mod.id, locale)
      const body = (await app.inject({ method: 'GET', url })).body.toUpperCase()
      for (const forbidden of FORBIDDEN_VALUE_PATTERNS) {
        assert.ok(!body.includes(forbidden.toUpperCase()), `${url} must not contain '${forbidden}'`)
      }
      assert.ok(!NOTAM_IDENTIFIER.test(body), `${url} must not contain a NOTAM identifier value`)
    }
  }
  await app.close()
})
