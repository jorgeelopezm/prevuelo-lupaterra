import { test } from 'node:test'
import assert from 'node:assert/strict'

import { formatDate, formatNumber, formatUtc, formatUtcDateTime } from './format.js'

const atNoonUtc = new Date('2026-07-22T10:30:00.000Z')

test('operational times render in UTC with an explicit Z suffix', () => {
  assert.match(formatUtc(atNoonUtc, 'es'), /Z$/)
  assert.match(formatUtc(atNoonUtc, 'en'), /Z$/)
  assert.match(formatUtc(atNoonUtc, 'en'), /10:30/)
  assert.match(formatUtc(atNoonUtc, 'pt'), /Z$/)
  assert.match(formatUtcDateTime(atNoonUtc, 'en'), /Z$/)
})

test('date formatting differs by locale conventions', () => {
  const es = formatDate(atNoonUtc, 'es')
  const en = formatDate(atNoonUtc, 'en')
  assert.notEqual(es, en)
  assert.match(en, /Jul/)
  assert.match(en, /2026/)
})

test('numbers format with the active locale conventions', () => {
  const es = formatNumber(12345.6, 'es')
  const en = formatNumber(12345.6, 'en')
  assert.equal(typeof es, 'string')
  assert.equal(typeof en, 'string')
  assert.notEqual(es, en)
})
