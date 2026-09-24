import { test } from 'node:test'
import assert from 'node:assert/strict'

import { FakePoolFacade } from '../db/fake-pool.js'
import { createAircraftRepo } from '../fleet/aircraft-repo.js'
import { createFlightIntentRepo } from './flight-intent-repo.js'
import { createRiskAssessmentRepo } from './risk-assessment-repo.js'

async function setup() {
  const pool = new FakePoolFacade()
  const aircraftRepo = createAircraftRepo(pool)
  const flightIntentRepo = createFlightIntentRepo(pool)
  const riskAssessmentRepo = createRiskAssessmentRepo(pool)

  const pilotA = { id: 'pilot-a' }
  const pilotB = { id: 'pilot-b' }
  pool.pilots.push(
    {
      id: pilotA.id,
      email: 'a@example.com',
      display_name: 'A',
      locale: 'es',
      password_hash: 'x',
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: pilotB.id,
      email: 'b@example.com',
      display_name: 'B',
      locale: 'es',
      password_hash: 'x',
      created_at: new Date(),
      updated_at: new Date(),
    },
  )

  const created = await aircraftRepo.create(pilotA.id, {
    registration: 'EC-ABC',
    icaoType: 'C172',
    manufacturer: 'Cessna',
    model: '172S',
  })
  assert.ok(created.ok)
  const aircraftId = created.aircraft.id

  return { pool, aircraftRepo, flightIntentRepo, riskAssessmentRepo, pilotA, pilotB, aircraftId }
}

test('creating a flight intent naming an owned aircraft succeeds', async () => {
  const { flightIntentRepo, pilotA, aircraftId } = await setup()
  const result = await flightIntentRepo.create(pilotA.id, {
    aircraftId,
    plannedDate: '2026-08-01',
    departureIcao: 'LEMD',
    destinationIcao: 'LEBL',
  })
  assert.ok(result.ok)
  assert.equal(result.flightIntent.pilotId, pilotA.id)
  assert.equal(result.flightIntent.aircraftId, aircraftId)
})

test("creating a flight intent naming another pilot's aircraft fails without disclosure", async () => {
  const { flightIntentRepo, pilotB, aircraftId } = await setup()
  const result = await flightIntentRepo.create(pilotB.id, {
    aircraftId,
    plannedDate: '2026-08-01',
    departureIcao: 'LEMD',
    destinationIcao: 'LEBL',
  })
  assert.deepEqual(result, { ok: false, reason: 'aircraft_not_owned' })
})

test('creating a flight intent naming a retired aircraft fails', async () => {
  const { flightIntentRepo, aircraftRepo, pilotA, aircraftId } = await setup()
  await aircraftRepo.retire(pilotA.id, aircraftId)
  const result = await flightIntentRepo.create(pilotA.id, {
    aircraftId,
    plannedDate: '2026-08-01',
    departureIcao: 'LEMD',
    destinationIcao: 'LEBL',
  })
  assert.deepEqual(result, { ok: false, reason: 'aircraft_not_owned' })
})

test('a flight intent is only visible to its owning pilot', async () => {
  const { flightIntentRepo, pilotA, pilotB, aircraftId } = await setup()
  const created = await flightIntentRepo.create(pilotA.id, {
    aircraftId,
    plannedDate: '2026-08-01',
    departureIcao: 'LEMD',
    destinationIcao: 'LEBL',
  })
  assert.ok(created.ok)
  assert.equal(await flightIntentRepo.findById(pilotB.id, created.flightIntent.id), null)
  assert.notEqual(await flightIntentRepo.findById(pilotA.id, created.flightIntent.id), null)
})

test("listForPilot returns only that pilot's flight intents", async () => {
  const { flightIntentRepo, pilotA, pilotB, aircraftId } = await setup()
  await flightIntentRepo.create(pilotA.id, {
    aircraftId,
    plannedDate: '2026-08-01',
    departureIcao: 'LEMD',
    destinationIcao: 'LEBL',
  })
  const listA = await flightIntentRepo.listForPilot(pilotA.id)
  const listB = await flightIntentRepo.listForPilot(pilotB.id)
  assert.equal(listA.length, 1)
  assert.equal(listB.length, 0)
})

test('a flight intent with no references can be deleted', async () => {
  const { flightIntentRepo, pilotA, aircraftId } = await setup()
  const created = await flightIntentRepo.create(pilotA.id, {
    aircraftId,
    plannedDate: '2026-08-01',
    departureIcao: 'LEMD',
    destinationIcao: 'LEBL',
  })
  assert.ok(created.ok)
  const deleted = await flightIntentRepo.deleteIfUnreferenced(pilotA.id, created.flightIntent.id)
  assert.equal(deleted, true)
  assert.equal(await flightIntentRepo.findById(pilotA.id, created.flightIntent.id), null)
})

test('a flight intent referenced by a risk assessment cannot be deleted', async () => {
  const { flightIntentRepo, riskAssessmentRepo, pilotA, aircraftId } = await setup()
  const created = await flightIntentRepo.create(pilotA.id, {
    aircraftId,
    plannedDate: '2026-08-01',
    departureIcao: 'LEMD',
    destinationIcao: 'LEBL',
  })
  assert.ok(created.ok)
  await riskAssessmentRepo.create(pilotA.id, {
    flightIntentId: created.flightIntent.id,
    answers: [],
    domainScores: [],
    overallScore: 0,
    verdict: 'low',
    aircraftSnapshot: { engineExceedance: null, fuelStatus: null, hoursToNextMaintenance: null },
  })
  const deleted = await flightIntentRepo.deleteIfUnreferenced(pilotA.id, created.flightIntent.id)
  assert.equal(deleted, false)
  assert.notEqual(await flightIntentRepo.findById(pilotA.id, created.flightIntent.id), null)
})
