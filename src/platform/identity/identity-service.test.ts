import { test } from 'node:test'
import assert from 'node:assert/strict'

import { FakePoolFacade } from '../db/fake-pool.js'
import {
  createSqlIdentityStores,
  destroySession,
  openSession,
  registerPilot,
  resolveSessionToken,
  signInPilot,
} from './identity-service.js'
import { tokenDigest } from './tokens.js'

async function seededPilot(pool: FakePoolFacade) {
  const stores = createSqlIdentityStores(pool)
  const result = await registerPilot(stores, {
    email: 'piloto@ga-core.local',
    displayName: 'Piloto',
    locale: 'es',
    password: 'piloto-dev-1234',
  })
  assert.equal(result.ok, true)
  if (!result.ok) throw new Error('unreachable')
  return { stores, pilot: result.pilot }
}

test('registration rejects a duplicate email', async () => {
  const pool = new FakePoolFacade()
  await seededPilot(pool)
  const stores = createSqlIdentityStores(pool)
  const second = await registerPilot(stores, {
    email: 'PILOTO@ga-core.local',
    displayName: 'Otro',
    locale: 'es',
    password: 'otra-contraseña-123',
  })
  assert.deepEqual(second, { ok: false, reason: 'duplicate_email' })
})

test('sign-in returns a generic failure for unknown email and wrong password alike', async () => {
  const pool = new FakePoolFacade()
  const { stores } = await seededPilot(pool)
  const unknown = await signInPilot(stores, 'nobody@example.com', 'anything-123')
  const wrongPassword = await signInPilot(stores, 'piloto@ga-core.local', 'wrong-1234')
  assert.deepEqual(unknown, { ok: false })
  assert.deepEqual(wrongPassword, { ok: false })
})

test('sessions expire past their absolute lifetime', async () => {
  const pool = new FakePoolFacade()
  const { stores, pilot } = await seededPilot(pool)
  // Simulate an already-expired session in the store.
  await stores.sessions.create({
    pilotId: pilot.id,
    tokenHash: tokenDigest('expired-token'),
    expiresAt: new Date(Date.now() - 1000),
  })
  const resolved = await resolveSessionToken(stores, 'expired-token')
  assert.equal(resolved, null)
})

test('an open session resolves and carries the pilot; destruction invalidates it', async () => {
  const pool = new FakePoolFacade()
  const { stores, pilot } = await seededPilot(pool)
  const { token } = await openSession(stores, pilot, 168)

  const resolved = await resolveSessionToken(stores, token)
  assert.ok(resolved)
  assert.equal(resolved?.pilot.id, pilot.id)

  await destroySession(stores, token)
  assert.equal(await resolveSessionToken(stores, token), null)
  assert.equal(pool.sessions.length, 0)
})

test('the cookie token never equals the stored digest', async () => {
  const pool = new FakePoolFacade()
  const { stores, pilot } = await seededPilot(pool)
  const { token } = await openSession(stores, pilot, 168)
  assert.ok(token !== tokenDigest(token))
  assert.equal(pool.sessions[0]?.token_hash, tokenDigest(token))
})
