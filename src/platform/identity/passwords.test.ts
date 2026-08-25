import { test } from 'node:test'
import assert from 'node:assert/strict'

import { hashPassword, verifyPassword } from './passwords.js'

test('hash produces an Argon2id verifier and verifies correctly', async () => {
  const hash = await hashPassword('piloto-dev-1234')
  assert.ok(hash.startsWith('$argon2id$'))
  assert.ok(await verifyPassword(hash, 'piloto-dev-1234'))
  assert.ok(!(await verifyPassword(hash, 'wrong-password')))
})

test('no plaintext password appears in the stored verifier', async () => {
  const password = 'correct horse battery staple'
  const hash = await hashPassword(password)
  assert.ok(!hash.includes(password))
  // The verifier carries only derived material.
  assert.match(hash, /^\$argon2id\$/)
})

test('a malformed verifier is treated as a non-match, not an error', async () => {
  assert.equal(await verifyPassword('not-a-valid-verifier', 'anything'), false)
})
