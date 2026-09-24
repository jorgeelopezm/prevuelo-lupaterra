import { test } from 'node:test'
import assert from 'node:assert/strict'

import { isConfirmedEmpty } from './coverage.js'

test('an empty list with complete coverage is a confirmed "none in force"', () => {
  assert.equal(isConfirmedEmpty([], 'complete'), true)
})

test('an empty list with unknown coverage is not a confirmed empty', () => {
  assert.equal(isConfirmedEmpty([], 'unknown'), false)
})

test('an empty list with absent coverage (older MCP build or cached result) is not a confirmed empty', () => {
  assert.equal(isConfirmedEmpty([], undefined), false)
})

test('a non-empty list is never a confirmed empty, whatever its coverage', () => {
  assert.equal(isConfirmedEmpty([{}], 'complete'), false)
  assert.equal(isConfirmedEmpty([{}], 'unknown'), false)
})
