import { test } from 'node:test'
import assert from 'node:assert/strict'

import { createCsrfToken, verifyCsrfToken } from './csrf.js'

const SECRET = 's'.repeat(48)

test('a token verifies only for the session it was bound to', () => {
  const token = createCsrfToken(SECRET, 'session-1')
  assert.ok(verifyCsrfToken(SECRET, 'session-1', token))
  assert.ok(!verifyCsrfToken(SECRET, 'session-2', token), 'other session must not verify')
  assert.ok(!verifyCsrfToken('different-secret', 'session-1', token))
})

test('absent, malformed, and empty tokens are rejected', () => {
  const token = createCsrfToken(SECRET, 'session-1')
  assert.ok(!verifyCsrfToken(SECRET, 'session-1', ''))
  assert.ok(!verifyCsrfToken(SECRET, 'session-1', 'too-short'))
  assert.ok(!verifyCsrfToken(SECRET, 'session-1', token + 'x'))
})
