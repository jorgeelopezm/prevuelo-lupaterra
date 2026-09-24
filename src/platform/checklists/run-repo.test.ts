import { test } from 'node:test'
import assert from 'node:assert/strict'

import { FakePoolFacade } from '../db/fake-pool.js'
import { createAircraftRepo } from '../fleet/aircraft-repo.js'
import { createFlightIntentRepo } from '../risk/flight-intent-repo.js'
import { createChecklistRepo } from './checklist-repo.js'
import { createRunRepo } from './run-repo.js'

async function setup() {
  const pool = new FakePoolFacade()
  const aircraftRepo = createAircraftRepo(pool)
  const flightIntentRepo = createFlightIntentRepo(pool)
  const checklistRepo = createChecklistRepo(pool)
  const runRepo = createRunRepo(pool)

  const pilotA = 'pilot-a'
  const pilotB = 'pilot-b'
  pool.pilots.push(
    {
      id: pilotA,
      email: 'a@example.com',
      display_name: 'A',
      locale: 'es',
      password_hash: 'x',
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: pilotB,
      email: 'b@example.com',
      display_name: 'B',
      locale: 'es',
      password_hash: 'x',
      created_at: new Date(),
      updated_at: new Date(),
    },
  )

  const createdAircraft = await aircraftRepo.create(pilotA, {
    registration: 'EC-ABC',
    icaoType: 'C172',
    manufacturer: 'Cessna',
    model: '172S',
  })
  assert.ok(createdAircraft.ok)
  const aircraftId = createdAircraft.aircraft.id

  const intent = await flightIntentRepo.create(pilotA, {
    aircraftId,
    plannedDate: '2026-08-01',
    departureIcao: 'LEMD',
    destinationIcao: 'LEBL',
  })
  assert.ok(intent.ok)
  const flightIntentId = intent.flightIntent.id

  const normalChecklist = await checklistRepo.create(pilotA, {
    aircraftId,
    name: 'Preflight',
    kind: 'normal',
  })
  assert.ok(normalChecklist.ok)
  const checklistId = normalChecklist.checklist.id
  await checklistRepo.addItem(pilotA, checklistId, 'Item one')
  await checklistRepo.addItem(pilotA, checklistId, 'Item two')

  const emergencyChecklist = await checklistRepo.create(pilotA, {
    aircraftId,
    name: 'Emergency',
    kind: 'emergency',
  })
  assert.ok(emergencyChecklist.ok)

  return {
    pool,
    aircraftRepo,
    flightIntentRepo,
    checklistRepo,
    runRepo,
    pilotA,
    pilotB,
    aircraftId,
    flightIntentId,
    checklistId,
    emergencyChecklistId: emergencyChecklist.checklist.id,
  }
}

test('opening a normal checklist starts a run snapshotting its current items', async () => {
  const { runRepo, pilotA, checklistId, flightIntentId } = await setup()
  const result = await runRepo.openOrStart(pilotA, checklistId, flightIntentId)
  assert.ok(result.ok)
  assert.equal(result.run.items.length, 2)
  assert.equal(result.run.completedAt, null)
  assert.deepEqual(
    result.run.items.map((i) => i.text),
    ['Item one', 'Item two'],
  )
})

test('opening the same checklist for the same intent resumes the open run', async () => {
  const { runRepo, pilotA, checklistId, flightIntentId } = await setup()
  const first = await runRepo.openOrStart(pilotA, checklistId, flightIntentId)
  assert.ok(first.ok)
  const second = await runRepo.openOrStart(pilotA, checklistId, flightIntentId)
  assert.ok(second.ok)
  assert.equal(first.run.id, second.run.id)
})

test('opening an emergency checklist is rejected', async () => {
  const { runRepo, pilotA, emergencyChecklistId, flightIntentId } = await setup()
  const result = await runRepo.openOrStart(pilotA, emergencyChecklistId, flightIntentId)
  assert.deepEqual(result, { ok: false, reason: 'checklist_is_emergency' })
})

