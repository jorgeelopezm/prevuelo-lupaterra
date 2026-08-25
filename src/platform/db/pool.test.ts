import { test } from 'node:test'
import assert from 'node:assert/strict'

import { FakePoolFacade } from './fake-pool.js'

test('transaction commits and returns to the pool on success', async () => {
  const pool = new FakePoolFacade()
  const result = await pool.withTransaction(async (tx) => {
    await tx.query('UPDATE pilots SET updated_at = now()', [])
    return 'done'
  })
  assert.equal(result, 'done')
  assert.equal(pool.beginCount, 1)
  assert.equal(pool.commitCount, 1)
  assert.equal(pool.rollbackCount, 0)
  assert.equal(pool.releaseCount, 1, 'connection always returns to the pool')
})

test('transaction rolls back and returns to the pool when work throws', async () => {
  const pool = new FakePoolFacade()
  await assert.rejects(
    pool.withTransaction(async (tx) => {
      await tx.query('INSERT INTO sessions (id) VALUES ($1)', ['x'])
      throw new Error('unit of work failed')
    }),
    /unit of work failed/,
  )
  assert.equal(pool.beginCount, 1)
  assert.equal(pool.commitCount, 0)
  assert.equal(pool.rollbackCount, 1)
  assert.equal(pool.releaseCount, 1, 'connection returns to the pool after rollback')
})

test('parameterized values are passed separately, never interpolated', async () => {
  const pool = new FakePoolFacade()
  const malicious = "Robert'); DROP TABLE pilots;--"
  await pool.query('INSERT INTO pilots (display_name) VALUES ($1)', [malicious])
  const statement = pool.seen[0]
  assert.ok(statement, 'statement was recorded')
  assert.equal(statement.sql, 'INSERT INTO pilots (display_name) VALUES ($1)')
  assert.deepEqual([...statement.params], [malicious])
  assert.ok(
    !statement.sql.includes(malicious),
    'SQL text must not contain the value (no string interpolation)',
  )
})

test('a failed statement inside a transaction leaves no partial effect', async () => {
  const pool = new FakePoolFacade()
  pool.failSql = 'NOT_VALID'
  await assert.rejects(
    pool.withTransaction(async (tx) => {
      await tx.query('INSERT INTO _migrations (version, name) VALUES ($1, $2)', [1, 'a'])
      await tx.query('NOT_VALID')
    }),
    /simulated statement failure/,
  )
  assert.equal(pool.appliedVersions.size, 0, 'no migration recorded after rollback')
  assert.equal(pool.commitCount, 0)
  assert.equal(pool.rollbackCount, 1)
})
