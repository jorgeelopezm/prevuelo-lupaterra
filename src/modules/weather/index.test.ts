import { test } from 'node:test'
import assert from 'node:assert/strict'

import type { FastifyInstance } from 'fastify'

import { buildApp } from '../../server/app.js'
import { loadConfig } from '../../server/config.js'
import { FakePoolFacade } from '../../platform/db/fake-pool.js'
import { createTestSession } from '../../server/auth/test-session.js'
import { createTranslator } from '../../platform/i18n/catalog.js'
import { formatUtcDateTime } from '../../platform/i18n/format.js'
import { SUPPORTED_LOCALES } from '../../platform/i18n/locale.js'
import { destinationPath } from '../../platform/i18n/segments.js'
import type {
  NotamReport,
  SigmetReport,
  WeatherMcpClient,
  WeatherMcpResult,
} from '../../platform/weather-mcp/types.js'

function makeConfig() {
  return loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgres://localhost/ga',
    SESSION_SECRET: 's'.repeat(48),
  })
}

function provenance(sample = false) {
  return {
    provider: 'stubprov',
    issuedAt: '2026-08-25T05:00:00Z',
    retrievedAt: '2026-08-25T05:01:00Z',
    cached: false,
    cacheAgeSeconds: 0,
    sample,
    caveat: sample ? 'sample data' : '',
  }
}

/** METAR/TAF resolve as "no data" so only the NOTAM/SIGMET sections vary. */
function stubMcp(opts: {
  notams?: NotamReport[]
  sigmets?: SigmetReport[]
  sample?: boolean
}): WeatherMcpClient {
  const ok = <T>(data: T): WeatherMcpResult<T> => ({ ok: true, data })
  const p = provenance(opts.sample)
  return {
    getMetar: async (icaos) =>
      ok({ ...p, entries: icaos.map((icao) => ({ icao, report: null, observationTime: null })) }),
    getTaf: async (icaos) =>
      ok({ ...p, entries: icaos.map((icao) => ({ icao, report: null, issueTime: null })) }),
    getNotams: async () => ok({ ...p, entries: opts.notams ?? [] }),
    getSigmet: async () => ok({ ...p, entries: opts.sigmets ?? [] }),
    decodeMetar: async () => ({ ok: false, error: { kind: 'provider_error', message: 'unused' } }),
    close: async () => {},
  }
}

async function render(
  weatherMcp: WeatherMcpClient,
  query: string,
  opts: { locale?: (typeof SUPPORTED_LOCALES)[number]; fragment?: boolean } = {},
): Promise<string> {
  const locale = opts.locale ?? 'es'
  const pool = new FakePoolFacade()
  const app: FastifyInstance = await buildApp({
    config: makeConfig(),
    pool,
    checkDatabase: async () => true,
    weatherMcp,
  })
  // The weather screen sits behind the wall (identity-access: "Route
  // protection"); render it for a signed-in pilot.
  const { cookie } = await createTestSession(pool)
  try {
    const res = await app.inject({
      method: 'GET',
      url: `${destinationPath('weather', locale)}?${query}`,
      headers: opts.fragment ? { cookie, 'hx-request': 'true' } : { cookie },
    })
    assert.equal(res.statusCode, 200)
    return res.body
  } finally {
    await app.close()
  }
}

const es = createTranslator({ locale: 'es' })
const NO_NOTAMS = es.translate('weather.no_notams')
const NOTAMS_UNCONFIRMED = es.translate('weather.notams_unconfirmed_empty')
const NO_SIGMETS = es.translate('weather.no_sigmets')
const SIGMETS_UNCONFIRMED = es.translate('weather.sigmets_unconfirmed_empty')
const NOT_STATED = es.translate('weather.validity_not_stated')

const LEMD_NOTAM = {
  id: 'A1234/26',
  text: 'RWY 14L/32R CLSD',
  startAt: '2026-08-25T06:00:00Z',
  endAt: '2026-08-28T14:00:00Z',
}

