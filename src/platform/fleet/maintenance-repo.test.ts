import { test } from 'node:test'
import assert from 'node:assert/strict'

import { FakePoolFacade } from '../db/fake-pool.js'
import { createAircraftRepo } from './aircraft-repo.js'
import { createMaintenanceRepo } from './maintenance-repo.js'

async function setup() {
  const pool = new FakePoolFacade()
  pool.pilots.push({
    id: 'pilot-1',
    email: 'a@example.com',
    display_name: 'A',
    locale: 'es',
    password_hash: 'x',
    created_at: new Date(),
    updated_at: new Date(),
    active_aircraft_id: null,
  })
  const aircraftRepo = createAircraftRepo(pool)
  const created = await aircraftRepo.create('pilot-1', {
    registration: 'EC-ABC',
    icaoType: 'C172',
    manufacturer: 'Cessna',
    model: '172S',
  })
  if (!created.ok) throw new Error('setup failed')
  return { pool, repo: createMaintenanceRepo(pool), aircraftId: created.aircraft.id }
}

test('adding a date-based item', async () => {
  const { repo, aircraftId } = await setup()
  const result = await repo.create('pilot-1', aircraftId, {
    description: 'ELT battery',
    dueOn: '2026-10-15',
    dueAtHours: null,
    hoursBasis: null,
    recurrenceMonths: null,
    recurrenceHours: null,
    reference: null,
  })
  assert.equal(result.ok, true)
  const listed = await repo.list('pilot-1', aircraftId)
  assert.equal(listed.length, 1)
  assert.equal(listed[0]?.dueOn, '2026-10-15')
})

test('adding an hours-based item', async () => {
  const { repo, aircraftId } = await setup()
  const result = await repo.create('pilot-1', aircraftId, {
    description: 'Oil change',
    dueOn: null,
    dueAtHours: 1222.0,
    hoursBasis: 'airframe',
    recurrenceMonths: null,
    recurrenceHours: 50,
    reference: null,
  })
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.item.dueAtHours, 1222.0)
})

test('an item with neither due condition is rejected', async () => {
  const { repo, aircraftId } = await setup()
  const result = await repo.create('pilot-1', aircraftId, {
    description: 'Nothing',
    dueOn: null,
    dueAtHours: null,
    hoursBasis: null,
    recurrenceMonths: null,
    recurrenceHours: null,
    reference: null,
  })
  assert.deepEqual(result, { ok: false, reason: 'no_due_condition' })
})

test('completing a recurring 50-hour item rolls it forward', async () => {
  const { repo, aircraftId } = await setup()
  const created = await repo.create('pilot-1', aircraftId, {
    description: 'Oil change',
    dueOn: null,
    dueAtHours: 1222.0,
    hoursBasis: 'airframe',
    recurrenceMonths: null,
    recurrenceHours: 50,
    reference: null,
  })
  assert.equal(created.ok, true)
  if (!created.ok) return

  const updated = await repo.complete('pilot-1', created.item.id, {
    completedOn: '2026-09-07',
    completedAtHours: 1220.0,
    reference: null,
  })
  assert.equal(updated?.dueAtHours, 1270.0)

  const completions = await repo.listCompletions(created.item.id)
  assert.equal(completions.length, 1)
  assert.equal(completions[0]?.completedAtHours, 1220.0)
})

test('completing a non-recurring item closes it with no new due condition', async () => {
  const { repo, aircraftId } = await setup()
  const created = await repo.create('pilot-1', aircraftId, {
    description: 'One-time inspection',
    dueOn: '2026-10-01',
    dueAtHours: null,
    hoursBasis: null,
    recurrenceMonths: null,
    recurrenceHours: null,
    reference: null,
  })
  assert.equal(created.ok, true)
  if (!created.ok) return

  const updated = await repo.complete('pilot-1', created.item.id, {
    completedOn: '2026-09-07',
    completedAtHours: null,
    reference: null,
  })
  assert.equal(updated?.dueOn, null)
})

test("another pilot cannot see or complete this pilot's maintenance item", async () => {
  const { repo, aircraftId } = await setup()
  const created = await repo.create('pilot-1', aircraftId, {
    description: 'ELT battery',
    dueOn: '2026-10-15',
    dueAtHours: null,
    hoursBasis: null,
    recurrenceMonths: null,
    recurrenceHours: null,
    reference: null,
  })
  assert.equal(created.ok, true)
  if (!created.ok) return

  const found = await repo.findById('pilot-2', created.item.id)
  assert.equal(found, null)
  const completed = await repo.complete('pilot-2', created.item.id, {
    completedOn: '2026-09-07',
    completedAtHours: null,
    reference: null,
  })
  assert.equal(completed, null)
})
