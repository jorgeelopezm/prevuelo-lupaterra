import { test } from 'node:test'
import assert from 'node:assert/strict'

import { deriveMaintenanceStatus, rollForward } from './maintenance-status.js'

const NOW = new Date('2026-09-07T12:00:00Z')

test('hours remaining: 1222.0 due minus 1203.7 current is 18.3', () => {
  const result = deriveMaintenanceStatus(
    { dueOn: null, dueAtHours: 1222.0, hoursBasis: 'airframe' },
    NOW,
    1203.7,
    30,
    10,
  )
  assert.ok(Math.abs((result.hoursRemaining as number) - 18.3) < 0.001)
  assert.equal(result.status, 'ok', '18.3 hours remaining is outside a 10-hour warning window')
})

test('no aircraft hour data: hours-based item is not computable', () => {
  const result = deriveMaintenanceStatus(
    { dueOn: null, dueAtHours: 1222.0, hoursBasis: 'airframe' },
    NOW,
    null,
    30,
    10,
  )
  assert.equal(result.hoursComputable, false)
  assert.equal(result.hoursRemaining, null)
})

test('date-based item is unaffected by missing hour data', () => {
  const result = deriveMaintenanceStatus(
    { dueOn: '2026-10-01', dueAtHours: null, hoursBasis: null },
    NOW,
    null,
    30,
    10,
  )
  assert.equal(result.hoursComputable, true)
  assert.equal(result.status, 'due_soon')
})

test('overdue by date', () => {
  const result = deriveMaintenanceStatus(
    { dueOn: '2026-09-01', dueAtHours: null, hoursBasis: null },
    NOW,
    null,
    30,
    10,
  )
  assert.equal(result.status, 'overdue')
})

test('not yet due by date but overdue by hours: overdue governs', () => {
  const result = deriveMaintenanceStatus(
    { dueOn: '2027-01-01', dueAtHours: 1200, hoursBasis: 'airframe' },
    NOW,
    1205,
    30,
    10,
  )
  assert.equal(result.status, 'overdue')
})

test('rolling a 50-hour item from 1220.0 completion to next due 1270.0', () => {
  const result = rollForward({ recurrenceMonths: null, recurrenceHours: 50 }, '2026-09-07', 1220.0)
  assert.equal(result.dueAtHours, 1270.0)
})

test('rolling a 12-month item forward one year', () => {
  const result = rollForward({ recurrenceMonths: 12, recurrenceHours: null }, '2026-09-07', null)
  assert.equal(result.dueOn, '2027-09-07')
})

test('a non-recurring item rolls forward to nothing', () => {
  const result = rollForward(
    { recurrenceMonths: null, recurrenceHours: null },
    '2026-09-07',
    1220.0,
  )
  assert.equal(result.dueOn, null)
  assert.equal(result.dueAtHours, null)
})
