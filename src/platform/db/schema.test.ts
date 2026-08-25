import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { loadMigrationTemplates } from './migrations.js'
import { hasStandardColumns, STANDARD_COLUMNS } from './schema.js'

async function readMigration(name: string): Promise<string> {
  return readFile(`db/migrations/${name}.sql`, 'utf8')
}

test('the standard-columns convention lists id and UTC timestamps', () => {
  assert.deepEqual([...STANDARD_COLUMNS], ['id', 'created_at', 'updated_at'])
})

test('pilots carries standard columns, primary key, timestamps, and updated-at trigger', async () => {
  const sql = await readMigration('002_pilots_sessions')
  assert.ok(hasStandardColumns('pilots', sql), 'pilots follows the standard convention')
  // The table additionally stores email (citext unique), display name, locale, and hash.
  assert.match(sql, /email citext not null unique/i)
  assert.match(sql, /display_name text not null/i)
  assert.match(sql, /locale text not null default 'es'/i)
  assert.match(sql, /password_hash text not null/i)
})

test('sessions is pilot-owned with a cascade deletion behavior', async () => {
  const sql = await readMigration('002_pilots_sessions')
  assert.match(sql, /create table sessions/i)
  assert.match(sql, /pilot_id uuid not null references pilots\(id\) on delete cascade/i)
  // Sessions are time-bound, not pilot-owned data, so they use created_at only.
  assert.match(sql, /token_hash text not null/i)
  assert.match(sql, /expires_at timestamptz not null/i)
})

test('documents follows the standard columns convention', async () => {
  const sql = await readMigration('003_documents_chunks')
  assert.ok(hasStandardColumns('documents', sql), 'documents follows the standard convention')
  assert.match(sql, /source_reference text unique/i)
  assert.match(sql, /locale text not null/i)
})

test('document_chunks are ordered, attributed, cascade-deleted, and indexed', async () => {
  const templates = await loadMigrationTemplates('db/migrations', 768)
  const sql = (templates.find((t) => t.version === 3) as { sql: string }).sql
  assert.match(sql, /document_id uuid not null references documents\(id\) on delete cascade/i)
  assert.match(sql, /position integer not null/i)
  assert.match(sql, /constraint document_chunks_position_unique unique \(document_id, position\)/i)
  assert.match(sql, /vector\(768\)/i, 'embedding column uses the configured dimensionality')
  assert.match(sql, /using hnsw \(embedding vector_cosine_ops\)/i, 'vector similarity index')
  assert.match(sql, /to_tsvector\('simple', content\)/i, 'full-text index on chunk content')
})

test('vector extension is enabled by the initial migration', async () => {
  const sql = await readMigration('001_enable_vector')
  assert.match(sql, /create extension if not exists vector/i)
})
