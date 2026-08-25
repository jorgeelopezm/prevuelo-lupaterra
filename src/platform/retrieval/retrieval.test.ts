import { test } from 'node:test'
import assert from 'node:assert/strict'

import type { QueryResultRow } from 'pg'

import type { DbRow, PoolFacade, Queryable, SqlQueryResult } from '../db/pool.js'
import { createMockEmbeddingProvider } from './embeddings.js'
import { retrieveChunks } from './retrieval.js'
import type { RetrievalRow } from './retrieval.js'

/**
 * Minimal pool stub that returns preset retrieval rows and records the SQL,
 * standing in for the ranked PostgreSQL result set.
 */
class StubRetrievalPool implements PoolFacade {
  seenSql = ''
  seenParams: readonly unknown[] = []

  constructor(private rows: RetrievalRow[]) {}

  async query<Row extends QueryResultRow = DbRow>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<SqlQueryResult<Row>> {
    this.seenSql = sql
    this.seenParams = params ?? []
    return { rows: this.rows as unknown as Row[] }
  }

  async withTransaction<T>(work: (tx: Queryable) => Promise<T>): Promise<T> {
    return work(this)
  }

  async end(): Promise<void> {}
}

const EMBEDDINGS = createMockEmbeddingProvider(4)

/** Rows as pg returns them: numeric columns as strings, out of score order. */
function rows(): RetrievalRow[] {
  return [
    {
      id: 'c1',
      position: 0,
      content: 'alpha text',
      document_id: 'd1',
      document_title: 'Doc Alpha',
      locale: 'en',
      similarity: '0.9',
      lexical: '0.1',
    }, // combined 1.0
    {
      id: 'c2',
      position: 1,
      content: 'beta text',
      document_id: 'd2',
      document_title: 'Doc Beta',
      locale: 'en',
      similarity: '0',
      lexical: '0.7',
    }, // lexical-only, combined 0.7
    {
      id: 'c3',
      position: 2,
      content: 'gamma text',
      document_id: 'd3',
      document_title: 'Doc Gamma',
      locale: 'en',
      similarity: '0.5',
      lexical: '0',
    }, // vector-only, combined 0.5
  ]
}

test('result count respects the limit and ordering is by descending combined score', async () => {
  const pool = new StubRetrievalPool(rows())
  const result = await retrieveChunks({
    pool,
    embeddings: EMBEDDINGS,
    query: 'gibberish',
    locale: 'en',
    limit: 2,
  })

  assert.equal(result.results.length, 2)
  assert.deepEqual(
    result.results.map((r) => r.chunk.id),
    ['c1', 'c2'],
    'sorted by descending combined score before slicing',
  )
  assert.equal(result.results[0]?.score, 1.0)
  assert.equal(result.results[1]?.score, 0.7)
})

test('a lexical-only match and a vector-only match are both eligible', async () => {
  const pool = new StubRetrievalPool(rows())
  const result = await retrieveChunks({
    pool,
    embeddings: EMBEDDINGS,
    query: 'gibberish',
    locale: 'en',
    limit: 3,
  })

  const ids = result.results.map((r) => r.chunk.id)
  assert.ok(ids.includes('c2'), 'lexical-only chunk remains eligible')
  assert.ok(ids.includes('c3'), 'vector-only chunk remains eligible')
})

test('every result carries its score and document attribution', async () => {
  const pool = new StubRetrievalPool(rows())
  const result = await retrieveChunks({
    pool,
    embeddings: EMBEDDINGS,
    query: 'gibberish',
    locale: 'en',
    limit: 3,
  })

  for (const { score, chunk } of result.results) {
    assert.ok(Number.isFinite(score))
    assert.equal(typeof chunk.documentId, 'string')
    assert.equal(typeof chunk.documentTitle, 'string')
    assert.equal(typeof chunk.position, 'number')
    assert.equal(typeof chunk.content, 'string')
    assert.equal(typeof chunk.id, 'string')
  }
})

test('an empty corpus returns an empty result set without error', async () => {
  const pool = new StubRetrievalPool([])
  const result = await retrieveChunks({
    pool,
    embeddings: EMBEDDINGS,
    query: 'nada',
    locale: 'pt',
    limit: 5,
  })
  assert.deepEqual(result.results, [])
})

test('the retrieval statement blends vector similarity, full-text relevance, locale, and a bound', async () => {
  const pool = new StubRetrievalPool(rows())
  await retrieveChunks({
    pool,
    embeddings: EMBEDDINGS,
    query: 'meteorologia',
    locale: 'es',
    limit: 4,
  })

  const sql = pool.seenSql.toLowerCase()
  assert.match(sql, /embedding <=> \$\d+::vector/, 'vector similarity signal present')
  assert.match(sql, /ts_rank_cd/, 'full-text relevance signal present')
  assert.match(sql, /to_tsvector\('simple'/, 'language-agnostic tsquery')
  assert.match(sql, /@@ plainto_tsquery\('simple', \$\d+\)/, 'lexical eligibility')
  assert.match(sql, /embedding is not null/, 'vector eligibility')
  assert.match(sql, /d\.locale = \$\d+/, 'locale scoping')
  assert.match(sql, /order by similarity \+ lexical desc/, 'combined-score ranking')
  assert.match(sql, /limit \$\d+/, 'bounded result set')
  assert.equal(pool.seenParams.length, 4, 'query, vector literal, locale, limit')
  assert.equal(pool.seenParams[2], 'es')
  assert.equal(pool.seenParams[3], 4)
})

test('the result type carries only scored chunks and no generated prose', async () => {
  const pool = new StubRetrievalPool(rows())
  const result = await retrieveChunks({
    pool,
    embeddings: EMBEDDINGS,
    query: 'gibberish',
    locale: 'en',
    limit: 3,
  })

  assert.deepEqual(Object.keys(result).sort(), ['limit', 'locale', 'query', 'results'])
  for (const entry of result.results) {
    assert.deepEqual(Object.keys(entry).sort(), ['chunk', 'score'])
    assert.ok(
      !Object.keys(entry.chunk).some((key) => /answer|summary|prose/.test(key)),
      'no synthesized-answer fields on a retrieved chunk',
    )
  }
})
