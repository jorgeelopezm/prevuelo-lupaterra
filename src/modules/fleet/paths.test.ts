import { test } from 'node:test'
import assert from 'node:assert/strict'

import { fleetPath, FLEET_SUB_SEGMENTS } from './paths.js'
import { SUPPORTED_LOCALES } from '../../platform/i18n/locale.js'

test('every sub-segment resolves to a non-empty, localized path for every locale', () => {
  for (const locale of SUPPORTED_LOCALES) {
    for (const sub of FLEET_SUB_SEGMENTS) {
      const path = fleetPath(sub, locale)
      assert.ok(path.startsWith(`/${locale}/`), `${path} is rooted under /${locale}`)
      const lastSegment = path.split('/').pop()
      assert.ok(lastSegment && lastSegment.length > 0, `${sub}/${locale} resolves to a segment`)
    }
  }
})

test('appends an id parameter verbatim after the localized sub-segment', () => {
  const path = fleetPath('aircraft', 'es', ['abc-123'])
  assert.ok(path.endsWith('/abc-123'))
  assert.ok(path.includes('/aviones/'))
})

test('a trailing known sub-segment param is itself localized', () => {
  const path = fleetPath('aircraft', 'es', ['abc-123', 'edit'])
  assert.ok(path.endsWith('/editar'))
})

test('locales resolve to distinct localized segments', () => {
  const es = fleetPath('aircraft', 'es')
  const en = fleetPath('aircraft', 'en')
  const pt = fleetPath('aircraft', 'pt')
  assert.equal(es, '/es/aeronave/aviones')
  assert.equal(en, '/en/aircraft/aircraft')
  assert.equal(pt, '/pt/aeronave/avioes')
})
