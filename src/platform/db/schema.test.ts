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

test('aircraft carries standard columns, pilot ownership, and the composite FK anchor', async () => {
  const sql = await readMigration('004_aircraft')
  assert.ok(hasStandardColumns('aircraft', sql), 'aircraft follows the standard convention')
  assert.match(sql, /pilot_id uuid not null references pilots\(id\) on delete cascade/i)
  assert.match(sql, /constraint aircraft_id_pilot_id_unique unique \(id, pilot_id\)/i)
})

test('aircraft registration uniqueness is per-pilot, normalized, and excludes retired aircraft', async () => {
  const sql = await readMigration('004_aircraft')
  assert.match(sql, /create unique index aircraft_pilot_registration_uniq on aircraft/i)
  assert.match(sql, /where retired_at is null/i)
})

test('pilots gains an active_aircraft_id column referencing aircraft with set-null on delete', async () => {
  const sql = await readMigration('004_aircraft')
  assert.match(
    sql,
    /alter table pilots add column active_aircraft_id uuid references aircraft\(id\) on delete set null/i,
  )
})

/**
 * Every pilot-owned table introduced for the fleet capability declares a
 * non-nullable `pilot_id` with a defined deletion behavior (data-foundation's
 * standard-columns convention), keeping ownership scoping structural rather
 * than dependent on remembering a join.
 */
test('every fleet migration declares pilot_id NOT NULL with a deletion behavior', async () => {
  const fleetMigrations = [
    '004_aircraft',
    '005_aircraft_documents_and_wb',
    '006_flight_entries',
    '007_maintenance_items',
    '008_engine_data_files',
  ]
  for (const name of fleetMigrations) {
    const sql = await readMigration(name)
    assert.match(
      sql,
      /pilot_id uuid not null references pilots\(id\) on delete cascade/i,
      `${name} declares pilot_id NOT NULL with ON DELETE CASCADE`,
    )
  }
})

test('aircraft_documents is pilot-owned, aircraft-owned via the composite FK, and dates are checked', async () => {
  const sql = await readMigration('005_aircraft_documents_and_wb')
  assert.match(sql, /create table aircraft_documents/i)
  assert.match(
    sql,
    /foreign key \(aircraft_id, pilot_id\) references aircraft \(id, pilot_id\) on delete cascade/i,
  )
  assert.match(sql, /check \(issued_on is null or expires_on is null or expires_on >= issued_on\)/i)
})

test('the weight and balance columns carry explicit mass/length unit columns and a limits check', async () => {
  const sql = await readMigration('005_aircraft_documents_and_wb')
  assert.match(sql, /alter table aircraft add column wb_empty_weight numeric/i)
  assert.match(sql, /alter table aircraft add column wb_mass_unit text/i)
  assert.match(sql, /alter table aircraft add column wb_length_unit text/i)
  assert.match(
    sql,
    /check \(wb_empty_weight is null or wb_mtow is null or wb_empty_weight <= wb_mtow\)/i,
  )
})

test('flight_entries discriminates flight vs FSTD shape and bounds night/IFR minutes to the total', async () => {
  const sql = await readMigration('006_flight_entries')
  assert.match(sql, /create table flight_entries/i)
  assert.match(
    sql,
    /foreign key \(aircraft_id, pilot_id\) references aircraft \(id, pilot_id\) on delete cascade/i,
  )
  assert.match(sql, /constraint flight_entries_kind_shape_check check/i)
  assert.match(
    sql,
    /constraint flight_entries_night_minutes_check\s+check \(night_minutes >= 0 and night_minutes <= total_minutes\)/i,
  )
  assert.match(sql, /constraint flight_entries_total_minutes_check check \(total_minutes > 0\)/i)
})

test('flight_entries is indexed for reverse-chronological pilot and aircraft listings', async () => {
  const sql = await readMigration('006_flight_entries')
  assert.match(
    sql,
    /create index flight_entries_pilot_date_idx on flight_entries \(pilot_id, flight_date desc\)/i,
  )
  assert.match(
    sql,
    /create index flight_entries_aircraft_date_idx on flight_entries \(aircraft_id, flight_date desc\)/i,
  )
})

test('maintenance_items requires a due condition and validates hours_basis', async () => {
  const sql = await readMigration('007_maintenance_items')
  assert.match(sql, /create table maintenance_items/i)
  assert.match(
    sql,
    /constraint maintenance_items_due_condition_check\s+check \(due_on is not null or due_at_hours is not null\)/i,
  )
  assert.match(sql, /constraint maintenance_items_hours_basis_check/i)
})

test('maintenance_completions references its item and keeps completion history', async () => {
  const sql = await readMigration('007_maintenance_items')
  assert.match(sql, /create table maintenance_completions/i)
  assert.match(
    sql,
    /maintenance_item_id uuid not null references maintenance_items\(id\) on delete cascade/i,
  )
})

test('engine_data_files allows at most one import per flight entry and carries provenance', async () => {
  const sql = await readMigration('008_engine_data_files')
  assert.match(sql, /create table engine_data_files/i)
  assert.match(sql, /content_digest text not null/i)
  assert.match(sql, /detected_format text not null/i)
  assert.match(sql, /constraint engine_data_files_flight_entry_unique unique \(flight_entry_id\)/i)
  assert.match(
    sql,
    /flight_entry_id uuid not null references flight_entries\(id\) on delete cascade/i,
  )
})

