import { test } from 'node:test'
import assert from 'node:assert/strict'

import { FakePoolFacade } from '../db/fake-pool.js'
import { createAircraftRepo } from '../fleet/aircraft-repo.js'
import { createChecklistRepo } from './checklist-repo.js'

async function setup() {
  const pool = new FakePoolFacade()
  const aircraftRepo = createAircraftRepo(pool)
  const checklistRepo = createChecklistRepo(pool)

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

  const created = await aircraftRepo.create(pilotA, {
    registration: 'EC-ABC',
    icaoType: 'C172',
    manufacturer: 'Cessna',
    model: '172S',
  })
  assert.ok(created.ok)
  const aircraftId = created.aircraft.id

  return { pool, aircraftRepo, checklistRepo, pilotA, pilotB, aircraftId }
}

test('creating a checklist against an owned aircraft succeeds and appears in the group', async () => {
  const { checklistRepo, pilotA, aircraftId } = await setup()
  const result = await checklistRepo.create(pilotA, {
    aircraftId,
    name: 'Custom List',
    kind: 'normal',
  })
  assert.ok(result.ok)
  assert.equal(result.checklist.source, 'pilot')
  assert.equal(result.checklist.pilotId, pilotA)
  const list = await checklistRepo.listForAircraft(pilotA, aircraftId)
  assert.ok(list.some((c) => c.id === result.checklist.id))
})

test("creating a checklist against another pilot's aircraft fails without disclosure", async () => {
  const { checklistRepo, pilotB, aircraftId } = await setup()
  const result = await checklistRepo.create(pilotB, {
    aircraftId,
    name: 'Custom List',
    kind: 'normal',
  })
  assert.deepEqual(result, { ok: false, reason: 'aircraft_not_owned' })
})

test('listForAircraft renders normal checklists before emergency ones', async () => {
  const { checklistRepo, pilotA, aircraftId } = await setup()
  await checklistRepo.create(pilotA, { aircraftId, name: 'Emergency A', kind: 'emergency' })
  await checklistRepo.create(pilotA, { aircraftId, name: 'Normal A', kind: 'normal' })
  const list = await checklistRepo.listForAircraft(pilotA, aircraftId)
  const kinds = list.map((c) => c.kind)
  const firstEmergency = kinds.indexOf('emergency')
  const lastNormal = kinds.lastIndexOf('normal')
  assert.ok(firstEmergency === -1 || lastNormal < firstEmergency)
})

test('renaming a checklist flips its source to pilot', async () => {
  const { checklistRepo, pilotA, aircraftId } = await setup()
  const created = await checklistRepo.create(pilotA, { aircraftId, name: 'X', kind: 'normal' })
  assert.ok(created.ok)
  const renamed = await checklistRepo.rename(pilotA, created.checklist.id, 'Y')
  assert.ok(renamed.ok)
  assert.equal(renamed.checklist.name, 'Y')
  assert.equal(renamed.checklist.source, 'pilot')
})

test("renaming another pilot's checklist fails as not found", async () => {
  const { checklistRepo, pilotA, pilotB, aircraftId } = await setup()
  const created = await checklistRepo.create(pilotA, { aircraftId, name: 'X', kind: 'normal' })
  assert.ok(created.ok)
  const result = await checklistRepo.rename(pilotB, created.checklist.id, 'Y')
  assert.deepEqual(result, { ok: false, reason: 'not_found' })
})

test('moving a checklist up swaps its position with the previous sibling of the same kind', async () => {
  const { checklistRepo, pilotA, aircraftId } = await setup()
  const first = await checklistRepo.create(pilotA, { aircraftId, name: 'First', kind: 'normal' })
  const second = await checklistRepo.create(pilotA, { aircraftId, name: 'Second', kind: 'normal' })
  assert.ok(first.ok && second.ok)
  const moved = await checklistRepo.move(pilotA, second.checklist.id, 'up')
  assert.equal(moved, true)
  const list = await checklistRepo.listForAircraft(pilotA, aircraftId)
  const names = list.filter((c) => c.kind === 'normal').map((c) => c.name)
  assert.deepEqual(names, ['Second', 'First'])
})

