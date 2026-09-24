import { test } from 'node:test'
import assert from 'node:assert/strict'

import { createMockWeatherProvider } from './mock.js'
import { SAMPLE_CAVEAT } from './mock.js'
import type { WeatherProvider } from './types.js'

const provider: WeatherProvider = createMockWeatherProvider()

test('mock covers the representative Iberian aerodromes and FIRs', async () => {
  const metar = await provider.getMetar(['LEMD', 'LEBL', 'LPPT', 'LPPR'])
  assert.equal(metar.entries.length, 4)
  for (const entry of metar.entries) {
    assert.ok(entry.report, `METAR present for ${entry.icao}`)
    assert.ok(entry.observationTime, `observation time present for ${entry.icao}`)
  }

  const taf = await provider.getTaf(['LEMD', 'LEBL', 'LPPT', 'LPPR'])
  assert.equal(taf.entries.length, 4)
  for (const entry of taf.entries) {
    assert.ok(entry.report, `TAF present for ${entry.icao}`)
    assert.ok(entry.issueTime, `issue time present for ${entry.icao}`)
  }

  const sigmet = await provider.getSigmet(['LECM', 'LECB', 'LPPC'])
  assert.equal(sigmet.entries.length, 3)
  assert.ok(
    sigmet.entries.every((e) => e.sigmets.length >= 1),
    'each FIR has a SIGMET',
  )

  const notams = await provider.getNotams(['LEMD', 'LEBL'])
  assert.ok(notams.entries[0]?.notams.length === 2, 'LEMD has two NOTAMs')
  assert.ok(notams.entries[1]?.notams.length === 1, 'LEBL has one NOTAM')
})

test('every mock result is marked as sample data with the caveat', async () => {
  for (const result of [
    await provider.getMetar(['LEMD']),
    await provider.getTaf(['LEMD']),
    await provider.getNotams(['LEMD']),
    await provider.getSigmet(['LECM']),
  ]) {
    assert.equal(result.sample, true)
    assert.equal(result.caveat, SAMPLE_CAVEAT)
  }
})

test('provenance fields are present on every data result', async () => {
  for (const result of [
    await provider.getMetar(['LEMD']),
    await provider.getTaf(['LEMD']),
    await provider.getNotams(['LEMD']),
    await provider.getSigmet(['LECM']),
  ]) {
    assert.equal(result.provider, 'mock')
    assert.equal(typeof result.issuedAt, 'string')
    assert.ok(!Number.isNaN(Date.parse(result.issuedAt)))
    assert.equal(typeof result.retrievedAt, 'string')
    assert.ok(!Number.isNaN(Date.parse(result.retrievedAt)))
    assert.equal(result.cached, false)
    assert.equal(result.cacheAgeSeconds, 0)
  }
})

test('an unknown aerodrome yields a per-indicator no-data entry, not a failure', async () => {
  const metar = await provider.getMetar(['LEMD', 'XXXX'])
  assert.equal(metar.entries.length, 2)
  assert.ok(metar.entries[0]?.report, 'known aerodrome still returns its report')
  assert.equal(metar.entries[1]?.report, null)
  assert.equal(metar.entries[1]?.observationTime, null)

  const notams = await provider.getNotams(['XXXX', 'LEMD'])
  assert.deepEqual(notams.entries[0]?.notams, [], 'unknown aerodrome has no NOTAMs')
  const lemdNotams = notams.entries[1]?.notams
  assert.ok((lemdNotams?.length ?? 0) >= 1, 'known aerodrome keeps its NOTAMs')

  const sigmet = await provider.getSigmet(['XXXX'])
  assert.deepEqual(sigmet.entries[0]?.sigmets, [], 'unknown FIR has no SIGMETs')
})

test('mock seeded aerodromes report complete NOTAM coverage, including a seeded empty list', async () => {
  const notams = await provider.getNotams(['LEMD', 'LPPT'])
  assert.equal(notams.entries[0]?.coverage, 'complete')
  assert.deepEqual(notams.entries[1]?.notams, [], 'LPPT is seeded with no NOTAMs')
  assert.equal(
    notams.entries[1]?.coverage,
    'complete',
    'a seeded empty list is a confirmed "none in force"',
  )
})

test('mock unseeded aerodrome reports an empty list with unknown coverage, not "none in force"', async () => {
  const notams = await provider.getNotams(['SUMU'])
  assert.deepEqual(notams.entries[0]?.notams, [])
  assert.equal(notams.entries[0]?.coverage, 'unknown')
})

test('mock seeded FIR reports complete SIGMET coverage; an unseeded FIR reports unknown', async () => {
  const sigmet = await provider.getSigmet(['LECM', 'XXXX'])
  assert.equal(sigmet.entries[0]?.coverage, 'complete')
  assert.equal(sigmet.entries[1]?.coverage, 'unknown')
})