test('editing a checklist item after a run started leaves the open run unchanged', async () => {
  const { runRepo, checklistRepo, pilotA, checklistId, flightIntentId } = await setup()
  const started = await runRepo.openOrStart(pilotA, checklistId, flightIntentId)
  assert.ok(started.ok)
  const originalText = started.run.items[0]?.text

  const withItems = await checklistRepo.findById(pilotA, checklistId)
  const itemId = withItems?.items[0]?.id as string
  await checklistRepo.updateItem(pilotA, checklistId, itemId, 'Edited text')

  const reloaded = await runRepo.findById(pilotA, started.run.id)
  assert.equal(reloaded?.items[0]?.text, originalText)
  assert.notEqual(reloaded?.items[0]?.text, 'Edited text')
})

test('toggling items persists and completes the run when the last item is confirmed', async () => {
  const { runRepo, pilotA, checklistId, flightIntentId } = await setup()
  const started = await runRepo.openOrStart(pilotA, checklistId, flightIntentId)
  assert.ok(started.ok)
  const [item1, item2] = started.run.items
  assert.ok(item1 && item2)

  const afterFirst = await runRepo.toggleItem(pilotA, started.run.id, item1.id)
  assert.ok(afterFirst.ok)
  assert.equal(afterFirst.run.completedAt, null)
  assert.ok(afterFirst.run.items.find((i) => i.id === item1.id)?.checkedAt)

  const afterSecond = await runRepo.toggleItem(pilotA, started.run.id, item2.id)
  assert.ok(afterSecond.ok)
  assert.ok(afterSecond.run.completedAt, 'run completes once every item is confirmed')
})

test('un-confirming an item of an open run decreases the completion count', async () => {
  const { runRepo, pilotA, checklistId, flightIntentId } = await setup()
  const started = await runRepo.openOrStart(pilotA, checklistId, flightIntentId)
  assert.ok(started.ok)
  const [item1, item2] = started.run.items
  assert.ok(item1 && item2)
  await runRepo.toggleItem(pilotA, started.run.id, item1.id)

  const unchecked = await runRepo.toggleItem(pilotA, started.run.id, item1.id)
  assert.ok(unchecked.ok)
  assert.equal(unchecked.run.completedAt, null)
  assert.equal(unchecked.run.items.find((i) => i.id === item1.id)?.checkedAt, null)
})

test('toggling or resetting a completed run is rejected and leaves it unchanged', async () => {
  const { runRepo, pilotA, checklistId, flightIntentId } = await setup()
  const started = await runRepo.openOrStart(pilotA, checklistId, flightIntentId)
  assert.ok(started.ok)
  const [item1, item2] = started.run.items
  assert.ok(item1 && item2)
  await runRepo.toggleItem(pilotA, started.run.id, item1.id)
  const completed = await runRepo.toggleItem(pilotA, started.run.id, item2.id)
  assert.ok(completed.ok && completed.run.completedAt)

  const rejectedToggle = await runRepo.toggleItem(pilotA, started.run.id, item1.id)
  assert.deepEqual(rejectedToggle, { ok: false, reason: 'completed' })

  const rejectedReset = await runRepo.reset(pilotA, started.run.id)
  assert.deepEqual(rejectedReset, { ok: false, reason: 'completed' })

  const reloaded = await runRepo.findById(pilotA, started.run.id)
  assert.ok(reloaded?.items.every((i) => i.checkedAt))
})

test('reset clears every item of the open run without touching history', async () => {
  const { runRepo, pilotA, checklistId, flightIntentId } = await setup()
  const started = await runRepo.openOrStart(pilotA, checklistId, flightIntentId)
  assert.ok(started.ok)
  const [item1] = started.run.items
  assert.ok(item1)
  await runRepo.toggleItem(pilotA, started.run.id, item1.id)
  const reset = await runRepo.reset(pilotA, started.run.id)
  assert.ok(reset.ok)
  assert.ok(reset.run.items.every((i) => i.checkedAt === null))
})

