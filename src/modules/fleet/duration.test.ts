import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  formatMinutesAsDecimalHours,
  formatMinutesAsHoursMinutes,
  parseDurationToMinutes,
} from './duration.js'

test('parses decimal hours to minutes', () => {
  assert.equal(parseDurationToMinutes('0.9'), 54)
  assert.equal(parseDurationToMinutes('1'), 60)
  assert.equal(parseDurationToMinutes('2.5'), 150)
})

test('parses h:mm to minutes', () => {
  assert.equal(parseDurationToMinutes('0:54'), 54)
  assert.equal(parseDurationToMinutes('1:30'), 90)
  assert.equal(parseDurationToMinutes('10:05'), 605)
})

test('round trip: decimal hours -> minutes -> decimal hours', () => {
  const minutes = parseDurationToMinutes('0.9')
  assert.equal(minutes, 54)
  assert.equal(formatMinutesAsDecimalHours(minutes as number), '0.9')
})

test('round trip: h:mm -> minutes -> h:mm', () => {
  const minutes = parseDurationToMinutes('1:30')
  assert.equal(minutes, 90)
  assert.equal(formatMinutesAsHoursMinutes(minutes as number), '1:30')
})

test('rejects negative input', () => {
  assert.equal(parseDurationToMinutes('-1'), null)
})

test('rejects non-numeric input', () => {
  assert.equal(parseDurationToMinutes('abc'), null)
  assert.equal(parseDurationToMinutes(''), null)
  assert.equal(parseDurationToMinutes('1:60'), null)
})