test('moving the first item of a group up is a no-op', async () => {
  const { checklistRepo, pilotA, aircraftId } = await setup()
  const only = await checklistRepo.create(pilotA, { aircraftId, name: 'Only', kind: 'normal' })
  assert.ok(only.ok)
  const moved = await checklistRepo.move(pilotA, only.checklist.id, 'up')
  assert.equal(moved, false)
})

test('adding, updating, reordering, and removing items works and flips source', async () => {
  const { checklistRepo, pilotA, aircraftId } = await setup()
  const created = await checklistRepo.create(pilotA, { aircraftId, name: 'X', kind: 'normal' })
  assert.ok(created.ok)
  const checklistId = created.checklist.id

  const item1 = await checklistRepo.addItem(pilotA, checklistId, 'First item')
  const item2 = await checklistRepo.addItem(pilotA, checklistId, 'Second item')
  assert.ok(item1 && item2)

  const withItems = await checklistRepo.findById(pilotA, checklistId)
  assert.equal(withItems?.items.length, 2)
  assert.equal(withItems?.source, 'pilot')

  const updated = await checklistRepo.updateItem(pilotA, checklistId, item1.id, 'Updated text')
  assert.equal(updated, true)
  const afterUpdate = await checklistRepo.findById(pilotA, checklistId)
  assert.equal(afterUpdate?.items[0]?.text, 'Updated text')

  const movedItem = await checklistRepo.moveItem(pilotA, checklistId, item2.id, 'up')
  assert.equal(movedItem, true)
  const afterMove = await checklistRepo.findById(pilotA, checklistId)
  assert.equal(afterMove?.items[0]?.id, item2.id)

  const removed = await checklistRepo.removeItem(pilotA, checklistId, item1.id)
  assert.equal(removed, true)
  const afterRemove = await checklistRepo.findById(pilotA, checklistId)
  assert.equal(afterRemove?.items.length, 1)
})

test('deleting a checklist removes it and its items', async () => {
  const { checklistRepo, pilotA, aircraftId } = await setup()
  const created = await checklistRepo.create(pilotA, { aircraftId, name: 'X', kind: 'normal' })
  assert.ok(created.ok)
  await checklistRepo.addItem(pilotA, created.checklist.id, 'Item')
  const removed = await checklistRepo.remove(pilotA, created.checklist.id)
  assert.equal(removed, true)
  assert.equal(await checklistRepo.findById(pilotA, created.checklist.id), null)
})

test('setPreflightRole moves the designation and rejects an emergency target', async () => {
  const { checklistRepo, pilotA, aircraftId } = await setup()
  const first = await checklistRepo.create(pilotA, { aircraftId, name: 'First', kind: 'normal' })
  const second = await checklistRepo.create(pilotA, { aircraftId, name: 'Second', kind: 'normal' })
  const emergency = await checklistRepo.create(pilotA, {
    aircraftId,
    name: 'Emerg',
    kind: 'emergency',
  })
  assert.ok(first.ok && second.ok && emergency.ok)

  const setFirst = await checklistRepo.setPreflightRole(pilotA, aircraftId, first.checklist.id)
  assert.deepEqual(setFirst, { ok: true })

  const setSecond = await checklistRepo.setPreflightRole(pilotA, aircraftId, second.checklist.id)
  assert.deepEqual(setSecond, { ok: true })

  const list = await checklistRepo.listForAircraft(pilotA, aircraftId)
  const firstRow = list.find((c) => c.id === first.checklist.id)
  const secondRow = list.find((c) => c.id === second.checklist.id)
  assert.equal(firstRow?.role, null)
  assert.equal(secondRow?.role, 'preflight')

  const rejected = await checklistRepo.setPreflightRole(pilotA, aircraftId, emergency.checklist.id)
  assert.deepEqual(rejected, { ok: false, reason: 'cannot_be_emergency' })
})

test('a checklist is only visible to its owning pilot', async () => {
  const { checklistRepo, pilotA, pilotB, aircraftId } = await setup()
  const created = await checklistRepo.create(pilotA, { aircraftId, name: 'X', kind: 'normal' })
  assert.ok(created.ok)
  assert.equal(await checklistRepo.findById(pilotB, created.checklist.id), null)
  assert.notEqual(await checklistRepo.findById(pilotA, created.checklist.id), null)
})
