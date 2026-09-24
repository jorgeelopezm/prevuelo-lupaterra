import { test } from 'node:test'
import assert from 'node:assert/strict'

import { documentStatus, daysUntil } from './document-status.js'

const NOW = new Date('2026-09-07T12:00:00Z')

test('no expiry date is status "none"', () => {
  assert.equal(documentStatus(null, NOW, 30), 'none')
  assert.equal(daysUntil(null, NOW), null)
})

test('expired when the expiry date has passed', () => {
  assert.equal(documentStatus('2026-09-01', NOW, 30), 'expired')
  assert.equal(daysUntil('2026-09-01', NOW), -6)
})

test('expiring soon within the warning window', () => {
  assert.equal(documentStatus('2026-09-20', NOW, 30), 'expiring_soon')
})

test('ok when outside the warning window', () => {
  assert.equal(documentStatus('2027-01-01', NOW, 30), 'ok')
})

test('exactly at the warning-window boundary counts as expiring soon', () => {
  // 2026-10-07 is exactly 30 days after 2026-09-07.
  assert.equal(documentStatus('2026-10-07', NOW, 30), 'expiring_soon')
  assert.equal(documentStatus('2026-10-08', NOW, 30), 'ok')
})
