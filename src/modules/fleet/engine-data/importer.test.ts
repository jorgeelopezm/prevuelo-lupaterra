import { test } from 'node:test'
import assert from 'node:assert/strict'

import { importEngineData } from './importer.js'

const SAMPLE_CSV =
  'Time,CHT1,CHT2,EGT1,EGT2,OILT,OILP\n' +
  '0,355,362,1340,1358,192,74\n' +
  '1,356,363,1341,1359,192,74\n' +
  '2,357,364,1345,1362,193,73\n'

test('a well-formed CSV import succeeds with provenance and channels', () => {
  const result = importEngineData(Buffer.from(SAMPLE_CSV), 'flight1.csv')
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.data.originalFilename, 'flight1.csv')
  assert.equal(result.data.detectedFormat, 'generic')
  assert.equal(result.data.channels.length, 6)
  assert.equal(result.data.series.t.length, 3)
  assert.deepEqual(result.data.series.values.cht1, [355, 356, 357])
  assert.ok(result.data.contentDigest.length === 64, 'sha-256 hex digest')
})

test('an empty file is rejected', () => {
  const result = importEngineData(Buffer.from(''), 'empty.csv')
  assert.deepEqual(result, { ok: false, reason: 'empty' })
})

test('a malformed CSV (ragged row) is rejected', () => {
  const malformed = 'Time,CHT1\n0,355\n1\n'
  const result = importEngineData(Buffer.from(malformed), 'bad.csv')
  assert.deepEqual(result, { ok: false, reason: 'malformed' })
})

test('a file with no recognizable channel is rejected', () => {
  const noChannels = 'Time,Waypoint,Notes\n0,LEMD,ok\n'
  const result = importEngineData(Buffer.from(noChannels), 'nochannel.csv')
  assert.deepEqual(result, { ok: false, reason: 'unsupported_format' })
})

test('an unrecognized column is ignored, not fatal', () => {
  const withExtra = 'Time,CHT1,Waypoint\n0,355,LEMD\n1,356,LEBL\n'
  const result = importEngineData(Buffer.from(withExtra), 'extra.csv')
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.deepEqual(result.data.ignoredColumns, ['Waypoint'])
})

test('units are preserved verbatim, never converted', () => {
  const celsius = 'Time,CHT1(C)\n0,180\n1,181\n'
  const result = importEngineData(Buffer.from(celsius), 'celsius.csv')
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.data.channels[0]?.unit, 'C')
  assert.deepEqual(result.data.series.values.cht1, [180, 181])
})

test('a long file is downsampled to a bounded number of points, not truncated to the start', () => {
  const header = 'Time,CHT1\n'
  const rows = Array.from({ length: 5000 }, (_, i) => `${i},${300 + (i % 50)}`).join('\n')
  const result = importEngineData(Buffer.from(header + rows), 'long.csv')
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.ok(result.data.series.t.length <= 2000)
  const lastTime = result.data.series.t[result.data.series.t.length - 1] as number
  assert.ok(lastTime > 4000, 'series spans the whole file, not just its start')
})
