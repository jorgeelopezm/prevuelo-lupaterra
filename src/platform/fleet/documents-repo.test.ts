import { test } from 'node:test'
import assert from 'node:assert/strict'

import { FakePoolFacade } from '../db/fake-pool.js'
import { createAircraftRepo } from './aircraft-repo.js'
import { createDocumentsRepo } from './documents-repo.js'

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
  return { pool, repo: createDocumentsRepo(pool), aircraftId: created.aircraft.id }
}

test('recording a document with an expiry date', async () => {
  const { repo, aircraftId } = await setup()
  const result = await repo.create('pilot-1', aircraftId, {
    kind: 'arc',
    reference: 'ARC-001',
    issuedOn: '2026-01-01',
    expiresOn: '2027-01-01',
  })
  assert.equal(result.ok, true)
  const listed = await repo.list('pilot-1', aircraftId)
  assert.equal(listed.length, 1)
  assert.equal(listed[0]?.kind, 'arc')
  assert.equal(listed[0]?.expiresOn, '2027-01-01')
})

test('a non-expiring document has no expiry date', async () => {
  const { repo, aircraftId } = await setup()
  const result = await repo.create('pilot-1', aircraftId, { kind: 'registration_certificate' })
  assert.equal(result.ok, true)
  const listed = await repo.list('pilot-1', aircraftId)
  assert.equal(listed[0]?.expiresOn, null)
})

test('expiry before issue is rejected', async () => {
  const { repo, aircraftId } = await setup()
  const result = await repo.create('pilot-1', aircraftId, {
    kind: 'arc',
    issuedOn: '2027-01-01',
    expiresOn: '2026-01-01',
  })
  assert.deepEqual(result, { ok: false, reason: 'invalid_dates' })
})

test("another pilot cannot list or delete this pilot's documents", async () => {
  const { repo, aircraftId } = await setup()
  await repo.create('pilot-1', aircraftId, { kind: 'arc', expiresOn: '2027-01-01' })
  const listed = await repo.list('pilot-2', aircraftId)
  assert.equal(listed.length, 0)
})
