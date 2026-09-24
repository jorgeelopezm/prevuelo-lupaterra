import { test } from 'node:test'
import assert from 'node:assert/strict'

import { GENERIC_GA_TEMPLATE, TEMPLATE_VERSION } from './template.js'

test('the template carries nine checklists: six normal, three emergency', () => {
  assert.equal(GENERIC_GA_TEMPLATE.length, 9)
  const normal = GENERIC_GA_TEMPLATE.filter((c) => c.kind === 'normal')
  const emergency = GENERIC_GA_TEMPLATE.filter((c) => c.kind === 'emergency')
  assert.equal(normal.length, 6)
  assert.equal(emergency.length, 3)
})

test('exactly one checklist carries the preflight role, and it is normal', () => {
  const withRole = GENERIC_GA_TEMPLATE.filter((c) => c.role === 'preflight')
  assert.equal(withRole.length, 1)
  assert.equal(withRole[0]?.kind, 'normal')
})

test('every item has non-empty text in all three locales', () => {
  for (const checklist of GENERIC_GA_TEMPLATE) {
    assert.ok(checklist.items.length > 0, `${checklist.name.en} has items`)
    for (const item of checklist.items) {
      for (const locale of ['es', 'en', 'pt'] as const) {
        assert.ok(
          item.text[locale].trim().length > 0,
          `${checklist.name.en} item ${item.position} has ${locale} text`,
        )
      }
    }
  }
})

test('checklist positions are contiguous from zero', () => {
  const positions = GENERIC_GA_TEMPLATE.map((c) => c.position).sort((a, b) => a - b)
  assert.deepEqual(
    positions,
    GENERIC_GA_TEMPLATE.map((_, i) => i),
  )
})

test('item positions within each checklist are contiguous from zero', () => {
  for (const checklist of GENERIC_GA_TEMPLATE) {
    const positions = checklist.items.map((i) => i.position).sort((a, b) => a - b)
    assert.deepEqual(
      positions,
      checklist.items.map((_, i) => i),
    )
  }
})

test('template version is a positive integer', () => {
  assert.ok(Number.isInteger(TEMPLATE_VERSION) && TEMPLATE_VERSION > 0)
})
