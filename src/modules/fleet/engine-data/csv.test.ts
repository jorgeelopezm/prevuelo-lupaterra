import { test } from 'node:test'
import assert from 'node:assert/strict'

import { parseCsv } from './csv.js'

test('parses a simple CSV with headers and rows', () => {
  const result = parseCsv('Time,CHT1,EGT1\n0,355,1340\n1,356,1342\n')
  assert.deepEqual(result?.headers, ['Time', 'CHT1', 'EGT1'])
  assert.equal(result?.rows.length, 2)
  assert.deepEqual(result?.rows[0], ['0', '355', '1340'])
})

test('handles CRLF line endings', () => {
  const result = parseCsv('Time,CHT1\r\n0,355\r\n1,356\r\n')
  assert.equal(result?.rows.length, 2)
})

test('handles quoted fields with embedded commas and escaped quotes', () => {
  const result = parseCsv('Time,Note\n0,"hello, ""world"""\n')
  assert.deepEqual(result?.rows[0], ['0', 'hello, "world"'])
})

test('skips blank lines', () => {
  const result = parseCsv('Time,CHT1\n0,355\n\n1,356\n')
  assert.equal(result?.rows.length, 2)
})

test('a ragged row (wrong column count) fails the whole parse', () => {
  const result = parseCsv('Time,CHT1,EGT1\n0,355,1340\n1,356\n')
  assert.equal(result, null)
})

test('an unterminated quote fails the parse', () => {
  const result = parseCsv('Time,Note\n0,"unterminated\n')
  assert.equal(result, null)
})

test('an empty string is malformed', () => {
  const result = parseCsv('')
  assert.equal(result, null)
})
