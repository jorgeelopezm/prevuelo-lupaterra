import { test } from 'node:test'
import assert from 'node:assert/strict'

import { FakePoolFacade } from '../db/fake-pool.js'
import { createAircraftRepo } from '../fleet/aircraft-repo.js'
import { createFlightIntentRepo } from './flight-intent-repo.js'
import { createRiskAssessmentRepo } from './risk-assessment-repo.js'
import type { CreateRiskAssessmentInput } from './types.js'

async function setup() {
  const pool = new FakePoolFacade()
  const aircraftRepo = createAircraftRepo(pool)
  const flightIntentRepo = createFlightIntentRepo(pool)
  const riskAssessmentRepo = createRiskAssessmentRepo(pool)

  pool.pilots.push(
    {
      id: 'pilot-a',
      email: 'a@example.com',
      display_name: 'A',
      locale: 'es',
      password_hash: 'x',
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: 'pilot-b',
      email: 'b@example.com',
      display_name: 'B',
      locale: 'es',
      password_hash: 'x',
      created_at: new Date(),
      updated_at: new Date(),
    },
  )

  const aircraft = await aircraftRepo.create('pilot-a', {
    registration: 'EC-ABC',
    icaoType: 'C172',
    manufacturer: 'Cessna',
    model: '172S',
  })
  assert.ok(aircraft.ok)
  const flightIntent = await flightIntentRepo.create('pilot-a', {
    aircraftId: aircraft.aircraft.id,
    plannedDate: '2026-08-01',
    departureIcao: 'LEMD',
    destinationIcao: 'LEBL',
  })
  assert.ok(flightIntent.ok)

  return { pool, riskAssessmentRepo, flightIntentId: flightIntent.flightIntent.id }
}

function sampleInput(flightIntentId: string): CreateRiskAssessmentInput {
  return {
    flightIntentId,
    answers: [{ itemKey: 'illness', optionIndex: 0 }],
    domainScores: [{ domain: 'pilot', score: 0, items: [] }],
    overallScore: 0,
    verdict: 'low',
    aircraftSnapshot: { engineExceedance: null, fuelStatus: null, hoursToNextMaintenance: null },
  }
}

test('submitting a complete questionnaire stores a new record', async () => {
  const { riskAssessmentRepo, flightIntentId } = await setup()
  const result = await riskAssessmentRepo.create('pilot-a', sampleInput(flightIntentId))
  assert.ok(result.ok)
  assert.equal(result.assessment.flightIntentId, flightIntentId)
  assert.equal(result.assessment.verdict, 'low')
})

test('a risk assessment is only visible to its owning pilot', async () => {
  const { riskAssessmentRepo, flightIntentId } = await setup()
  const created = await riskAssessmentRepo.create('pilot-a', sampleInput(flightIntentId))
  assert.ok(created.ok)
  assert.equal(await riskAssessmentRepo.findById('pilot-b', created.assessment.id), null)
  assert.notEqual(await riskAssessmentRepo.findById('pilot-a', created.assessment.id), null)
})

test('creating a risk assessment against a flight intent owned by another pilot fails', async () => {
  const { riskAssessmentRepo, flightIntentId } = await setup()
  const result = await riskAssessmentRepo.create('pilot-b', sampleInput(flightIntentId))
  assert.deepEqual(result, { ok: false, reason: 'flight_intent_not_owned' })
})

test('re-assessing the same flight intent keeps both records, newest first', async () => {
  const { riskAssessmentRepo, flightIntentId } = await setup()
  const first = await riskAssessmentRepo.create('pilot-a', sampleInput(flightIntentId))
  const second = await riskAssessmentRepo.create('pilot-a', sampleInput(flightIntentId))
  assert.ok(first.ok && second.ok)
  const history = await riskAssessmentRepo.listForFlightIntent('pilot-a', flightIntentId)
  assert.equal(history.length, 2)
  assert.deepEqual(
    history.map((h) => h.id).sort(),
    [first.assessment.id, second.assessment.id].sort(),
  )
})

test("listForPilot returns every assessment across all of the pilot's flight intents", async () => {
  const { riskAssessmentRepo, flightIntentId } = await setup()
  await riskAssessmentRepo.create('pilot-a', sampleInput(flightIntentId))
  const list = await riskAssessmentRepo.listForPilot('pilot-a')
  assert.equal(list.length, 1)
  assert.equal(await riskAssessmentRepo.listForPilot('pilot-b').then((l) => l.length), 0)
})
