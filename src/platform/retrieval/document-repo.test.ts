import { test } from 'node:test'
import assert from 'node:assert/strict'

import { FakePoolFacade } from '../db/fake-pool.js'
import { createDocumentStore } from './document-repo.js'
import { EmbeddingDimensionError } from './types.js'

function makePool(): FakePoolFacade {
  return new FakePoolFacade()
}

test('create persists document fields and returns the mapped record', async () => {
  const pool = makePool()
  const store = createDocumentStore(pool, 4)

  await store.create({
    title: 'Referencia técnica: lecturas METAR',
    category: 'reference',
    sourceReference: 'dev/metar-es',
    locale: 'es',
  })

  const insert = pool.seen.find((s) => s.sql.includes('INSERT INTO documents'))
  assert.ok(insert, 'document insert statement issued')
  assert.deepEqual(insert?.params, [
    'Referencia técnica: lecturas METAR',
    'reference',
    'dev/metar-es',
    'es',
  ])
})

test('listChunks returns chunks in stored positional order with attribution ids', async () => {
  const pool = makePool()
  const store = createDocumentStore(pool, 4)

  // The fake pool returns no rows for SELECTs by default; assert the statement
  // carries the positional ordering contract.
  const chunks = await store.listChunks('document-1')
  assert.deepEqual(chunks, [])
  const select = pool.seen.find((s) => s.sql.includes('FROM document_chunks'))
  assert.ok(select)
  assert.match(select.sql, /ORDER BY position ASC/i)
  assert.equal(select.params?.[0], 'document-1')
})

test('deleteById issues the cascade delete on the document row', async () => {
  const pool = makePool()
  const store = createDocumentStore(pool, 4)

  await store.deleteById('document-1')
  const deleteStmt = pool.seen.find((s) => s.sql.includes('DELETE FROM documents'))
  assert.ok(deleteStmt, 'document delete issued')
  assert.equal(deleteStmt.params?.[0], 'document-1')
  assert.match(deleteStmt.sql, /WHERE id = \$1/i)
})

test('insertChunk accepts an embedding at the configured dimensionality', async () => {
  const pool = makePool()
  const store = createDocumentStore(pool, 4)

  await store.insertChunk({
    documentId: 'document-1',
    position: 0,
    content: 'La hora se indica en formato DDHHMMZ.',
    embedding: [0.1, -0.2, 0.3, 0.4],
  })

  const insert = pool.seen.find((s) => s.sql.includes('INSERT INTO document_chunks'))
  assert.ok(insert)
  assert.deepEqual(insert.params?.[0], 'document-1')
  assert.deepEqual(insert.params?.[1], 0)
  assert.deepEqual(insert.params?.[3], '[0.1,-0.2,0.3,0.4]')
  assert.match(insert.sql, /\$4::vector/)
})

test('insertChunk rejects a mismatched embedding dimension naming both lengths', async () => {
  const pool = makePool()
  const store = createDocumentStore(pool, 768)

  await assert.rejects(
    store.insertChunk({
      documentId: 'document-1',
      position: 0,
      content: 'chunk',
      embedding: [0.1, 0.2],
    }),
    (error: unknown) => {
      assert.ok(error instanceof EmbeddingDimensionError)
      assert.match(error.message, /expected 768, supplied 2/)
      return true
    },
  )
  assert.equal(pool.seen.length, 0, 'no statement reached the database')
})

test('insertChunk stores a null embedding for unembedded chunks', async () => {
  const pool = makePool()
  const store = createDocumentStore(pool, 4)

  await store.insertChunk({ documentId: 'document-1', position: 2, content: 'sin vector' })
  const insert = pool.seen.find((s) => s.sql.includes('INSERT INTO document_chunks'))
  assert.equal(insert?.params?.[3], null)
})
