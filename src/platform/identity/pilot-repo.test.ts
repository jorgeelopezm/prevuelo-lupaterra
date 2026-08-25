import { test } from 'node:test'
import assert from 'node:assert/strict'

import { FakePoolFacade } from '../db/fake-pool.js'
import { createPilotStore } from './pilot-repo.js'
import { hashPassword } from './passwords.js'

async function makePilot(pool: FakePoolFacade, email: string) {
  const store = createPilotStore(pool)
  const passwordHash = await hashPassword('piloto-dev-1234')
  return store.createIfUnique({ email, displayName: 'Piloto', locale: 'es', passwordHash })
}

test('creates a pilot and stores only the verifier, never the plaintext', async () => {
  const pool = new FakePoolFacade()
  const store = createPilotStore(pool)
  const passwordHash = await hashPassword('piloto-dev-1234')
  const pilot = await store.createIfUnique({
    email: 'piloto@ga-core.local',
    displayName: 'Piloto de Desarrollo',
    locale: 'es',
    passwordHash,
  })
  assert.ok(pilot)
  assert.equal(pilot?.passwordHash, passwordHash)
  assert.ok(!pool.pilots.some((p) => JSON.stringify(p).includes('piloto-dev-1234')))
})

test('a case-differing duplicate email is rejected', async () => {
  const pool = new FakePoolFacade()
  const first = await makePilot(pool, 'Piloto@GA-Core.local')
  const second = await makePilot(pool, 'piloto@ga-core.local')
  assert.ok(first)
  assert.equal(second, null, 'duplicate with different case must not create a second account')
  assert.equal(pool.pilots.length, 1)
})

test('findByEmail is case-insensitive via citext semantics', async () => {
  const pool = new FakePoolFacade()
  await makePilot(pool, 'PilotA@example.com')
  const store = createPilotStore(pool)
  const found = await store.findByEmail('pilota@EXAMPLE.com')
  assert.ok(found)
  assert.equal(found?.email, 'PilotA@example.com')
})

test('findById returns the pilot or null', async () => {
  const pool = new FakePoolFacade()
  const pilot = await makePilot(pool, 'pilot@example.com')
  const store = createPilotStore(pool)
  assert.equal((await store.findById(pilot?.id ?? 'nope'))?.id, pilot?.id)
  assert.equal(await store.findById('missing'), null)
})
