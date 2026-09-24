import { test } from 'node:test'
import assert from 'node:assert/strict'

import { FakePoolFacade } from '../db/fake-pool.js'
import { createAircraftRepo } from './aircraft-repo.js'
import { createFlightRepo } from './flight-repo.js'
import type { CreateFlightEntryInput } from './types.js'

async function setup(openingAirframeHours: number | null = 1200.0) {
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
    ...(openingAirframeHours === null
      ? {}
      : {
          openingAirframeHours,
          openingTachHours: openingAirframeHours,
          openingLandings: 0,
        }),
  })
  if (!created.ok) throw new Error('setup failed')
  return { pool, repo: createFlightRepo(pool), aircraftId: created.aircraft.id }
}

function baseFlight(overrides: Partial<CreateFlightEntryInput> = {}): CreateFlightEntryInput {
  return {
    aircraftId: null,
    kind: 'flight',
    flightDate: '2026-08-01',
    departureAerodrome: 'LEMD',
    departureTime: '10:00',
    arrivalAerodrome: 'LEBL',
    arrivalTime: '10:54',
    pilotFunction: 'pic',
    singleEngine: true,
    multiEngine: false,
    totalMinutes: 54,
    nightMinutes: 0,
    ifrMinutes: 0,
    crossCountryMinutes: 0,
    instrumentMinutes: 0,
    hobbsOut: null,
    hobbsIn: null,
    tachOut: null,
    tachIn: null,
    fuelUplift: null,
    fuelBurn: null,
    dayLandings: 1,
    nightLandings: 0,
    passengers: 0,
    remarks: null,
    deviceType: null,
    deviceQualification: null,
    ...overrides,
  }
}

test('logging a 0.9-hour flight brings the aircraft total to 1200.9', async () => {
  const { repo, aircraftId } = await setup(1200.0)
  const created = await repo.create('pilot-1', baseFlight({ aircraftId }))
  assert.equal(created.ok, true)

  const totals = await repo.aircraftTotals('pilot-1', aircraftId)
  assert.equal(totals.computable, true)
  assert.equal(totals.airframeHours, 1200.9)
})

test('an aircraft with no opening offset and no flights is not computable', async () => {
  const { repo, aircraftId } = await setup(null)
  const totals = await repo.aircraftTotals('pilot-1', aircraftId)
  assert.equal(totals.computable, false)
  assert.equal(totals.airframeHours, null)
})

test('editing an entry changes the derived total with no stored total involved', async () => {
  const { repo, aircraftId } = await setup(1200.0)
  const created = await repo.create('pilot-1', baseFlight({ aircraftId }))
  assert.equal(created.ok, true)
  if (!created.ok) return

  await repo.update('pilot-1', created.entry.id, baseFlight({ aircraftId, totalMinutes: 120 }))
  const totals = await repo.aircraftTotals('pilot-1', aircraftId)
  assert.equal(totals.airframeHours, 1202.0)
})

test('deleting an entry recomputes the total without it', async () => {
  const { repo, aircraftId } = await setup(1200.0)
  const created = await repo.create('pilot-1', baseFlight({ aircraftId }))
  assert.equal(created.ok, true)
  if (!created.ok) return

  await repo.delete('pilot-1', created.entry.id)
  const totals = await repo.aircraftTotals('pilot-1', aircraftId)
  assert.equal(totals.airframeHours, 1200.0)
})

test('a flight naming an aircraft the pilot does not own is rejected', async () => {
  const { repo } = await setup(1200.0)
  const result = await repo.create('pilot-1', baseFlight({ aircraftId: 'someone-elses-aircraft' }))
  assert.deepEqual(result, { ok: false, reason: 'aircraft_not_owned' })
})

test('pilot totals separate PIC time from dual time and FSTD from flight time', async () => {
  const { repo, aircraftId } = await setup(1200.0)
  await repo.create('pilot-1', baseFlight({ aircraftId, pilotFunction: 'pic', totalMinutes: 60 }))
  await repo.create('pilot-1', baseFlight({ aircraftId, pilotFunction: 'dual', totalMinutes: 30 }))
  await repo.create(
    'pilot-1',
    baseFlight({
      aircraftId: null,
      kind: 'fstd',
      departureAerodrome: null,
      departureTime: null,
      arrivalAerodrome: null,
      arrivalTime: null,
      deviceType: 'Redbird FMX',
      deviceQualification: 'FNPT-II',
      totalMinutes: 120,
      dayLandings: 0,
    }),
  )

  const totals = await repo.pilotTotals('pilot-1')
  assert.equal(totals.picMinutes, 60)
  assert.equal(totals.dualMinutes, 30)
  assert.equal(totals.totalMinutes, 90, 'flight time only, FSTD excluded')
  assert.equal(totals.fstdMinutes, 120, 'FSTD totaled separately')
})

