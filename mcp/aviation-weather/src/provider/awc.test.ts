import { test } from 'node:test'
import assert from 'node:assert/strict'

import { AWC_USER_AGENT, AwcWeatherProvider, toIso } from './awc.js'

type FetchStub = (input: string | URL, init?: RequestInit) => Promise<Response>

function stubFetch(handler: FetchStub): {
  restore: () => void
  calls: Array<{ url: string; init?: RequestInit }>
} {
  const original = globalThis.fetch
  const calls: Array<{ url: string; init?: RequestInit }> = []
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init })
    return handler(input, init)
  }) as typeof fetch
  return { restore: () => (globalThis.fetch = original), calls }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/** 2026-01-01T06:00:00Z as Unix seconds. */
const T0600 = 1767247200
const T0630 = T0600 + 1800

test('awc getMetar batches every indicator into one request and preserves the requested order', async () => {
  const { restore, calls } = stubFetch(async () =>
    json([
      { icaoId: 'LPPT', rawOb: 'LPPT 010630Z 36010KT CAVOK', obsTime: T0630 },
      { icaoId: 'LEMD', rawOb: 'LEMD 010600Z 27012KT 9999', obsTime: T0600 },
    ]),
  )
  try {
    const result = await new AwcWeatherProvider().getMetar(['LEMD', 'LPPT'])
    assert.equal(calls.length, 1, 'one batched request')
    assert.match(calls[0]!.url, /\/api\/data\/metar\?ids=LEMD,LPPT&format=json$/)
    assert.deepEqual(
      result.entries.map((e) => e.icao),
      ['LEMD', 'LPPT'],
    )
    assert.match(result.entries[0]!.report ?? '', /^LEMD /)
    assert.equal(result.entries[0]!.observationTime, '2026-01-01T06:00:00.000Z')
    assert.equal(
      result.issuedAt,
      '2026-01-01T06:30:00.000Z',
      'provenance is the latest observation',
    )
    assert.equal(result.provider, 'awc')
    assert.equal(result.sample, false)
  } finally {
    restore()
  }
})

test('awc getMetar keeps the newest report when a station appears more than once', async () => {
  const { restore } = stubFetch(async () =>
    json([
      { icaoId: 'LEMD', rawOb: 'LEMD OLD', obsTime: T0600 },
      { icaoId: 'LEMD', rawOb: 'LEMD NEW', obsTime: T0630 },
    ]),
  )
  try {
    const result = await new AwcWeatherProvider().getMetar(['LEMD'])
    assert.equal(result.entries[0]!.report, 'LEMD NEW')
  } finally {
    restore()
  }
})

test('awc getTaf maps raw text and an ISO or Unix issue time', async () => {
  const { restore } = stubFetch(async () =>
    json([
      {
        icaoId: 'LEMD',
        rawTAF: 'TAF LEMD 010500Z 0106/0212 27010KT',
        issueTime: '2026-01-01T05:00:00Z',
      },
      { icaoId: 'LPPT', rawTAF: 'TAF LPPT 010500Z 0106/0212 36010KT', issueTime: T0600 },
    ]),
  )
  try {
    const result = await new AwcWeatherProvider().getTaf(['LEMD', 'LPPT'])
    assert.equal(result.entries[0]!.issueTime, '2026-01-01T05:00:00.000Z')
    assert.equal(result.entries[1]!.issueTime, '2026-01-01T06:00:00.000Z')
    assert.equal(result.issuedAt, '2026-01-01T06:00:00.000Z')
  } finally {
    restore()
  }
})

test('awc: an indicator missing from the response is no data, and the others are unaffected', async () => {
  const { restore } = stubFetch(async () =>
    json([{ icaoId: 'LEMD', rawOb: 'LEMD 010600Z', obsTime: T0600 }]),
  )
  try {
    const result = await new AwcWeatherProvider().getMetar(['LEMD', 'ZZZZ'])
    assert.ok(result.entries[0]!.report)
    assert.equal(result.entries[1]!.report, null)
    assert.equal(result.entries[1]!.observationTime, null)
  } finally {
    restore()
  }
})

for (const [label, response] of [
  ['HTTP 204', () => new Response(null, { status: 204 })],
  ['an empty array', () => json([])],
  ['an empty body', () => new Response('', { status: 200 })],
] as const) {
  test(`awc: ${label} is no data for every indicator, with a null issue time`, async () => {
    const { restore } = stubFetch(async () => response())
    try {
      const result = await new AwcWeatherProvider().getMetar(['LEMD', 'LPPT'])
      assert.ok(result.entries.every((e) => e.report === null && e.observationTime === null))
      assert.equal(result.issuedAt, null, 'no report means no issue time — not "now"')
      assert.ok(result.retrievedAt)
    } finally {
      restore()
    }
  })
}

