import { test } from 'node:test'
import assert from 'node:assert/strict'

import { FakePoolFacade } from './fake-pool.js'
import { applyMigrations, loadMigrationTemplates, type MigrationTemplate } from './migrations.js'

function template(version: number, name: string, sql: string): MigrationTemplate {
  return { version, name, sql }
}

test('applies migrations in ascending version order', async () => {
  const pool = new FakePoolFacade()
  const applied = await applyMigrations(pool, [
    template(3, 'c', 'CREATE TABLE c (id int);'),
    template(1, 'a', 'CREATE TABLE a (id int);'),
    template(2, 'b', 'CREATE TABLE b (id int);'),
  ])
  assert.equal(applied, 3)
  assert.deepEqual(pool.migrationOrder, [1, 2, 3])
})

test('re-applying the same migrations is exactly-once', async () => {
  const pool = new FakePoolFacade()
  const migrations = [
    template(1, 'a', 'CREATE TABLE a (id int);'),
    template(2, 'b', 'CREATE TABLE b (id int);'),
  ]

  assert.equal(await applyMigrations(pool, migrations), 2)
  assert.deepEqual(pool.appliedVersions, new Set([1, 2]))

  const second = await applyMigrations(pool, migrations)
  assert.equal(second, 0, 'second run applies nothing')
  assert.deepEqual(pool.appliedVersions, new Set([1, 2]))
  assert.equal(pool.commitCount, 2, 'no extra transactions on the second run')
})

test('a failing migration rolls back, is not recorded, and halts the run', async () => {
  const pool = new FakePoolFacade()
  pool.failSql = 'NOT_VALID'

  await assert.rejects(
    applyMigrations(pool, [
      template(1, 'good', 'CREATE TABLE good (id int);'),
      template(2, 'bad', 'NOT_VALID;'),
      template(3, 'later', 'CREATE TABLE later (id int);'),
    ]),
    /simulated statement failure/,
  )

  assert.deepEqual(pool.appliedVersions, new Set([1]))
  assert.equal(pool.rollbackCount, 1)
  assert.equal(pool.migrationOrder.length, 1, 'version 3 is never attempted')
})

test('a migration failed in a previous run can be retried successfully', async () => {
  const pool = new FakePoolFacade()
  pool.failSql = 'NOT_VALID'
  const bad = template(2, 'bad', 'NOT_VALID;')
  const good = template(3, 'later', 'CREATE TABLE later (id int);')

  await assert.rejects(applyMigrations(pool, [bad]))
  pool.failSql = null

  assert.equal(await applyMigrations(pool, [bad, good]), 2)
  assert.deepEqual(pool.appliedVersions, new Set([2, 3]))
})

test('loader reads and templates the shipped migration files', async () => {
  const templates = await loadMigrationTemplates('db/migrations', 768)
  assert.equal(templates.length, 3)
  assert.deepEqual(
    templates.map((t) => t.version),
    [1, 2, 3],
  )
  assert.deepEqual(
    templates.map((t) => t.name),
    ['enable_vector', 'pilots_sessions', 'documents_chunks'],
  )
  const documents = templates[2] as MigrationTemplate
  assert.ok(documents.sql.includes('vector(768)'), 'dimension templated into the column')
  assert.ok(!documents.sql.includes('__EMBEDDING_DIMENSIONS__'))
})
