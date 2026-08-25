import { test } from 'node:test'
import assert from 'node:assert/strict'

import { SlidingWindowRateLimiter } from './rate-limit.js'

test('allows attempts up to the limit and rejects beyond it within the window', () => {
  const limiter = new SlidingWindowRateLimiter({ limit: 3, windowMs: 60_000 })
  assert.ok(limiter.tryAcquire('login:user@example.com'))
  assert.ok(limiter.tryAcquire('login:user@example.com'))
  assert.ok(limiter.tryAcquire('login:user@example.com'))
  assert.equal(limiter.tryAcquire('login:user@example.com'), false)
  assert.equal(
    limiter.count('login:user@example.com'),
    3,
    'rejected attempts are not counted again',
  )
})

test('different keys (account vs source) are independent', () => {
  const limiter = new SlidingWindowRateLimiter({ limit: 1, windowMs: 60_000 })
  assert.ok(limiter.tryAcquire('login:pilot@example.com'))
  assert.ok(!limiter.tryAcquire('login:pilot@example.com'))
  assert.ok(limiter.tryAcquire('login:ip:1.2.3.4'), 'a different source key is unaffected')
})

test('a successful sign-in resets the account window', () => {
  const limiter = new SlidingWindowRateLimiter({ limit: 2, windowMs: 60_000 })
  limiter.tryAcquire('login:pilot@example.com')
  limiter.tryAcquire('login:pilot@example.com')
  limiter.reset('login:pilot@example.com')
  assert.equal(limiter.count('login:pilot@example.com'), 0)
  assert.ok(limiter.tryAcquire('login:pilot@example.com'))
})