for (const status of [400, 403, 429, 500, 502]) {
  test(`awc: HTTP ${status} throws with no report text, never a substituted result`, async () => {
    const { restore } = stubFetch(
      async () => new Response('LEMD 010600Z SHOULD NOT LEAK', { status }),
    )
    try {
      await assert.rejects(
        () => new AwcWeatherProvider().getMetar(['LEMD']),
        (error: unknown) =>
          error instanceof Error &&
          error.message.includes(String(status)) &&
          !error.message.includes('SHOULD NOT LEAK'),
      )
    } finally {
      restore()
    }
  })
}

test('awc getSigmet matches the exact firId, carries validity, and marks unknown coverage', async () => {
  const { restore, calls } = stubFetch(async () =>
    json([
      {
        firId: 'LECM',
        rawSigmet: 'LECM SIGMET 2 VALID 010600/011000\nLECM MADRID FIR SEV TURB',
        validTimeFrom: T0600,
        validTimeTo: null,
      },
      // Contains "LECM" only inside a longer FIR code — must not match.
      { firId: 'LECMX', rawSigmet: 'LECMX SIGMET 1', validTimeFrom: T0600, validTimeTo: T0630 },
      { firId: 'LPPC', rawSigmet: 'LPPC SIGMET 4', validTimeFrom: T0600, validTimeTo: T0630 },
    ]),
  )
  try {
    const result = await new AwcWeatherProvider().getSigmet(['LECM', 'GCCC'])
    assert.match(calls[0]!.url, /\/api\/data\/isigmet\?format=json$/)
    const lecm = result.entries.find((e) => e.fir === 'LECM')!
    assert.equal(lecm.sigmets.length, 1)
    assert.equal(lecm.sigmets[0]!.header, 'LECM SIGMET 2 VALID 010600/011000')
    assert.equal(lecm.sigmets[0]!.startAt, '2026-01-01T06:00:00.000Z')
    assert.equal(lecm.sigmets[0]!.endAt, null, 'unstated end stays null')
    assert.equal(lecm.coverage, 'unknown')
    const gccc = result.entries.find((e) => e.fir === 'GCCC')!
    assert.deepEqual(gccc.sigmets, [])
    assert.equal(gccc.coverage, 'unknown')
    assert.equal(
      result.issuedAt,
      null,
      'isigmet has no issue time; receipt/validity do not stand in',
    )
  } finally {
    restore()
  }
})

test('awc getNotams is never served by AWC — it rejects rather than returning an empty list', async () => {
  await assert.rejects(() => new AwcWeatherProvider().getNotams(), /NOTAM_PROVIDER/)
})

test('eval: every awc request carries the application User-Agent', async () => {
  const { restore, calls } = stubFetch(async () => json([]))
  try {
    const provider = new AwcWeatherProvider()
    await provider.getMetar(['LEMD'])
    await provider.getTaf(['LEMD'])
    await provider.getSigmet(['LECM'])
    assert.equal(calls.length, 3)
    for (const call of calls) {
      assert.equal(new Headers(call.init?.headers).get('User-Agent'), AWC_USER_AGENT)
    }
  } finally {
    restore()
  }
})

test('eval: awc never emits the current time for an unstated observation, issue, or validity time', async () => {
  const { restore } = stubFetch(async (input) =>
    String(input).includes('/isigmet')
      ? json([
          {
            firId: 'LECM',
            rawSigmet: 'LECM SIGMET 9',
            validTimeFrom: 'garbage',
            validTimeTo: undefined,
          },
        ])
      : json([
          {
            icaoId: 'LEMD',
            rawOb: 'LEMD 010600Z',
            rawTAF: 'TAF LEMD',
            obsTime: null,
            issueTime: 'not-a-date',
          },
        ]),
  )
  try {
    const before = Date.now()
    const provider = new AwcWeatherProvider()
    const metar = await provider.getMetar(['LEMD'])
    const taf = await provider.getTaf(['LEMD'])
    const sigmet = await provider.getSigmet(['LECM'])
    assert.equal(metar.entries[0]!.observationTime, null)
    assert.equal(taf.entries[0]!.issueTime, null)
    assert.equal(sigmet.entries[0]!.sigmets[0]!.startAt, null)
    assert.equal(sigmet.entries[0]!.sigmets[0]!.endAt, null)
    for (const r of [metar, taf, sigmet]) {
      assert.equal(r.issuedAt, null)
      assert.ok(Date.parse(r.retrievedAt) >= before - 1000, 'only the retrieval time is "now"')
    }
  } finally {
    restore()
  }
})

test('toIso converts Unix seconds and ISO strings, and returns null for missing or unparseable values', () => {
  assert.equal(toIso(T0600), '2026-01-01T06:00:00.000Z')
  assert.equal(toIso('2026-01-01T06:00:00Z'), '2026-01-01T06:00:00.000Z')
  for (const v of [null, undefined, '', 'garbage', Number.NaN]) assert.equal(toIso(v), null)
})
