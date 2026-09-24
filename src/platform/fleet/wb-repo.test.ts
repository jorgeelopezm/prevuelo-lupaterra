import { test } from 'node:test'
import assert from 'node:assert/strict'

import { FakePoolFacade } from '../db/fake-pool.js'
import { createAircraftRepo } from './aircraft-repo.js'
import { createWbRepo } from './wb-repo.js'
import type { CreateWbProfileInput } from './types.js'

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
  return { pool, repo: createWbRepo(pool), aircraftId: created.aircraft.id }
}

const baseProfile: CreateWbProfileInput = {
  emptyWeight: 1500,
  emptyWeightArm: 40,
  mtow: 2400,
  mlw: null,
  mzfw: null,
  usableFuelQty: 56,
  usableFuelArm: 48,
  massUnit: 'lb',
  lengthUnit: 'in',
  loadStations: [
    { name: 'Pilot/Front pax', arm: 37, maxWeight: 400 },
    { name: 'Rear pax', arm: 73, maxWeight: 400 },
  ],
  envelopePoints: [
    { weight: 1500, cg: 39 },
    { weight: 2400, cg: 46 },
  ],
}

test('an aircraft with no profile reports emptyWeight null and no stations/points', async () => {
  const { repo, aircraftId } = await setup()
  const profile = await repo.get('pilot-1', aircraftId)
  assert.equal(profile.emptyWeight, null)
  assert.equal(profile.loadStations.length, 0)
  assert.equal(profile.envelopePoints.length, 0)
})

test('storing a profile persists values, units, stations, and envelope points', async () => {
  const { repo, aircraftId } = await setup()
  const result = await repo.set('pilot-1', aircraftId, baseProfile)
  assert.equal(result.ok, true)

  const profile = await repo.get('pilot-1', aircraftId)
  assert.equal(profile.emptyWeight, 1500)
  assert.equal(profile.mtow, 2400)
  assert.equal(profile.massUnit, 'lb')
  assert.equal(profile.lengthUnit, 'in')
  assert.equal(profile.loadStations.length, 2)
  assert.equal(profile.loadStations[0]?.name, 'Pilot/Front pax')
  assert.equal(profile.envelopePoints.length, 2)
})

test('empty weight above MTOW is rejected', async () => {
  const { repo, aircraftId } = await setup()
  const result = await repo.set('pilot-1', aircraftId, {
    ...baseProfile,
    emptyWeight: 3000,
    mtow: 2400,
  })
  assert.deepEqual(result, { ok: false, reason: 'limits_invalid' })

  const profile = await repo.get('pilot-1', aircraftId)
  assert.equal(profile.emptyWeight, null, 'rejected profile is not stored')
})

test('re-setting the profile replaces the previous stations and points', async () => {
  const { repo, aircraftId } = await setup()
  await repo.set('pilot-1', aircraftId, baseProfile)
  await repo.set('pilot-1', aircraftId, { ...baseProfile, loadStations: [], envelopePoints: [] })

  const profile = await repo.get('pilot-1', aircraftId)
  assert.equal(profile.loadStations.length, 0)
  assert.equal(profile.envelopePoints.length, 0)
})
