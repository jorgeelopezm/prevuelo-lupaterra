import { test } from 'node:test'
import assert from 'node:assert/strict'

import { FakePoolFacade } from '../db/fake-pool.js'
import { createSqlIdentityStores } from './identity-service.js'
import { scopedToOwner } from './ownership.js'
import { registerPilot } from './identity-service.js'
import { tokenDigest } from './tokens.js'

test('a pilot cannot see another pilot record: ownership scope returns null (404 semantics)', async () => {
  const pool = new FakePoolFacade()
  const stores = createSqlIdentityStores(pool)

  const owner = await registerPilot(stores, {
    email: 'owner@example.com',
    displayName: 'Owner',
    locale: 'es',
    password: 'owner-password-1234',
  })
  const intruder = await registerPilot(stores, {
    email: 'intruder@example.com',
    displayName: 'Intruder',
    locale: 'es',
    password: 'intruder-password-1234',
  })
  assert.ok(owner.ok && intruder.ok)

  // Owner opens a session; the intruder tries to look it up by id.
  await stores.sessions.create({
    pilotId: owner.pilot.id,
    tokenHash: tokenDigest('owner-token'),
    expiresAt: new Date(Date.now() + 3600_000),
  })
  const ownerSession = pool.sessions[0]

  const visibleToOwner = await stores.sessions.findByIdOwnedBy(
    owner.pilot.id,
    ownerSession?.id ?? '',
  )
  const visibleToIntruder = await stores.sessions.findByIdOwnedBy(
    intruder.pilot.id,
    ownerSession?.id ?? '',
  )

  assert.ok(visibleToOwner, 'the owner sees their own record')
  assert.equal(visibleToIntruder, null, 'another pilot sees nothing (404, not 403)')

  // The handler contract maps null to 404 and discloses nothing.
  assert.equal(
    scopedToOwner(visibleToIntruder, () => true),
    null,
  )
})