for (const fragment of [false, true]) {
  const variant = fragment ? 'fragment' : 'full page'

  test(`weather screen (${variant}): NOTAMs are listed with identifier, text, and UTC validity window`, async () => {
    const body = await render(
      stubMcp({ notams: [{ icao: 'LEMD', notams: [LEMD_NOTAM], coverage: 'unknown' }] }),
      'icao=LEMD',
      { fragment },
    )
    assert.ok(body.includes('A1234/26'))
    assert.ok(body.includes('RWY 14L/32R CLSD'))
    assert.ok(
      body.includes(formatUtcDateTime(new Date(LEMD_NOTAM.startAt), 'es')),
      'start of validity',
    )
    assert.ok(body.includes(formatUtcDateTime(new Date(LEMD_NOTAM.endAt), 'es')), 'end of validity')
    assert.ok(body.includes('stubprov'), 'provenance renders')
  })

  test(`weather screen (${variant}): a confirmed-empty NOTAM list states none are active, with provenance`, async () => {
    const body = await render(
      stubMcp({ notams: [{ icao: 'LPPT', notams: [], coverage: 'complete' }] }),
      'icao=LPPT',
      { fragment },
    )
    assert.ok(body.includes(NO_NOTAMS))
    assert.ok(!body.includes(NOTAMS_UNCONFIRMED))
    assert.ok(body.includes('stubprov'), 'the confirmed-empty state shows which provider said so')
  })

  test(`weather screen (${variant}): an unknown-coverage empty NOTAM list is unconfirmed, never "no active NOTAMs"`, async () => {
    const body = await render(
      stubMcp({ notams: [{ icao: 'LEMD', notams: [], coverage: 'unknown' }] }),
      'icao=LEMD',
      { fragment },
    )
    assert.ok(body.includes(NOTAMS_UNCONFIRMED))
    assert.ok(!body.includes(NO_NOTAMS))
    assert.ok(
      body.includes('stubprov'),
      'the unconfirmed-empty state shows which provider returned nothing',
    )
  })

  test(`weather screen (${variant}): an empty NOTAM list with absent coverage is treated as unconfirmed`, async () => {
    const body = await render(stubMcp({ notams: [{ icao: 'LEMD', notams: [] }] }), 'icao=LEMD', {
      fragment,
    })
    assert.ok(body.includes(NOTAMS_UNCONFIRMED))
    assert.ok(!body.includes(NO_NOTAMS))
  })

  test(`weather screen (${variant}): no NOTAM entry for the requested indicator is treated as unconfirmed`, async () => {
    const body = await render(
      stubMcp({ notams: [{ icao: 'LEBL', notams: [], coverage: 'complete' }] }),
      'icao=LEMD',
      { fragment },
    )
    assert.ok(body.includes(NOTAMS_UNCONFIRMED))
    assert.ok(!body.includes(NO_NOTAMS))
  })

  test(`weather screen (${variant}): unstated NOTAM validity renders "not stated" and no fabricated time`, async () => {
    const body = await render(
      stubMcp({
        notams: [
          {
            icao: 'LEMD',
            notams: [{ id: 'A9/26', text: 'TWY A CLSD', startAt: null, endAt: null }],
            coverage: 'unknown',
          },
        ],
      }),
      'icao=LEMD',
      { fragment },
    )
    assert.ok(body.includes('TWY A CLSD'))
    assert.equal(body.split(NOT_STATED).length - 1, 2, 'both unstated times read "not stated"')
    assert.ok(!body.includes('1970'), 'a null time is never formatted as the epoch')
  })

  test(`weather screen (${variant}): SIGMETs are listed with their validity window`, async () => {
    const body = await render(
      stubMcp({
        sigmets: [
          {
            fir: 'LECM',
            sigmets: [
              {
                header: 'LECM SIGMET 3 VALID 250600/251200',
                text: 'EMBD TS OBS',
                startAt: '2026-08-25T06:00:00Z',
                endAt: null,
              },
            ],
            coverage: 'unknown',
          },
        ],
      }),
      'fir=LECM',
      { fragment },
    )
    assert.ok(body.includes('LECM SIGMET 3 VALID 250600/251200'))
    assert.ok(body.includes(formatUtcDateTime(new Date('2026-08-25T06:00:00Z'), 'es')))
    assert.ok(body.includes(NOT_STATED), 'unstated end of validity reads "not stated"')
    assert.ok(!body.includes('1970'))
  })

  test(`weather screen (${variant}): a confirmed-empty SIGMET list states none in force`, async () => {
    const body = await render(
      stubMcp({ sigmets: [{ fir: 'LECM', sigmets: [], coverage: 'complete' }] }),
      'fir=LECM',
      { fragment },
    )
    assert.ok(body.includes(NO_SIGMETS))
    assert.ok(!body.includes(SIGMETS_UNCONFIRMED))
    assert.ok(body.includes('stubprov'))
  })

  test(`weather screen (${variant}): an unknown-coverage empty SIGMET list is unconfirmed, never "none in force"`, async () => {
    const body = await render(
      stubMcp({ sigmets: [{ fir: 'LECM', sigmets: [], coverage: 'unknown' }] }),
      'fir=LECM',
      { fragment },
    )
    assert.ok(body.includes(SIGMETS_UNCONFIRMED))
    assert.ok(!body.includes(NO_SIGMETS))
    assert.ok(body.includes('stubprov'))
  })
}

