/**
 * Live integration tests guarded by TEST_DATABASE_URL, covering the
 * transactional invariants the in-memory fake cannot exercise faithfully:
 * the true unique-index race on `checklist_runs_open_uniq` under real
 * concurrency, and `setPreflightRole`'s atomicity.
 *   TEST_DATABASE_URL=postgres://ga:ga@localhost:5432/ga_core_test npm test
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

import { createPool } from '../db/pool.js'
import { applyMigrations, loadMigrationTemplates } from '../db/migrations.js'
import { createAircraftRepo } from '../fleet/aircraft-repo.js'
import { createFlightIntentRepo } from '../risk/flight-intent-repo.js'
import { createChecklistRepo } from './checklist-repo.js'
import { createRunRepo } from './run-repo.js'

const testDatabaseUrl = process.env.TEST_DATABASE_URL
const it = testDatabaseUrl ? test : test.skip

async function setup() {
  const pool = createPool(testDatabaseUrl as string)
  await applyMigrations(pool, await loadMigrationTemplates('db/migrations', 768))

  const email = `checklists-integration-${randomUUID()}@ga-core.local`
  const inserted = await pool.query<{ id: string }>(
    `INSERT INTO pilots (email, display_name, locale, password_hash) VALUES ($1, $2, $3, $4) RETURNING id`,
    [email, 'Integration Pilot', 'en', '[integration]'],
  )
  const pilotId = inserted.rows[0]?.id as string

  const aircraftRepo = createAircraftRepo(pool)
  const flightIntentRepo = createFlightIntentRepo(pool)
  const checklistRepo = createChecklistRepo(pool)
  const runRepo = createRunRepo(pool)

  const createdAircraft = await aircraftRepo.create(pilotId, {
    registration: `EC-${randomUUID().slice(0, 5).toUpperCase()}`,
    icaoType: 'C172',
    manufacturer: 'Cessna',
    model: '172S',
  })
  assert.ok(createdAircraft.ok)
  const aircraftId = createdAircraft.aircraft.id

  const intent = await flightIntentRepo.create(pilotId, {
    aircraftId,
    plannedDate: '2026-08-01',
    departureIcao: 'LEMD',
    destinationIcao: 'LEBL',
  })
  assert.ok(intent.ok)

  const checklist = await checklistRepo.create(pilotId, {
    aircraftId,
    name: 'Preflight',
    kind: 'normal',
  })
  assert.ok(checklist.ok)
  await checklistRepo.addItem(pilotId, checklist.checklist.id, 'Item one')

  return {
    pool,
    pilotId,
    aircraftId,
    flightIntentId: intent.flightIntent.id,
    checklistId: checklist.checklist.id,
    checklistRepo,
    runRepo,
  }
}

it('two concurrent opens of the same checklist for the same flight intent yield exactly one open run', async () => {
  const { pool, pilotId, flightIntentId, checklistId, runRepo } = await setup()
  try {
    const [a, b] = await Promise.all([
      runRepo.openOrStart(pilotId, checklistId, flightIntentId),
      runRepo.openOrStart(pilotId, checklistId, flightIntentId),
    ])
    assert.ok(a.ok && b.ok)
    assert.equal(a.run.id, b.run.id)

    const openRuns = await pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM checklist_runs
       WHERE pilot_id = $1 AND flight_intent_id = $2 AND checklist_id = $3 AND completed_at IS NULL`,
      [pilotId, flightIntentId, checklistId],
    )
    assert.equal(openRuns.rows[0]?.count, '1')
  } finally {
    await pool.end()
  }
})

it('setPreflightRole atomically moves the designation under the partial unique index', async () => {
  const { pool, pilotId, aircraftId, checklistId, checklistRepo } = await setup()
  try {
    const second = await checklistRepo.create(pilotId, {
      aircraftId,
      name: 'Second',
      kind: 'normal',
    })
    assert.ok(second.ok)

    await checklistRepo.setPreflightRole(pilotId, aircraftId, checklistId)
    const moved = await checklistRepo.setPreflightRole(pilotId, aircraftId, second.checklist.id)
    assert.deepEqual(moved, { ok: true })

    const roleCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM checklists WHERE aircraft_id = $1 AND role = 'preflight'`,
      [aircraftId],
    )
    assert.equal(roleCount.rows[0]?.count, '1')
  } finally {
    await pool.end()
  }
})

it('a completed run rejects a toggle even under the live schema', async () => {
  const { pool, pilotId, flightIntentId, checklistId, runRepo } = await setup()
  try {
    const started = await runRepo.openOrStart(pilotId, checklistId, flightIntentId)
    assert.ok(started.ok)
    const item = started.run.items[0]
    assert.ok(item)
    const completed = await runRepo.toggleItem(pilotId, started.run.id, item.id)
    assert.ok(completed.ok && completed.run.completedAt)

    const rejected = await runRepo.toggleItem(pilotId, started.run.id, item.id)
    assert.deepEqual(rejected, { ok: false, reason: 'completed' })
  } finally {
    await pool.end()
  }
})
