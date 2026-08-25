import { test } from 'node:test'
import assert from 'node:assert/strict'

import { ResponseCache } from './cache.js'

test('a fresh entry is served within the TTL with its age', () => {
  const cache = new ResponseCache(60_000)
  cache.set('k', { provider: 'mock' })
  const hit = cache.get<{ provider: string }>('k')
  assert.ok(hit)
  assert.equal(hit.value.provider, 'mock')
  assert.equal(hit.ageSeconds, 0)
})

test('an entry older than the TTL is a miss', async () => {
  const cache = new ResponseCache(10)
  cache.set('k', { provider: 'mock' })
  await new Promise((resolve) => setTimeout(resolve, 25))
  assert.equal(cache.get('k'), null)
})

test('a zero TTL disables caching entirely', () => {
  const cache = new ResponseCache(0)
  cache.set('k', { provider: 'mock' })
  assert.equal(cache.get('k'), null)
})

test('missing keys are misses', () => {
  const cache = new ResponseCache(60_000)
  assert.equal(cache.get('nope'), null)
})