test('FSTD time does not change any aircraft total', async () => {
  const { repo, aircraftId } = await setup(1200.0)
  await repo.create(
    'pilot-1',
    baseFlight({
      aircraftId: null,
      kind: 'fstd',
      departureAerodrome: null,
      departureTime: null,
      arrivalAerodrome: null,
      arrivalTime: null,
      deviceType: 'Redbird FMX',
      deviceQualification: 'FNPT-II',
      totalMinutes: 120,
      dayLandings: 0,
    }),
  )
  const totals = await repo.aircraftTotals('pilot-1', aircraftId)
  assert.equal(totals.airframeHours, 1200.0)
})

test('the 90-day recency window includes today and excludes 120 days ago', async () => {
  const { repo, aircraftId } = await setup(1200.0)
  const now = new Date('2026-09-07T12:00:00Z')
  const recentDate = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const oldDate = new Date(now.getTime() - 120 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  await repo.create('pilot-1', baseFlight({ aircraftId, flightDate: recentDate, dayLandings: 1 }))
  await repo.create('pilot-1', baseFlight({ aircraftId, flightDate: oldDate, dayLandings: 2 }))

  const totals = await repo.pilotTotals('pilot-1', now)
  assert.equal(totals.recentLandings90d, 1)
  assert.equal(totals.totalLandings, 3, 'lifetime total still counts both')
})

test('night landings within the window are counted separately from the total', async () => {
  const { repo, aircraftId } = await setup(1200.0)
  const now = new Date('2026-09-07T12:00:00Z')
  const recentDate = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  await repo.create(
    'pilot-1',
    baseFlight({ aircraftId, flightDate: recentDate, dayLandings: 2, nightLandings: 1 }),
  )
  const totals = await repo.pilotTotals('pilot-1', now)
  assert.equal(totals.recentLandings90d, 3)
  assert.equal(totals.recentNightLandings90d, 1)
})

test('no entries reports hasEntries false', async () => {
  const { repo } = await setup(1200.0)
  const totals = await repo.pilotTotals('pilot-1')
  assert.equal(totals.hasEntries, false)
})

test("another pilot cannot edit or delete this pilot's entry", async () => {
  const { pool, repo, aircraftId } = await setup(1200.0)
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
  const created = await repo.create('pilot-1', baseFlight({ aircraftId }))
  assert.equal(created.ok, true)
  if (!created.ok) return

  const deleted = await repo.delete('pilot-2', created.entry.id)
  assert.equal(deleted, false)
  const found = await repo.findById('pilot-2', created.entry.id)
  assert.equal(found, null)
})

test("the new-entry pre-fill reads the aircraft's last flight", async () => {
  const { repo, aircraftId } = await setup(1200.0)
  await repo.create(
    'pilot-1',
    baseFlight({ aircraftId, arrivalAerodrome: 'LEBL', hobbsIn: 1203.7 }),
  )
  const last = await repo.lastForAircraft('pilot-1', aircraftId)
  assert.equal(last?.arrivalAerodrome, 'LEBL')
  assert.equal(last?.hobbsIn, 1203.7)
})

test('listing is reverse chronological and pages', async () => {
  const { repo, aircraftId } = await setup(1200.0)
  await repo.create('pilot-1', baseFlight({ aircraftId, flightDate: '2026-08-01' }))
  await repo.create('pilot-1', baseFlight({ aircraftId, flightDate: '2026-08-03' }))
  await repo.create('pilot-1', baseFlight({ aircraftId, flightDate: '2026-08-02' }))

  const listed = await repo.list('pilot-1', { limit: 2, offset: 0 })
  assert.equal(listed.length, 2)
  assert.equal(listed[0]?.flightDate, '2026-08-03')
  assert.equal(listed[1]?.flightDate, '2026-08-02')

  const count = await repo.count('pilot-1')
  assert.equal(count, 3)
})
