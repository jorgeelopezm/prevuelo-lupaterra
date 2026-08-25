import { test } from 'node:test'
import assert from 'node:assert/strict'

import { FakePoolFacade } from '../../src/platform/db/fake-pool.js'
import { mockEmbedding, seedDevDatabase, type SeedOptions } from './seed.js'

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

test('mock embedding is deterministic and fixed-dimensional', () => {
  assert.equal(mockEmbedding('mismo texto', 8), mockEmbedding('mismo texto', 8))
  const parsed = JSON.parse(mockEmbedding('texto', 5))
  assert.ok(Array.isArray(parsed))
  assert.equal(parsed.length, 5)
})
