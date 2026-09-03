import { test } from 'node:test'
import assert from 'node:assert/strict'

import { McpWeatherClient, mapToolErrorMessage } from './client.js'
import type { MetarResult } from './types.js'

function makeClient(overrides: Record<string, string | undefined> = {}): McpWeatherClient {
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  return new McpWeatherClient({ transport: 'stdio', timeoutMs: 4000 })
}

test('multi-ICAO METAR/TAF/NOTAM succeed with provenance, and an unknown aerodrome yields no-data', async () => {
  process.env.WEATHER_PROVIDER = 'mock'
  process.env.LOG_LEVEL = 'silent'
  const client = makeClient()
  try {
    const metar = await client.getMetar(['LEMD', 'ZZZZ'])
    assert.equal(metar.ok, true)
    if (metar.ok) {
      assert.equal(metar.data.provider, 'mock')
      assert.equal(metar.data.sample, true)
      assert.match(metar.data.caveat, /not for operational use/)
      assert.match(metar.data.entries[0]?.report ?? '', /^LEMD /)
      assert.equal(metar.data.entries[1]?.report, null, 'unknown aerodrome has no report')
    }

    const taf = await client.getTaf(['LEBL'])
    assert.equal(taf.ok, true)
    if (taf.ok) assert.match(taf.data.entries[0]?.report ?? '', /^TAF LEBL/)

    const notams = await client.getNotams(['LEMD'])
    assert.equal(notams.ok, true)
    if (notams.ok) assert.ok(notams.data.entries[0]!.notams.length >= 1)

    const sigmet = await client.getSigmet('LECM')
    assert.equal(sigmet.ok, true)
    if (sigmet.ok) assert.ok(sigmet.data.entries[0]!.sigmets.length >= 1)

    for (const locale of ['es', 'pt', 'en'] as const) {
      const decoded = await client.decodeMetar(
        'LEMD 250600Z 27012KT 9999 SCT025 18/11 Q1016 NOSIG',
        locale,
      )
      assert.equal(decoded.ok, true)
      if (decoded.ok) {
        assert.equal(decoded.data.locale, locale)
        assert.equal(decoded.data.decoded, true)
      }
    }

    const first = await client.getMetar(['LPPT'])
    const second = await client.getMetar(['LPPT'])
    assert.equal(first.ok && first.data.cached, false)
    assert.equal(second.ok && (second.data as MetarResult).cached, true)
  } finally {
    await client.close()
  }
})

test('an exhausted rate ceiling maps to a rate_limit error with a retry indication', async () => {
  const client = makeClient({ MCP_RATE_LIMIT_PER_MINUTE: '1' })
  try {
    const first = await client.getMetar(['LEMD'])
    assert.equal(first.ok, true)
    const second = await client.getMetar(['LEBL'])
    assert.equal(second.ok, false)
    if (!second.ok) {
      assert.equal(second.error.kind, 'rate_limit')
      assert.equal(second.error.provider, 'mock')
      assert.ok((second.error.retryAfterSeconds ?? 0) > 0)
    }
  } finally {
    await client.close()
    delete process.env.MCP_RATE_LIMIT_PER_MINUTE
  }
})

test('a connection that cannot be established maps to a structured error rather than throwing', async () => {
  // Port 0 never accepts a connection (no server binds it): deterministic
  // connection failure, unlike racing wall-clock time against a live server.
  const client = new McpWeatherClient({
    transport: 'http',
    url: 'http://127.0.0.1:0/mcp',
    timeoutMs: 4000,
  })
  try {
    const result = await client.getMetar(['LEMD'])
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.error.kind, 'provider_error')
  } finally {
    await client.close()
  }
})

test('mapToolErrorMessage classifies provider and validation failure text', () => {
  const providerError = mapToolErrorMessage("Provider 'mock' failed: upstream unavailable")
  assert.equal(providerError.kind, 'provider_error')
  assert.equal(providerError.provider, 'mock')

  const validation = mapToolErrorMessage(
    'Invalid arguments for tool get_metar: icao: must be a four-character ICAO location indicator',
  )
  assert.equal(validation.kind, 'validation')

  const timeout = mapToolErrorMessage("Provider 'mock' timed out after 20ms")
  assert.equal(timeout.kind, 'timeout')
  assert.equal(timeout.provider, 'mock')
})
