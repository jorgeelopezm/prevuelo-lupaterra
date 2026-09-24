import { test } from 'node:test'
import assert from 'node:assert/strict'

import { FakePoolFacade } from '../db/fake-pool.js'
import { createAircraftRepo, normalizeRegistration } from './aircraft-repo.js'

function makeRepo() {
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
  pool.pilots.push({
    id: 'pilot-2',
    email: 'b@example.com',
    display_name: 'B',
    locale: 'es',
    password_hash: 'x',
    created_at: new Date(),
    updated_at: new Date(),
    active_aircraft_id: null,
  })
  return { pool, repo: createAircraftRepo(pool) }
}

const baseInput = {
  registration: 'EC-ABC',
  icaoType: 'C172',
  manufacturer: 'Cessna',
  model: '172S',
}

test('normalizeRegistration strips separators and upper-cases', () => {
  assert.equal(normalizeRegistration('EC-ABC'), 'ECABC')
  assert.equal(normalizeRegistration('ec abc'), 'ECABC')
})

test('creating an aircraft succeeds and is listed for that pilot', async () => {
  const { repo } = makeRepo()
  const result = await repo.create('pilot-1', baseInput)
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.aircraft.registration, 'EC-ABC')
  assert.equal(result.aircraft.pilotId, 'pilot-1')

  const listed = await repo.list('pilot-1')
  assert.equal(listed.length, 1)
  assert.equal(listed[0]?.id, result.aircraft.id)
})

test('duplicate registration for the same pilot is rejected, case- and separator-insensitively', async () => {
  const { repo } = makeRepo()
  await repo.create('pilot-1', baseInput)
  const dup = await repo.create('pilot-1', { ...baseInput, registration: 'ec abc' })
  assert.deepEqual(dup, { ok: false, reason: 'duplicate_registration' })
})

test('the same registration is allowed for two different pilots', async () => {
  const { repo } = makeRepo()
  const first = await repo.create('pilot-1', baseInput)
  const second = await repo.create('pilot-2', baseInput)
  assert.equal(first.ok, true)
  assert.equal(second.ok, true)
})

test('retiring an aircraft preserves the row and excludes it from listActive', async () => {
  const { repo } = makeRepo()
  const created = await repo.create('pilot-1', baseInput)
  assert.equal(created.ok, true)
  if (!created.ok) return

  const retired = await repo.retire('pilot-1', created.aircraft.id)
  assert.equal(retired, true)

  const all = await repo.list('pilot-1')
  assert.equal(all.length, 1, 'row preserved')
  const active = await repo.listActive('pilot-1')
  assert.equal(active.length, 0, 'excluded from active listing')
})

test('a retired registration can be reused by the same pilot', async () => {
  const { repo } = makeRepo()
  const created = await repo.create('pilot-1', baseInput)
  assert.equal(created.ok, true)
  if (!created.ok) return
  await repo.retire('pilot-1', created.aircraft.id)

  const reCreated = await repo.create('pilot-1', baseInput)
  assert.equal(reCreated.ok, true)
})

test('active aircraft designation persists and is readable', async () => {
  const { repo } = makeRepo()
  const created = await repo.create('pilot-1', baseInput)
  assert.equal(created.ok, true)
  if (!created.ok) return

  await repo.setActiveAircraft('pilot-1', created.aircraft.id)
  const active = await repo.getActiveAircraft('pilot-1')
  assert.equal(active?.id, created.aircraft.id)
})

test('no active aircraft returns null', async () => {
  const { repo } = makeRepo()
  const active = await repo.getActiveAircraft('pilot-1')
  assert.equal(active, null)
})

test('retiring the active aircraft clears the designation', async () => {
  const { repo } = makeRepo()
  const created = await repo.create('pilot-1', baseInput)
  assert.equal(created.ok, true)
  if (!created.ok) return
  await repo.setActiveAircraft('pilot-1', created.aircraft.id)

  await repo.retire('pilot-1', created.aircraft.id)
  const active = await repo.getActiveAircraft('pilot-1')
  assert.equal(active, null)
})

test("another pilot cannot read or mutate this pilot's aircraft", async () => {
  const { repo } = makeRepo()
  const created = await repo.create('pilot-1', baseInput)
  assert.equal(created.ok, true)
  if (!created.ok) return

  const found = await repo.findById('pilot-2', created.aircraft.id)
  assert.equal(found, null)

  const retired = await repo.retire('pilot-2', created.aircraft.id)
  assert.equal(retired, false)
})

test('editing an aircraft updates the stored record', async () => {
  const { repo } = makeRepo()
  const created = await repo.create('pilot-1', baseInput)
  assert.equal(created.ok, true)
  if (!created.ok) return

  const updated = await repo.update('pilot-1', created.aircraft.id, { ...baseInput, model: '172R' })
  assert.equal(updated.ok, true)
  if (!updated.ok) return
  assert.equal(updated.aircraft.model, '172R')
})