test('starting again after completion retains the completed run and starts a new one', async () => {
  const { runRepo, pilotA, checklistId, flightIntentId } = await setup()
  const started = await runRepo.openOrStart(pilotA, checklistId, flightIntentId)
  assert.ok(started.ok)
  for (const item of started.run.items) {
    await runRepo.toggleItem(pilotA, started.run.id, item.id)
  }
  const completedRun = await runRepo.findById(pilotA, started.run.id)
  assert.ok(completedRun?.completedAt)

  const again = await runRepo.openOrStart(pilotA, checklistId, flightIntentId)
  assert.ok(again.ok)
  assert.notEqual(again.run.id, started.run.id)
  assert.equal(again.run.completedAt, null)

  const stillThere = await runRepo.findById(pilotA, started.run.id)
  assert.ok(stillThere?.completedAt, 'the earlier completed run is retained')
})

test('a run is only visible to its owning pilot', async () => {
  const { runRepo, pilotA, pilotB, checklistId, flightIntentId } = await setup()
  const started = await runRepo.openOrStart(pilotA, checklistId, flightIntentId)
  assert.ok(started.ok)
  assert.equal(await runRepo.findById(pilotB, started.run.id), null)
  assert.notEqual(await runRepo.findById(pilotA, started.run.id), null)
})

test('listCompletedForAircraft lists only completed runs, most recent first', async () => {
  const { runRepo, checklistRepo, pilotA, aircraftId, checklistId, flightIntentId } = await setup()
  const started = await runRepo.openOrStart(pilotA, checklistId, flightIntentId)
  assert.ok(started.ok)
  for (const item of started.run.items) {
    await runRepo.toggleItem(pilotA, started.run.id, item.id)
  }
  const list = await runRepo.listCompletedForAircraft(pilotA, aircraftId)
  assert.equal(list.length, 1)
  assert.equal(list[0]?.id, started.run.id)
  void checklistRepo
})

test('deleting a checklist preserves its completed run and denormalized name', async () => {
  const { runRepo, checklistRepo, pilotA, aircraftId, checklistId, flightIntentId } = await setup()
  const started = await runRepo.openOrStart(pilotA, checklistId, flightIntentId)
  assert.ok(started.ok)
  for (const item of started.run.items) {
    await runRepo.toggleItem(pilotA, started.run.id, item.id)
  }
  await checklistRepo.remove(pilotA, checklistId)

  const list = await runRepo.listCompletedForAircraft(pilotA, aircraftId)
  assert.equal(list.length, 1)
  assert.equal(list[0]?.checklistId, null)
  assert.equal(list[0]?.checklistName, 'Preflight')
  assert.deepEqual(
    list[0]?.items.map((i) => i.text),
    ['Item one', 'Item two'],
  )
})

test('preflightProgressForIntent reports null when no checklist carries the preflight role', async () => {
  const { runRepo, pilotA, aircraftId, flightIntentId } = await setup()
  assert.equal(await runRepo.preflightProgressForIntent(pilotA, flightIntentId, aircraftId), null)
})

test('preflightProgressForIntent reports null when the preflight checklist has no run', async () => {
  const { runRepo, checklistRepo, pilotA, aircraftId, checklistId, flightIntentId } = await setup()
  await checklistRepo.setPreflightRole(pilotA, aircraftId, checklistId)
  assert.equal(await runRepo.preflightProgressForIntent(pilotA, flightIntentId, aircraftId), null)
})

test('preflightProgressForIntent reports the run counts once a run exists', async () => {
  const { runRepo, checklistRepo, pilotA, aircraftId, checklistId, flightIntentId } = await setup()
  await checklistRepo.setPreflightRole(pilotA, aircraftId, checklistId)
  const started = await runRepo.openOrStart(pilotA, checklistId, flightIntentId)
  assert.ok(started.ok)
  await runRepo.toggleItem(pilotA, started.run.id, started.run.items[0]?.id as string)

  const progress = await runRepo.preflightProgressForIntent(pilotA, flightIntentId, aircraftId)
  assert.deepEqual(progress, { checklistName: 'Preflight', checkedCount: 1, totalCount: 2 })
})
