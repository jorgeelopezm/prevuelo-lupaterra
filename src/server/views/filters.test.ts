import { test } from 'node:test'
import assert from 'node:assert/strict'

import { requireFilterDate } from './views.js'

test('intlUtcDateTime refuses a null time instead of formatting the 1970 epoch', () => {
  assert.throws(
    () => requireFilterDate(null, 'intlUtcDateTime'),
    /refusing to format a missing time/,
  )
})

test('intlUtcDateTime refuses an undefined time', () => {
  assert.throws(() => requireFilterDate(undefined, 'intlUtcDateTime'), /missing time/)
})

test('intlUtcDateTime accepts a stated ISO time unchanged', () => {
  assert.equal(
    requireFilterDate('2026-08-25T06:00:00Z', 'intlUtcDateTime').toISOString(),
    '2026-08-25T06:00:00.000Z',
  )
})