test('weather screen: a provenance line with no issue time reads "not stated", never the epoch or "now"', async () => {
  const mcp = stubMcp({ notams: [{ icao: 'LEMD', notams: [], coverage: 'complete' }] })
  const noIssueTime = { ...provenance(), issuedAt: null }
  mcp.getMetar = async (icaos) => ({
    ok: true,
    data: {
      ...noIssueTime,
      entries: icaos.map((icao) => ({
        icao,
        report: `${icao} 250600Z 27012KT 9999`,
        observationTime: null,
      })),
    },
  })
  mcp.getNotams = async () => ({
    ok: true,
    data: { ...noIssueTime, entries: [{ icao: 'LEMD', notams: [], coverage: 'complete' }] },
  })
  const body = await render(mcp, 'icao=LEMD')
  assert.ok(body.includes('LEMD 250600Z'), 'the METAR still renders')
  assert.equal(
    body.split(NOT_STATED).length - 1,
    2,
    'METAR and NOTAM provenance both read "not stated"',
  )
  assert.ok(!body.includes('1970'))
})

// Evals: standing rules, checked across every locale.

for (const locale of SUPPORTED_LOCALES) {
  const t = createTranslator({ locale })

  test(`eval (${locale}): "none in force" text never renders for a report without complete coverage`, async () => {
    const body = await render(
      stubMcp({
        notams: [{ icao: 'LEMD', notams: [], coverage: 'unknown' }],
        sigmets: [{ fir: 'LECM', sigmets: [] }],
      }),
      'icao=LEMD&fir=LECM',
      { locale },
    )
    assert.ok(!body.includes(t.translate('weather.no_notams')))
    assert.ok(!body.includes(t.translate('weather.no_sigmets')))
    assert.ok(body.includes(t.translate('weather.notams_unconfirmed_empty')))
    assert.ok(body.includes(t.translate('weather.sigmets_unconfirmed_empty')))
  })

  test(`eval (${locale}): the mock-data caveat still renders on both empty states`, async () => {
    for (const coverage of ['complete', 'unknown'] as const) {
      const body = await render(
        stubMcp({ notams: [{ icao: 'LPPT', notams: [], coverage }], sample: true }),
        'icao=LPPT',
        { locale },
      )
      assert.ok(
        body.includes(t.translate('weather.sample_caveat')),
        `caveat on ${coverage} empty state`,
      )
    }
  })
}

// awc-weather-provider: official briefing link on unconfirmed NOTAM sections.

const ENAIRE = 'https://notampib.enaire.es/icaro'
const NAV_PORTUGAL = 'https://ais.nav.pt'
const AIS_HINT = es.translate('weather.notams_unconfirmed_empty')

