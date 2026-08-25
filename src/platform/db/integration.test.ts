/**
 * Live integration tests guarded by TEST_DATABASE_URL. These boot against a real
 * PostgreSQL with pgvector, so they are skipped unless an operator explicitly
 * targets a test database, e.g.:
 *   TEST_DATABASE_URL=postgres://ga:ga@localhost:5432/ga_core_test npm test
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { createPool } from './pool.js'
import { applyMigrations, loadMigrationTemplates } from './migrations.js'
import { seedDevDatabase } from '../../../db/seed/seed.js'
import { mockEmbedding } from '../../../db/seed/seed.js'
import { createDocumentStore } from '../retrieval/document-repo.js'
import { createMockEmbeddingProvider } from '../retrieval/embeddings.js'
import { retrieveChunks } from '../retrieval/retrieval.js'
import { EmbeddingDimensionError } from '../retrieval/types.js'

const testDatabaseUrl = process.env.TEST_DATABASE_URL
const it = testDatabaseUrl ? test : test.skip

/** Fixed natural key so repeated runs upsert instead of accumulating rows. */
const INTEGRATION_DOC_REF = 'dev/integration-live'

const INTEGRATION_DOC = {
  document: {
    title: 'Integration sample',
    category: 'reference',
    sourceReference: INTEGRATION_DOC_REF,
    locale: 'en',
  },
  chunks: [
    {
      position: 0,
      content: 'Integration chunk that must round-trip literally.',
      embedding: mockEmbedding('integration-0', 768),
    },
  ],
}

it('applies migrations and seeds against a live database', async () => {
  const pool = createPool(testDatabaseUrl as string)
  try {
    const migrations = await loadMigrationTemplates('db/migrations', 768)
    await applyMigrations(pool, migrations)

    const result = await seedDevDatabase(pool, {
      environment: 'test',
      pilot: {
        email: 'integration@ga-core.local',
        displayName: 'Integration Pilot',
        locale: 'en',
        passwordHash: `[integration-${Date.now()}]`,
      },
      documents: [INTEGRATION_DOC],
    })

    assert.ok(result.pilotId.length > 0)
    assert.ok(result.counts.documents >= 1)
    assert.ok(result.counts.chunks >= 1)

    // Exactly-once: re-running the same seed options changes no row counts.
    const again = await seedDevDatabase(pool, {
      environment: 'test',
      pilot: {
        email: 'integration@ga-core.local',
        displayName: 'Integration Pilot',
        locale: 'en',
        passwordHash: result.pilotId,
      },
      documents: [INTEGRATION_DOC],
    })
    assert.deepEqual(again.counts, result.counts)
  } finally {
    await pool.end()
  }
})

it('retrieves seeded chunks with attribution and enforces dimensionality', async () => {
  const pool = createPool(testDatabaseUrl as string)
  try {
    await applyMigrations(pool, await loadMigrationTemplates('db/migrations', 768))
    const store = createDocumentStore(pool, 768)
    const created = await store.create({
      title: 'Retrieval live sample',
      category: 'reference',
      sourceReference: `dev/retrieval-live-${Date.now()}`,
      locale: 'en',
    })
    await store.insertChunk({
      documentId: created.id,
      position: 0,
      content: 'Runway gradients and crosswind limits for taildraggers.',
      embedding: (await createMockEmbeddingProvider(768).embed(['chunk-0']))[0],
    })
    await store.insertChunk({
      documentId: created.id,
      position: 1,
      content: 'Density altitude effects on takeoff performance.',
      embedding: (await createMockEmbeddingProvider(768).embed(['chunk-1']))[0],
    })

    // Positional ordering on listing.
    const listed = await store.listChunks(created.id)
    assert.deepEqual(
      listed.map((c) => c.position),
      [0, 1],
    )
    assert.deepEqual(
      listed.map((c) => c.embedding?.length),
      [768, 768],
    )

    // Hybrid retrieval ranks the lexical match with full attribution. Mock
    // vectors are arbitrary, so unrelated corpus rows may also appear; what
    // must hold is that this chunk is eligible and every result is attributed.
    const retrieval = await retrieveChunks({
      pool,
      embeddings: createMockEmbeddingProvider(768),
      query: 'density altitude',
      locale: 'en',
      limit: 5,
    })
    assert.ok(retrieval.results.length >= 1)
    assert.ok(
      retrieval.results.some((r) => r.chunk.documentTitle === 'Retrieval live sample'),
      'the lexical match must be eligible for the result set',
    )
    for (const { score, chunk } of retrieval.results) {
      assert.ok(Number.isFinite(score))
      assert.equal(typeof chunk.documentTitle, 'string')
      assert.equal(typeof chunk.position, 'number')
      assert.equal(chunk.locale, 'en')
    }

    // Dimension mismatch is rejected on write (repository guard).
    await assert.rejects(
      store.insertChunk({
        documentId: created.id,
        position: 2,
        content: 'wrong size',
        embedding: [0.1, 0.2],
      }),
      (error: unknown) => error instanceof EmbeddingDimensionError,
    )

    // Cascade deletion removes chunks with their document.
    const countBefore = (await store.listChunks(created.id)).length
    assert.ok(countBefore >= 2)
    await store.deleteById(created.id)
    assert.deepEqual(await store.listChunks(created.id), [])
  } finally {
    await pool.end()
  }
})
