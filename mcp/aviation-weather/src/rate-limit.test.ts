import { test } from 'node:test'
import assert from 'node:assert/strict'

import { RateLimiter, RateLimitError } from './rate-limit.js'

test('calls within the ceiling are allowed', () => {
  const limiter = new RateLimiter(2)
  limiter.acquire('mock')
  limiter.acquire('mock')
})

test('calls beyond the ceiling are rejected with a retry indication', () => {
  const limiter = new RateLimiter(1)
  limiter.acquire('mock')
  assert.throws(
    () => limiter.acquire('mock'),
    (error: unknown) => {
      assert.ok(error instanceof RateLimitError)
      assert.equal(error.provider, 'mock')
      assert.ok(error.retryAfterSeconds >= 1, 'carries a retry-after indication')
      assert.match(error.message, /Rate limit exceeded for provider 'mock'/)
      return true
    },
  )
})

test('rate ceilings are tracked per provider, not globally', () => {
  const limiter = new RateLimiter(1)
  limiter.acquire('mock')
  assert.doesNotThrow(() => limiter.acquire('aemet'), 'a separate provider has its own window')
})

test('the window slides: an older call no longer counts', async () => {
  const limiter = new RateLimiter(1, 50)
  limiter.acquire('mock')
  assert.throws(() => limiter.acquire('mock'))
  await new Promise((resolve) => setTimeout(resolve, 65))
  assert.doesNotThrow(() => limiter.acquire('mock'), 'window has slid past the first call')
})