for (const fragment of [false, true]) {
  const variant = fragment ? 'fragment' : 'full page'

  for (const [icao, href, label] of [
    ['LEMD', ENAIRE, 'Spanish aerodrome'],
    ['GCLP', ENAIRE, 'Canary Islands aerodrome'],
    ['LPPT', NAV_PORTUGAL, 'Portuguese aerodrome'],
  ] as const) {
    test(`weather screen (${variant}): ${label} with unconfirmed NOTAMs links to its official briefing`, async () => {
      const body = await render(
        stubMcp({ notams: [{ icao, notams: [], coverage: 'unknown' }] }),
        `icao=${icao}`,
        { fragment },
      )
      assert.ok(body.includes(`href="${href}"`), `${icao} links to ${href}`)
    })
  }

  test(`weather screen (${variant}): an aerodrome outside Spain and Portugal gets no briefing link but keeps the AIS text`, async () => {
    const body = await render(
      stubMcp({ notams: [{ icao: 'SUMU', notams: [], coverage: 'unknown' }] }),
      'icao=SUMU',
      { fragment },
    )
    assert.ok(!body.includes(ENAIRE) && !body.includes(NAV_PORTUGAL))
    assert.ok(body.includes(AIS_HINT))
  })

  test(`weather screen (${variant}): a confirmed complete NOTAM list gets no briefing link`, async () => {
    const body = await render(
      stubMcp({ notams: [{ icao: 'LPPT', notams: [], coverage: 'complete' }] }),
      'icao=LPPT',
      { fragment },
    )
    assert.ok(!body.includes(NAV_PORTUGAL))
  })

  test(`weather screen (${variant}): a non-empty unconfirmed NOTAM list also links to the briefing`, async () => {
    const body = await render(
      stubMcp({ notams: [{ icao: 'LEMD', notams: [LEMD_NOTAM], coverage: 'unknown' }] }),
      'icao=LEMD',
      { fragment },
    )
    assert.ok(body.includes(`href="${ENAIRE}"`))
  })
}

test('eval: the briefing link meets the touch-target rule and opens safely', async () => {
  const body = await render(
    stubMcp({ notams: [{ icao: 'LEMD', notams: [], coverage: 'unknown' }] }),
    'icao=LEMD',
  )
  const link = new RegExp(`<a href="${ENAIRE}"[^>]*>`).exec(body)?.[0] ?? ''
  assert.match(link, /class="[^"]*touch-target/)
  assert.match(link, /rel="noopener noreferrer"/)
})

test('eval: rendering the briefing link fetches nothing from ENAIRE or NAV Portugal', async () => {
  const original = globalThis.fetch
  const fetched: string[] = []
  globalThis.fetch = (async (input: string | URL) => {
    fetched.push(String(input))
    throw new Error('the web app must not fetch here')
  }) as typeof fetch
  try {
    const body = await render(
      stubMcp({
        notams: [
          { icao: 'LEMD', notams: [], coverage: 'unknown' },
          { icao: 'LPPT', notams: [], coverage: 'unknown' },
        ],
      }),
      'icao=LEMD,LPPT',
    )
    assert.ok(body.includes(ENAIRE) && body.includes(NAV_PORTUGAL))
    assert.deepEqual(fetched, [], 'no request to any official site')
  } finally {
    globalThis.fetch = original
  }
})

test('eval: real AWC weather beside sample NOTAMs shows the sample caveat on the NOTAMs only', async () => {
  const mcp = stubMcp({ notams: [], sample: true })
  const real = { ...provenance(false), provider: 'awc' }
  mcp.getMetar = async (icaos) => ({
    ok: true,
    data: {
      ...real,
      issuedAt: '2026-08-25T06:00:00Z',
      entries: icaos.map((icao) => ({
        icao,
        report: `${icao} 250600Z 27012KT 9999`,
        observationTime: '2026-08-25T06:00:00Z',
      })),
    },
  })
  mcp.getNotams = async () => ({
    ok: true,
    data: {
      ...provenance(true),
      provider: 'mock',
      entries: [{ icao: 'LEMD', notams: [], coverage: 'complete' }],
    },
  })
  const body = await render(mcp, 'icao=LEMD')
  assert.ok(body.includes('awc'), 'METAR provenance names awc')
  assert.equal(
    body.split(es.translate('weather.sample_caveat')).length - 1,
    1,
    'the caveat appears once — on the mock NOTAM section, not on the AWC METAR',
  )
})
