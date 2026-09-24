import { test } from 'node:test'
import assert from 'node:assert/strict'

import { AvwxWeatherProvider } from './avwx.js'

type FetchStub = (input: string | URL, init?: RequestInit) => Promise<Response>

function stubFetch(handler: FetchStub): () => void {
  const original = globalThis.fetch
  globalThis.fetch = handler as typeof fetch
  return () => {
    globalThis.fetch = original
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

test('getMetar issues one request per station (AVWX single-station endpoint) and preserves requested order', async () => {
  const calls: string[] = []
  const restore = stubFetch(async (input) => {
    const url = String(input)
    calls.push(url)
    const icao = /\/metar\/([A-Z0-9]+)\?/.exec(url)?.[1]
    return jsonResponse({
      raw: `${icao} 010000Z 00000KT 9999 NOSIG`,
      station: icao,
      time: { repr: '010000Z', dt: '2026-01-01T00:00:00Z' },
    })
  })
  try {
    const provider = new AvwxWeatherProvider({ apiToken: 'test-token' })
    const icaos = ['SUMU', 'LEMD', 'KJFK']
    const result = await provider.getMetar(icaos)

    assert.equal(calls.length, 3, 'one request per station, not a batched call')
    assert.ok(calls.every((c) => c.includes('/metar/') && !c.includes('/multi/')))

    assert.deepEqual(
      result.entries.map((e) => e.icao),
      icaos,
      'entries preserve the requested order',
    )
    assert.match(result.entries[0]!.report ?? '', /^SUMU /)
    assert.equal(result.provider, 'avwx')
    assert.equal(result.sample, false)
    assert.equal(result.cached, false)
    assert.equal(result.caveat, '')
  } finally {
    restore()
  }
})

test('getMetar treats AVWX 400 (unresolvable station code) as no data, not a fabricated value or a failure', async () => {
  const restore = stubFetch(async (input) => {
    const url = String(input)
    if (url.includes('/metar/SUMU')) {
      return jsonResponse({
        raw: 'SUMU 010000Z 09010KT 9999 SCT020 20/15 Q1013',
        station: 'SUMU',
        time: { repr: '010000Z', dt: '2026-01-01T00:00:00Z' },
      })
    }
    return jsonResponse({ error: 'ZZZZ is not a valid ICAO, IATA, or GPS code' }, 400)
  })
  try {
    const provider = new AvwxWeatherProvider({ apiToken: 'test-token' })
    const result = await provider.getMetar(['SUMU', 'ZZZZ'])
    assert.match(result.entries[0]!.report ?? '', /^SUMU /)
    assert.equal(result.entries[1]!.report, null)
    assert.equal(result.entries[1]!.observationTime, null)
  } finally {
    restore()
  }
})

test('getTaf maps raw text and issue time from the AVWX single-station taf response', async () => {
  const restore = stubFetch(async () =>
    jsonResponse({
      raw: 'TAF SUMU 010000Z 0100/0206 09010KT 9999 SCT020',
      station: 'SUMU',
      time: { repr: '010000Z', dt: '2026-01-01T00:00:00Z' },
    }),
  )
  try {
    const provider = new AvwxWeatherProvider({ apiToken: 'test-token' })
    const result = await provider.getTaf(['SUMU'])
    assert.match(result.entries[0]!.report ?? '', /^TAF SUMU/)
    assert.equal(result.entries[0]!.issueTime, '2026-01-01T00:00:00Z')
  } finally {
    restore()
  }
})

test('getNotams issues one request per ICAO and maps id/text/validity', async () => {
  const calls: string[] = []
  const restore = stubFetch(async (input) => {
    const url = String(input)
    calls.push(url)
    if (url.includes('/notam/SUMU')) {
      return jsonResponse({
        data: [
          {
            raw: 'A0001/26 NOTAMN RWY 02/20 CLSD',
            body: 'RWY 02/20 CLSD',
            number: 'A0001/26',
            start_time: { repr: 'x', dt: '2026-01-01T00:00:00Z' },
            end_time: { repr: 'x', dt: '2026-01-02T00:00:00Z' },
          },
        ],
      })
    }
    return jsonResponse({ data: [] })
  })
  try {
    const provider = new AvwxWeatherProvider({ apiToken: 'test-token' })
    const result = await provider.getNotams(['SUMU', 'ZZZZ'])
    assert.equal(calls.length, 2, 'one request per requested ICAO')
    assert.equal(result.entries[0]!.notams[0]!.id, 'A0001/26')
    assert.equal(result.entries[0]!.notams[0]!.text, 'RWY 02/20 CLSD')
    assert.equal(result.entries[0]!.notams[0]!.startAt, '2026-01-01T00:00:00Z')
    assert.equal(
      result.entries[1]!.notams.length,
      0,
      'no NOTAMs returned is an empty list, not an error',
    )
  } finally {
    restore()
  }
})

test('getNotams marks every report unknown coverage, empty or not — AVWX never asserts completeness', async () => {
  const restore = stubFetch(async (input) =>
    String(input).includes('/notam/LEMD')
      ? jsonResponse({
          data: [
            { raw: 'A1/26', body: 'TWY A CLSD', number: 'A1/26', start_time: null, end_time: null },
          ],
        })
      : jsonResponse({ data: [] }),
  )
  try {
    const result = await new AvwxWeatherProvider({ apiToken: 'test-token' }).getNotams([
      'LEMD',
      'LPPT',
    ])
    assert.equal(result.entries[0]!.notams.length, 1)
    assert.equal(result.entries[0]!.coverage, 'unknown')
    assert.equal(result.entries[1]!.notams.length, 0)
    assert.equal(
      result.entries[1]!.coverage,
      'unknown',
      'an empty AVWX list is not "none in force"',
    )
  } finally {
    restore()
  }
})

test('getNotams returns null validity when AVWX omits it, never a substituted time', async () => {
  const restore = stubFetch(async () =>
    jsonResponse({
      data: [
        {
          raw: 'A1/26',
          body: 'no end',
          number: 'A1/26',
          start_time: { repr: 'x', dt: '2026-01-01T00:00:00Z' },
          end_time: null,
        },
        {
          raw: 'A2/26',
          body: 'PERM',
          number: 'A2/26',
          start_time: null,
          end_time: { repr: 'PERM', dt: null },
        },
      ],
    }),
  )
  try {
    const [noEnd, perm] = (
      await new AvwxWeatherProvider({ apiToken: 'test-token' }).getNotams(['LEMD'])
    ).entries[0]!.notams
    assert.equal(noEnd!.startAt, '2026-01-01T00:00:00Z', 'a stated start is carried unchanged')
    assert.equal(noEnd!.endAt, null, 'omitted end of validity is null')
    assert.equal(perm!.startAt, null, 'omitted start of validity is null')
    assert.equal(perm!.endAt, null, 'a non-date marker with no dt is null, not "now"')
  } finally {
    restore()
  }
})

test('getSigmet returns null validity when AVWX omits it — the issue time is not substituted as the start', async () => {
  const restore = stubFetch(async () =>
    jsonResponse({
      reports: [
        {
          raw: 'LECM SIGMET 5 VALID 010600/011200\nLECM MADRID FIR SEV TURB',
          time: { repr: 'x', dt: '2026-01-01T05:00:00Z' },
          start_time: null,
          end_time: null,
        },
      ],
    }),
  )
  try {
    const result = await new AvwxWeatherProvider({ apiToken: 'test-token' }).getSigmet([
      'LECM',
      'LPPC',
    ])
    const lecm = result.entries.find((e) => e.fir === 'LECM')!
    assert.equal(lecm.sigmets[0]!.startAt, null, 'issue time is not a start of validity')
    assert.equal(lecm.sigmets[0]!.endAt, null)
    assert.equal(lecm.coverage, 'unknown')
    const lppc = result.entries.find((e) => e.fir === 'LPPC')!
    assert.equal(lppc.sigmets.length, 0)
    assert.equal(lppc.coverage, 'unknown', 'no FIR match is not "none in force"')
  } finally {
    restore()
  }
})

test('getSigmet matches the requested FIR as a whole token in the global advisory list, not a substring', async () => {
  const restore = stubFetch(async () =>
    jsonResponse({
      reports: [
        {
          raw: 'LECM SIGMET 3 VALID 010600/011200\nLECM MADRID FIR EMBD TS OBS AT 0520Z',
          time: { repr: 'x', dt: '2026-01-01T05:00:00Z' },
          start_time: { repr: 'x', dt: '2026-01-01T06:00:00Z' },
          end_time: { repr: 'x', dt: '2026-01-01T12:00:00Z' },
        },
        {
          // Contains "LECM" only as a substring of a longer token — must not match.
          raw: 'XLECMX SIGMET 1 VALID 010600/011200\nUNRELATED FIR TEXT',
          time: { repr: 'x', dt: '2026-01-01T05:00:00Z' },
          start_time: null,
          end_time: null,
        },
      ],
    }),
  )
  try {
    const provider = new AvwxWeatherProvider({ apiToken: 'test-token' })
    const result = await provider.getSigmet(['LECM', 'ZZZZ'])
    const lecm = result.entries.find((e) => e.fir === 'LECM')!
    assert.equal(
      lecm.sigmets.length,
      1,
      'matches the advisory that leads with the FIR as its own token',
    )
    assert.equal(lecm.sigmets[0]!.header, 'LECM SIGMET 3 VALID 010600/011200')
    assert.equal(
      lecm.sigmets[0]!.startAt,
      '2026-01-01T06:00:00Z',
      'stated validity carried unchanged',
    )
    assert.equal(lecm.sigmets[0]!.endAt, '2026-01-01T12:00:00Z')
    const zzzz = result.entries.find((e) => e.fir === 'ZZZZ')!
    assert.equal(zzzz.sigmets.length, 0, 'no match renders as empty, not fabricated content')
  } finally {
    restore()
  }
})

test('a non-2xx AVWX response throws rather than returning fabricated data', async () => {
  const restore = stubFetch(async () => jsonResponse({ error: 'unauthorized' }, 401))
  try {
    const provider = new AvwxWeatherProvider({ apiToken: 'bad-token' })
    await assert.rejects(() => provider.getMetar(['SUMU']), /AVWX request failed: 401/)
  } finally {
    restore()
  }
})

test("a plan-gated AVWX response surfaces AVWX's own explanation in the thrown error", async () => {
  const restore = stubFetch(async () =>
    jsonResponse(
      {
        meta: {
          validation_error:
            'Your auth token is not allowed to access this resource. Plan "free" must be enterprise.',
        },
      },
      403,
    ),
  )
  try {
    const provider = new AvwxWeatherProvider({ apiToken: 'free-tier-token' })
    await assert.rejects(() => provider.getNotams(['SUMU']), /Plan "free" must be enterprise/)
  } finally {
    restore()
  }
})

test('a request exceeding the abort timeout rejects rather than hanging indefinitely', async () => {
  const restore = stubFetch(
    (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
      }),
  )
  try {
    const provider = new AvwxWeatherProvider({ apiToken: 'test-token', timeoutMs: 5 })
    await assert.rejects(() => provider.getMetar(['SUMU']))
  } finally {
    restore()
  }
})

test('getMetar provenance issuedAt is the latest observation across stations, not the first', async () => {
  const times: Record<string, string> = {
    LEMD: '2026-01-01T00:00:00Z',
    LEBL: '2026-01-01T00:30:00Z',
    LPPT: '2026-01-01T00:10:00Z',
  }
  const restore = stubFetch(async (input) => {
    const icao = /\/metar\/([A-Z0-9]+)\?/.exec(String(input))?.[1] ?? ''
    return jsonResponse({
      raw: `${icao} 010000Z 00000KT`,
      station: icao,
      time: { repr: 'x', dt: times[icao] },
    })
  })
  try {
    const result = await new AvwxWeatherProvider({ apiToken: 'test-token' }).getMetar([
      'LEMD',
      'LEBL',
      'LPPT',
    ])
    assert.equal(result.issuedAt, '2026-01-01T00:30:00Z')
  } finally {
    restore()
  }
})

test('getMetar provenance issuedAt is null when no station returned a report, never the retrieval time', async () => {
  const restore = stubFetch(async () =>
    jsonResponse({ error: 'ZZZZ is not a valid ICAO, IATA, or GPS code' }, 400),
  )
  try {
    const result = await new AvwxWeatherProvider({ apiToken: 'test-token' }).getMetar(['ZZZZ'])
    assert.equal(result.entries[0]!.report, null)
    assert.equal(result.issuedAt, null, 'no report means no issue time to state')
    assert.ok(result.retrievedAt, 'the retrieval time is still stated')
  } finally {
    restore()
  }
})

test('getTaf provenance issuedAt is null when no station returned a report', async () => {
  const restore = stubFetch(async () =>
    jsonResponse({ error: 'ZZZZ is not a valid ICAO, IATA, or GPS code' }, 400),
  )
  try {
    const result = await new AvwxWeatherProvider({ apiToken: 'test-token' }).getTaf(['ZZZZ'])
    assert.equal(result.issuedAt, null)
  } finally {
    restore()
  }
})

test('getNotams provenance issuedAt is null — AVWX NOTAMs carry no issue time, and "now" is not substituted', async () => {
  const restore = stubFetch(async () => jsonResponse({ data: [] }))
  try {
    const result = await new AvwxWeatherProvider({ apiToken: 'test-token' }).getNotams(['LEMD'])
    assert.equal(result.issuedAt, null)
  } finally {
    restore()
  }
})

test('getSigmet provenance issuedAt is the latest matched advisory issue time, or null when none matched', async () => {
  const restore = stubFetch(async () =>
    jsonResponse({
      reports: [
        {
          raw: 'LECM SIGMET 1 VALID 010600/011200\nA',
          time: { repr: 'x', dt: '2026-01-01T05:00:00Z' },
          start_time: null,
          end_time: null,
        },
        {
          raw: 'LECM SIGMET 2 VALID 010700/011300\nB',
          time: { repr: 'x', dt: '2026-01-01T06:30:00Z' },
          start_time: null,
          end_time: null,
        },
        {
          raw: 'KZNY SIGMET X VALID 010800/011400\nC',
          time: { repr: 'x', dt: '2026-01-01T09:00:00Z' },
          start_time: null,
          end_time: null,
        },
      ],
    }),
  )
  try {
    const provider = new AvwxWeatherProvider({ apiToken: 'test-token' })
    const lecm = await provider.getSigmet(['LECM'])
    assert.equal(
      lecm.issuedAt,
      '2026-01-01T06:30:00Z',
      'latest matched, ignoring the unmatched KZNY advisory',
    )
    const lppc = await provider.getSigmet(['LPPC'])
    assert.equal(lppc.issuedAt, null, 'no matched advisory means no issue time')
  } finally {
    restore()
  }
})