test('aircraft gains a pilot-entered engine_limits column with no default', async () => {
  const sql = await readMigration('008_engine_data_files')
  assert.match(sql, /alter table aircraft add column engine_limits jsonb/i)
})

test('load stations and CG envelope points are ordered and aircraft-owned via the composite FK', async () => {
  const sql = await readMigration('005_aircraft_documents_and_wb')
  assert.match(sql, /create table aircraft_load_stations/i)
  assert.match(
    sql,
    /constraint aircraft_load_stations_position_unique unique \(aircraft_id, position\)/i,
  )
  assert.match(sql, /create table aircraft_cg_envelope_points/i)
  assert.match(
    sql,
    /constraint aircraft_cg_points_position_unique unique \(aircraft_id, position\)/i,
  )
})

test('checklists carries standard columns, the composite FK anchor, and its check constraints', async () => {
  const sql = await readMigration('011_checklists')
  assert.ok(hasStandardColumns('checklists', sql), 'checklists follows the standard convention')
  assert.match(
    sql,
    /foreign key \(aircraft_id, pilot_id\) references aircraft \(id, pilot_id\) on delete cascade/i,
  )
  assert.match(sql, /constraint checklists_id_pilot_id_unique unique \(id, pilot_id\)/i)
  assert.match(sql, /constraint checklists_kind_check check \(kind in \('normal', 'emergency'\)\)/i)
  assert.match(
    sql,
    /constraint checklists_source_check check \(source in \('template', 'pilot'\)\)/i,
  )
})

test('checklists_preflight_uniq allows at most one preflight-designated checklist per aircraft', async () => {
  const sql = await readMigration('011_checklists')
  assert.match(
    sql,
    /create unique index checklists_preflight_uniq on checklists \(aircraft_id\)\s+where role = 'preflight'/i,
  )
})

test('checklist_items carries standard columns and is checklist-owned via the composite FK', async () => {
  const sql = await readMigration('011_checklists')
  assert.ok(
    hasStandardColumns('checklist_items', sql),
    'checklist_items follows the standard convention',
  )
  assert.match(
    sql,
    /foreign key \(checklist_id, pilot_id\) references checklists \(id, pilot_id\) on delete cascade/i,
  )
  assert.match(sql, /constraint checklist_items_id_pilot_id_unique unique \(id, pilot_id\)/i)
})

test('the checklist backfill seeds every non-retired aircraft from the generated block', async () => {
  const sql = await readMigration('011_checklists')
  assert.match(sql, /-- BEGIN GENERATED BACKFILL/)
  assert.match(sql, /-- END GENERATED BACKFILL/)
  assert.match(sql, /insert into checklists/i)
  assert.match(sql, /insert into checklist_items/i)
  // Every generated INSERT is scoped to non-retired aircraft (forward-only:
  // retired aircraft are never backfilled).
  const block = sql.slice(
    sql.indexOf('-- BEGIN GENERATED BACKFILL'),
    sql.indexOf('-- END GENERATED BACKFILL'),
  )
  const inserts = block.match(/insert into checklists/gi) ?? []
  assert.ok(inserts.length > 0)
  assert.doesNotMatch(block, /retired_at is null\s*=\s*false/i)
})

test('the checklist backfill matches the generated template output (drift guard, task 2.4)', async () => {
  const { renderBackfillSql } = await import('../../../scripts/generate-checklist-seed.js')
  const sql = await readMigration('011_checklists')
  const start = sql.indexOf('-- BEGIN GENERATED BACKFILL') + '-- BEGIN GENERATED BACKFILL'.length
  const end = sql.indexOf('-- END GENERATED BACKFILL')
  const recorded = sql.slice(start, end).trim()
  assert.equal(recorded, (renderBackfillSql() as string).trim())
})

test('checklist_runs preserves completed runs when their checklist is deleted', async () => {
  const sql = await readMigration('012_checklist_runs')
  assert.match(sql, /create table checklist_runs/i)
  assert.match(sql, /checklist_id uuid,/i, 'checklist_id is nullable')
  assert.match(sql, /checklist_name text not null/i)
  assert.match(
    sql,
    /foreign key \(checklist_id, pilot_id\) references checklists \(id, pilot_id\) on delete set null/i,
  )
  assert.match(
    sql,
    /foreign key \(flight_intent_id, pilot_id\) references flight_intents \(id, pilot_id\) on delete cascade/i,
  )
  assert.match(sql, /constraint checklist_runs_id_pilot_id_unique unique \(id, pilot_id\)/i)
})

test('checklist_runs_open_uniq allows at most one open run per pilot, flight intent, and checklist', async () => {
  const sql = await readMigration('012_checklist_runs')
  assert.match(
    sql,
    /create unique index checklist_runs_open_uniq on checklist_runs \(pilot_id, flight_intent_id, checklist_id\)\s+where completed_at is null/i,
  )
})

test('checklist_run_items snapshots text and position and survives its source item being deleted', async () => {
  const sql = await readMigration('012_checklist_runs')
  assert.match(sql, /create table checklist_run_items/i)
  assert.match(sql, /text text not null/i)
  assert.match(sql, /position integer not null/i)
  assert.match(sql, /checklist_item_id uuid references checklist_items\(id\) on delete set null/i)
  assert.match(
    sql,
    /foreign key \(run_id, pilot_id\) references checklist_runs \(id, pilot_id\) on delete cascade/i,
  )
})
