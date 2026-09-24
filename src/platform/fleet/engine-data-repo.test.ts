import { test } from 'node:test'
import assert from 'node:assert/strict'

import { FakePoolFacade } from '../db/fake-pool.js'
import { createAircraftRepo } from './aircraft-repo.js'
import { createFlightRepo } from './flight-repo.js'
import { createEngineDataRepo } from './engine-data-repo.js'
import { importEngineData } from '../../modules/fleet/engine-data/importer.js'

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
  const aircraft = await aircraftRepo.create('pilot-1', {
    registration: 'EC-ABC',
    icaoType: 'C172',
    manufacturer: 'Cessna',
    model: '172S',
  })
  if (!aircraft.ok) throw new Error('setup failed')

  const flightRepo = createFlightRepo(pool)
  const flight = await flightRepo.create('pilot-1', {
    aircraftId: aircraft.aircraft.id,
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
  })
  if (!flight.ok) throw new Error('setup failed')

  return {
    pool,
    repo: createEngineDataRepo(pool),
    aircraftId: aircraft.aircraft.id,
    flightEntryId: flight.entry.id,
  }
}

const SAMPLE_CSV = 'Time,CHT1,OILT\n0,355,192\n1,356,192\n'

test('no engine data imported returns null', async () => {
  const { repo, flightEntryId } = await setup()
  const result = await repo.getForFlight('pilot-1', flightEntryId)
  assert.equal(result, null)
})

test('importing a file stores it with provenance and it can be read back', async () => {
  const { repo, flightEntryId } = await setup()
  const parsed = importEngineData(Buffer.from(SAMPLE_CSV), 'flight.csv')
  assert.equal(parsed.ok, true)
  if (!parsed.ok) return

  const stored = await repo.replace('pilot-1', flightEntryId, parsed.data)
  assert.equal(stored.originalFilename, 'flight.csv')
  assert.equal(stored.detectedFormat, 'generic')

  const fetched = await repo.getForFlight('pilot-1', flightEntryId)
  assert.equal(fetched?.contentDigest, parsed.data.contentDigest)
  assert.equal(fetched?.channels.length, 2)
})

test('importing a second file replaces the first', async () => {
  const { repo, flightEntryId } = await setup()
  const first = importEngineData(Buffer.from(SAMPLE_CSV), 'first.csv')
  const second = importEngineData(Buffer.from('Time,RPM\n0,2300\n1,2310\n'), 'second.csv')
  if (!first.ok || !second.ok) throw new Error('setup failed')

  await repo.replace('pilot-1', flightEntryId, first.data)
  await repo.replace('pilot-1', flightEntryId, second.data)

  const fetched = await repo.getForFlight('pilot-1', flightEntryId)
  assert.equal(fetched?.originalFilename, 'second.csv')
  assert.equal(fetched?.channels.length, 1)
})

test('deleting the import returns to the no-data state without touching the flight', async () => {
  const { repo, flightEntryId } = await setup()
  const parsed = importEngineData(Buffer.from(SAMPLE_CSV), 'flight.csv')
  if (!parsed.ok) throw new Error('setup failed')
  await repo.replace('pilot-1', flightEntryId, parsed.data)

  const deleted = await repo.delete('pilot-1', flightEntryId)
  assert.equal(deleted, true)
  const fetched = await repo.getForFlight('pilot-1', flightEntryId)
  assert.equal(fetched, null)
})

test("another pilot cannot read this pilot's imported data", async () => {
  const { repo, flightEntryId } = await setup()
  const parsed = importEngineData(Buffer.from(SAMPLE_CSV), 'flight.csv')
  if (!parsed.ok) throw new Error('setup failed')
  await repo.replace('pilot-1', flightEntryId, parsed.data)

  const fetched = await repo.getForFlight('pilot-2', flightEntryId)
  assert.equal(fetched, null)
})

test('aircraft engine limits: none entered, then entered and read back', async () => {
  const { repo, aircraftId } = await setup()
  const before = await repo.getAircraftLimits('pilot-1', aircraftId)
  assert.equal(before, null)

  await repo.setAircraftLimits('pilot-1', aircraftId, { cht: 420, oil_pressure: 100 })
  const after = await repo.getAircraftLimits('pilot-1', aircraftId)
  assert.deepEqual(after, { cht: 420, oil_pressure: 100 })
})
