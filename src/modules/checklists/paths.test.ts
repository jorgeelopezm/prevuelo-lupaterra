import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  checklistPath,
  checklistSelectorPath,
  checklistItemsPath,
  CHECKLIST_SUB_SEGMENTS,
} from './paths.js'
import { SUPPORTED_LOCALES } from '../../platform/i18n/locale.js'

test('every sub-segment resolves to a non-empty, localized path for every locale', () => {
  for (const locale of SUPPORTED_LOCALES) {
    for (const sub of CHECKLIST_SUB_SEGMENTS) {
      const path = checklistPath(sub, locale)
      assert.ok(path.startsWith(`/${locale}/`), `${path} is rooted under /${locale}`)
      const lastSegment = path.split('/').pop()
      assert.ok(lastSegment && lastSegment.length > 0, `${sub}/${locale} resolves to a segment`)
    }
  }
})

test('appends id parameters verbatim after the localized sub-segment', () => {
  const path = checklistPath('toggle', 'es', ['aircraft-1', 'checklist-1', 'item-1'])
  assert.ok(path.endsWith('/aircraft-1/checklist-1/item-1'))
  assert.ok(path.includes('/alternar/'))
})

test('a trailing known sub-segment param is itself localized', () => {
  const path = checklistPath('items', 'es', ['aircraft-1', 'checklist-1', 'new'])
  assert.ok(path.endsWith('/nuevo'))
})

test('the fleet root is localized to listas in es and pt, and stays checklists in en', () => {
  assert.equal(checklistSelectorPath('es', 'aircraft-1'), '/es/listas/aircraft-1')
  assert.equal(checklistSelectorPath('pt', 'aircraft-1'), '/pt/listas/aircraft-1')
  assert.equal(checklistSelectorPath('en', 'aircraft-1'), '/en/checklists/aircraft-1')
})

test('the item/run screen path nests under the selector', () => {
  assert.equal(
    checklistItemsPath('es', 'aircraft-1', 'checklist-1'),
    '/es/listas/aircraft-1/checklist-1',
  )
})

test('locales resolve to distinct localized segments', () => {
  const es = checklistPath('history', 'es')
  const en = checklistPath('history', 'en')
  const pt = checklistPath('history', 'pt')
  assert.equal(es, '/es/listas/historial')
  assert.equal(en, '/en/checklists/history')
  assert.equal(pt, '/pt/listas/historico')
})
