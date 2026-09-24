import { test } from 'node:test'
import assert from 'node:assert/strict'

import { FakePoolFacade } from '../db/fake-pool.js'
import { createAircraftRepo } from '../fleet/aircraft-repo.js'
import { seedChecklistsForAircraft } from './seed.js'
import { GENERIC_GA_TEMPLATE } from './template.js'
import { createChecklistRepo } from './checklist-repo.js'

function withPilot(pool: FakePoolFacade, id: string) {
  pool.pilots.push({
    id,
    email: `${id}@example.com`,
    display_name: id,
    locale: 'es',
    password_hash: 'x',
    created_at: new Date(),
    updated_at: new Date(),
  })
}

test('creating an aircraft with the seed hook produces the full library owned by the same pilot', async () => {
  const pool = new FakePoolFacade()
  withPilot(pool, 'pilot-a')
  const aircraftRepo = createAircraftRepo(pool, {
    onAircraftCreated: (tx, pilotId, aircraftId, locale) =>
      seedChecklistsForAircraft(tx, { pilotId, aircraftId, locale }),
  })
  const checklistRepo = createChecklistRepo(pool)

  const created = await aircraftRepo.create(
    'pilot-a',
    { registration: 'EC-ABC', icaoType: 'C172', manufacturer: 'Cessna', model: '172S' },
    'es',
  )
  assert.ok(created.ok)

  const library = await checklistRepo.listForAircraft('pilot-a', created.aircraft.id)
  assert.equal(library.length, GENERIC_GA_TEMPLATE.length)
  assert.ok(library.every((c) => c.pilotId === 'pilot-a'))
  assert.ok(library.every((c) => c.source === 'template'))

  const preflight = library.find((c) => c.role === 'preflight')
  assert.ok(preflight)
  const withItems = await checklistRepo.findById('pilot-a', preflight.id)
  assert.ok(withItems && withItems.items.length > 0)
  assert.equal(withItems?.items[0]?.text, GENERIC_GA_TEMPLATE[0]?.items[0]?.text.es)
})

test('a throwing seeder leaves no aircraft row', async () => {
  const pool = new FakePoolFacade()
  withPilot(pool, 'pilot-a')
  const aircraftRepo = createAircraftRepo(pool, {
    onAircraftCreated: async () => {
      throw new Error('simulated seeding failure')
    },
  })

  await assert.rejects(
    aircraftRepo.create('pilot-a', {
      registration: 'EC-ABC',
      icaoType: 'C172',
      manufacturer: 'Cessna',
      model: '172S',
    }),
    /simulated seeding failure/,
  )

  assert.equal(pool.aircraft.length, 0)
  assert.deepEqual(await aircraftRepo.list('pilot-a'), [])
})
