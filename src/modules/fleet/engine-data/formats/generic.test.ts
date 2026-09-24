import { test } from 'node:test'
import assert from 'node:assert/strict'

import { detectFormat } from './index.js'
import { genericFormat } from './generic.js'

test('detects and maps a four-cylinder CHT/EGT export', () => {
  const headers = [
    'Time',
    'CHT1',
    'CHT2',
    'CHT3',
    'CHT4',
    'EGT1',
    'EGT2',
    'EGT3',
    'EGT4',
    'OILT',
    'OILP',
  ]
  const format = detectFormat(headers)
  assert.equal(format?.id, 'generic')

  const result = genericFormat.mapChannels(headers)
  assert.equal(result.timeColumnIndex, 0)
  assert.equal(result.channels.length, 10)
  const cht1 = result.channels.find((c) => c.channel.key === 'cht1')
  assert.equal(cht1?.channel.cylinder, 1)
  assert.equal(cht1?.channel.unit, '°F')
  const oilTemp = result.channels.find((c) => c.channel.key === 'oil_temp')
  assert.equal(oilTemp?.channel.cylinder, null)
})

test('extracts an explicit unit from the header', () => {
  const result = genericFormat.mapChannels(['Time', 'CHT1(C)'])
  const cht1 = result.channels.find((c) => c.channel.key === 'cht1')
  assert.equal(cht1?.channel.unit, 'C')
})

test('an unrecognized column is reported as ignored, not fatal', () => {
  const result = genericFormat.mapChannels(['Time', 'CHT1', 'Waypoint'])
  assert.deepEqual(result.ignoredColumns, ['Waypoint'])
  assert.equal(result.channels.length, 1)
})

test('no recognizable channel: detector does not claim the file', () => {
  const format = detectFormat(['Time', 'Waypoint', 'Notes'])
  assert.equal(format, null)
})
