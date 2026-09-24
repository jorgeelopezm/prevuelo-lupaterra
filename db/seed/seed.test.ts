import { test } from 'node:test'
import assert from 'node:assert/strict'

import { FakePoolFacade } from '../../src/platform/db/fake-pool.js'
import {
  mockEmbedding,
  seedDevDatabase,
  seedFleetSample,
  seedRiskSample,
  type SeedOptions,
} from './seed.js'

function seedOptions(environment = 'development'): SeedOptions {
  return {
    environment,
    pilot: {
      email: 'piloto@ga-core.local',
      displayName: 'Piloto de Desarrollo',
      locale: 'es',
      passwordHash: '[dev-placeholder-password-hash-replaced-by-identity-work]',
    },
    documents: [
      {
        document: {
          title: 'Briefing de referencia: climatología local',
          category: 'reference',
          sourceReference: 'dev/clima-local-es',
          locale: 'es',
        },
        chunks: [
          {
            position: 0,
            content: 'Inversiones térmicas matinales y cizalladura en final.',
            embedding: mockEmbedding('c0', 4),
          },
          {
            position: 1,
            content: 'Reglas QNH para aeródromos por debajo de 1 000 m.',
            embedding: mockEmbedding('c1', 4),
          },
        ],
      },
      {
        document: {
          title: 'Referencia técnica: lecturas METAR',
          category: 'reference',
          sourceReference: 'dev/metar-es',
          locale: 'es',
        },
        chunks: [
          {
            position: 0,
            content: 'La hora se indica en formato DDHHMMZ.',
            embedding: mockEmbedding('m0', 4),
          },
          {
            position: 1,
            content: 'Códigos de intensidad y proximidad.',
            embedding: mockEmbedding('m1', 4),
          },
        ],
      },
    ],
  }
}

test('seed creates the development pilot and sample documents', async () => {
  const pool = new FakePoolFacade()
  const result = await seedDevDatabase(pool, seedOptions())

  assert.ok(result.pilotId.startsWith('pilot-'))
  assert.deepEqual(result.counts, { pilots: 1, documents: 2, chunks: 4 })
})

test('seed is idempotent: a repeat run creates no duplicates', async () => {
  const pool = new FakePoolFacade()
  const first = await seedDevDatabase(pool, seedOptions())
  const second = await seedDevDatabase(pool, seedOptions())

  assert.deepEqual(second.counts, first.counts)
  assert.deepEqual(second.counts, { pilots: 1, documents: 2, chunks: 4 })
  assert.equal(second.pilotId, first.pilotId, 'same pilot row reused, not duplicated')
})

test('seed aborts in a production environment without writing', async () => {
  const pool = new FakePoolFacade()
  await assert.rejects(
    seedDevDatabase(pool, seedOptions('production')),
    /cannot run the development seed in a production/i,
  )
  assert.equal(pool.seen.length, 0, 'no statement reached the database')
  assert.equal(pool.pilots.length, 0)
  assert.equal(pool.documents.length, 0)
  assert.equal(pool.chunks.length, 0)
})

test('seeding the fleet sample creates one aircraft, flights, a document, and a maintenance item', async () => {
  const pool = new FakePoolFacade()
  const result = await seedDevDatabase(pool, seedOptions())
  const fleet = await seedFleetSample(pool, result.pilotId, 'development')
  assert.equal(fleet.flightCount, 2)
  assert.equal(fleet.documentCount, 1)
  assert.equal(fleet.maintenanceItemCount, 1)
  assert.equal(pool.aircraft.length, 1)
})

test('seeding the fleet sample twice does not duplicate rows', async () => {
  const pool = new FakePoolFacade()
  const result = await seedDevDatabase(pool, seedOptions())
  await seedFleetSample(pool, result.pilotId, 'development')
  const second = await seedFleetSample(pool, result.pilotId, 'development')
  assert.equal(pool.aircraft.length, 1, 'no duplicate aircraft')
  assert.equal(second.flightCount, 2, 'no duplicate flights')
  assert.equal(second.documentCount, 1, 'no duplicate documents')
  assert.equal(second.maintenanceItemCount, 1, 'no duplicate maintenance items')
})

test('seeding the fleet sample refuses a production environment', async () => {
  const pool = new FakePoolFacade()
  const result = await seedDevDatabase(pool, seedOptions())
  await assert.rejects(
    seedFleetSample(pool, result.pilotId, 'production'),
    /cannot run the development seed in a production/i,
  )
  assert.equal(pool.aircraft.length, 0)
})

test('the seeded aircraft has no imported engine data, so the real no-data state renders', async () => {
  const pool = new FakePoolFacade()
  const result = await seedDevDatabase(pool, seedOptions())
  await seedFleetSample(pool, result.pilotId, 'development')
  // No engine_data_files table is written to by the seed — the aircraft-fleet
  // seed intentionally carries no such state, so this asserts the seed does
  // not fabricate one via any other means either.
  assert.equal(
    pool.seen.some((q) => q.sql.toLowerCase().includes('engine_data')),
    false,
  )
})

test('seeding the risk sample creates one flight intent and one risk assessment', async () => {
  const pool = new FakePoolFacade()
  const result = await seedDevDatabase(pool, seedOptions())
  const fleet = await seedFleetSample(pool, result.pilotId, 'development')
  const risk = await seedRiskSample(pool, result.pilotId, fleet.aircraftId, 'development')
  assert.equal(risk.assessmentCount, 1)
  assert.equal(pool.flightIntents.length, 1)
  assert.equal(pool.riskAssessments.length, 1)
})

test('seeding the risk sample twice does not duplicate rows', async () => {
  const pool = new FakePoolFacade()
  const result = await seedDevDatabase(pool, seedOptions())
  const fleet = await seedFleetSample(pool, result.pilotId, 'development')
  await seedRiskSample(pool, result.pilotId, fleet.aircraftId, 'development')
  const second = await seedRiskSample(pool, result.pilotId, fleet.aircraftId, 'development')
  assert.equal(pool.flightIntents.length, 1, 'no duplicate flight intent')
  assert.equal(pool.riskAssessments.length, 1, 'no duplicate risk assessment')
  assert.equal(second.assessmentCount, 1)
})

test('seeding the risk sample refuses a production environment', async () => {
  const pool = new FakePoolFacade()
  const result = await seedDevDatabase(pool, seedOptions())
  const fleet = await seedFleetSample(pool, result.pilotId, 'development')
  await assert.rejects(
    seedRiskSample(pool, result.pilotId, fleet.aircraftId, 'production'),
    /cannot run the development seed in a production/i,
  )
  assert.equal(pool.flightIntents.length, 0)
})

test('mock embedding is deterministic and fixed-dimensional', () => {
  assert.equal(mockEmbedding('mismo texto', 8), mockEmbedding('mismo texto', 8))
  const parsed = JSON.parse(mockEmbedding('texto', 5))
  assert.ok(Array.isArray(parsed))
  assert.equal(parsed.length, 5)
})
