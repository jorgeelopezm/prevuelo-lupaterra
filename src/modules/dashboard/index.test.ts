import { test } from 'node:test'
import assert from 'node:assert/strict'

import type { FastifyInstance } from 'fastify'

import { buildApp, type BuildAppOptions } from '../../server/app.js'
import { loadConfig } from '../../server/config.js'
import { FakePoolFacade } from '../../platform/db/fake-pool.js'
import { SUPPORTED_LOCALES } from '../../platform/i18n/locale.js'
import { createWbRepo } from '../../platform/fleet/wb-repo.js'
import { createMaintenanceRepo } from '../../platform/fleet/maintenance-repo.js'
import { createFlightRepo } from '../../platform/fleet/flight-repo.js'
import { createFlightIntentRepo } from '../../platform/risk/flight-intent-repo.js'
import { createRiskAssessmentRepo } from '../../platform/risk/risk-assessment-repo.js'
import type {
  DecodedMetar,
  MetarResult,
  NotamResult,
  SigmetResult,
  TafResult,
  WeatherMcpClient,
  WeatherMcpErrorKind,
  WeatherMcpResult,
} from '../../platform/weather-mcp/types.js'
import type { CreateFlightEntryInput } from '../../platform/fleet/types.js'

function makeConfig() {
  return loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgres://localhost/ga',
    SESSION_SECRET: 's'.repeat(48),
    // These tests sign pilots up through the registration route.
    REGISTRATION_ENABLED: 'true',
  })
}

async function makeApp(overrides: Partial<BuildAppOptions> = {}): Promise<FastifyInstance> {
  const pool = overrides.pool ?? new FakePoolFacade()
  return buildApp({ config: makeConfig(), pool, checkDatabase: async () => true, ...overrides })
}

function csrfFrom(html: string): string {
  const match = /name="csrfToken" value="([^"]+)"/.exec(html)
  assert.ok(match, 'page must embed a csrf token')
  return match[1] as string
}

function cookieHeader(res: { cookies: Array<{ name: string; value: string }> }): string {
  return res.cookies.map((c) => `${c.name}=${c.value}`).join('; ')
}

function formBody(fields: Record<string, string>): string {
  return Object.entries(fields)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')
}

async function signUpPilot(app: FastifyInstance, email = 'piloto@example.com'): Promise<string> {
  const page = await app.inject({ method: 'GET', url: '/es/auth/register' })
  const csrf = csrfFrom(page.body)
  const cookie = cookieHeader(page)
  const res = await app.inject({
    method: 'POST',
    url: '/es/auth/register',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    payload: formBody({
      email,
      displayName: 'Piloto de Prueba',
      password: 'super-secret-1234',
      csrfToken: csrf,
    }),
  })
  const sessionCookie = res.cookies.find((c) => c.name === 'ga_session')?.value ?? ''
  return `ga_session=${sessionCookie}`
}

/** Adds an aircraft via the real fleet routes, activates it, and returns its
 * id. Not importing fleet's own path helper (module-boundary rule) — the
 * form's URL is hardcoded here the same way the shell/fragment tests do. */
async function addActiveAircraft(app: FastifyInstance, cookie: string): Promise<string> {
  const formPage = await app.inject({
    method: 'GET',
    url: '/es/aeronave/aviones/nuevo',
    headers: { cookie },
  })
  const csrf = csrfFrom(formPage.body)
  const created = await app.inject({
    method: 'POST',
    url: '/es/aeronave/aviones/nuevo',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    payload: formBody({
      registration: 'EC-ABC',
      icaoType: 'C172',
      manufacturer: 'Cessna',
      model: '172S',
      csrfToken: csrf,
    }),
  })
  const location = created.headers.location as string
  const aircraftId = new URL(location, 'http://x').searchParams.get('aircraft') as string

  const listPage = await app.inject({ method: 'GET', url: '/es/aeronave', headers: { cookie } })
  const listCsrf = csrfFrom(listPage.body)
  await app.inject({
    method: 'POST',
    url: `/es/aeronave/aviones/${aircraftId}/activar`,
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    payload: formBody({ csrfToken: listCsrf }),
  })
  return aircraftId
}

function flightEntryInput(aircraftId: string): CreateFlightEntryInput {
  return {
    aircraftId,
    kind: 'flight',
    flightDate: '2026-07-01',
    departureAerodrome: 'LEMD',
    departureTime: null,
    arrivalAerodrome: 'LEBL',
    arrivalTime: null,
    pilotFunction: 'pic',
    singleEngine: true,
    multiEngine: false,
    totalMinutes: 54,
    nightMinutes: 0,
    ifrMinutes: 0,
    crossCountryMinutes: 0,
    instrumentMinutes: 0,
    hobbsOut: null,
    hobbsIn: null,
    tachOut: 1200,
    tachIn: 1200.9,
    fuelUplift: null,
    fuelBurn: null,
    dayLandings: 1,
    nightLandings: 0,
    passengers: 0,
    remarks: null,
    deviceType: null,
    deviceQualification: null,
  }
}

function nextWeekDate(): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + 7)
  return d.toISOString().slice(0, 10)
}

function pastDate(): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - 7)
  return d.toISOString().slice(0, 10)
}

type StubMcpOverrides = Partial<{
  getMetar: WeatherMcpClient['getMetar']
  getNotams: WeatherMcpClient['getNotams']
}>

function okResult<T>(data: T): WeatherMcpResult<T> {
  return { ok: true, data }
}

function errorResult<T>(kind: WeatherMcpErrorKind): WeatherMcpResult<T> {
  return { ok: false, error: { kind, message: `stub ${kind}` } }
}

function baseProvenance() {
  return {
    provider: 'mock',
    issuedAt: '2026-07-01T10:00:00Z',
    retrievedAt: '2026-07-01T10:05:00Z',
    cached: false,
    cacheAgeSeconds: 0,
    sample: true,
    caveat: 'sample data',
  }
}

function stubMcp(overrides: StubMcpOverrides = {}): WeatherMcpClient & { calls: number } {
  const client = {
    calls: 0,
    async getMetar(icaos: readonly string[]): Promise<WeatherMcpResult<MetarResult>> {
      client.calls++
      if (overrides.getMetar) return overrides.getMetar(icaos)
      return okResult({
        ...baseProvenance(),
        entries: icaos.map((icao) => ({
          icao,
          report: `${icao} 011000Z 27008KT 9999 FEW030 22/12 Q1018`,
          observationTime: '2026-07-01T10:00:00Z',
        })),
      })
    },
    async getNotams(icaos: readonly string[]): Promise<WeatherMcpResult<NotamResult>> {
      client.calls++
      if (overrides.getNotams) return overrides.getNotams(icaos)
      return okResult({
        ...baseProvenance(),
        entries: icaos.map((icao) => ({ icao, notams: [], coverage: 'complete' as const })),
      })
    },
    async getTaf(): Promise<WeatherMcpResult<TafResult>> {
      return errorResult('provider_error')
    },
    async getSigmet(): Promise<WeatherMcpResult<SigmetResult>> {
      return errorResult('provider_error')
    },
    async decodeMetar(): Promise<WeatherMcpResult<DecodedMetar>> {
      return errorResult('provider_error')
    },
    async close() {},
  }
  return client
}

test('anonymous visitor to the locale root is sent to sign-in with no operational values', async () => {
  for (const locale of SUPPORTED_LOCALES) {
    const app = await makeApp()
    const res = await app.inject({ method: 'GET', url: `/${locale}` })
    assert.equal(res.statusCode, 302)
    const next = encodeURIComponent(`/${locale}`)
    assert.equal(res.headers.location, `/${locale}/auth/sign-in?next=${next}`)
    for (const forbidden of ['EC-ABC', 'RIESGO', 'METAR', 'NOTAM', 'tach', 'Buenos', '<aside']) {
      assert.ok(!res.body.includes(forbidden), `must not include ${forbidden}`)
    }
    await app.close()
  }
})

test('anonymous request for the weather-summary fragment gets an htmx redirect and no MCP call', async () => {
  const mcp = stubMcp()
  const app = await makeApp({ weatherMcp: mcp })
  const res = await app.inject({
    method: 'GET',
    url: '/es/resumen-meteorologico',
    headers: { 'hx-request': 'true' },
  })
  assert.equal(res.statusCode, 401)
  assert.equal(
    res.headers['hx-redirect'],
    `/es/auth/sign-in?next=${encodeURIComponent('/es/resumen-meteorologico')}`,
  )
  assert.equal(res.body, '', 'no fragment content')
  assert.equal(mcp.calls, 0, 'no weather lookup on behalf of an anonymous visitor')
  await app.close()
})

test('signed-in pilot with nothing recorded, including no active aircraft, sees explicit unavailable text everywhere', async () => {
  const app = await makeApp()
  const cookie = await signUpPilot(app)
  const res = await app.inject({ method: 'GET', url: '/es', headers: { cookie } })
  assert.equal(res.statusCode, 200)
  assert.ok(res.body.includes('No tienes ningún vuelo planificado'))
  assert.ok(res.body.includes('Sin aeronave activa'))
  // No active aircraft: all three stat cards share the one "no aircraft
  // selected" message rather than each stating its own field is unrecorded
  // (spec: "No active aircraft").
  const noAircraftCount = res.body.split('Sin aeronave activa seleccionada').length - 1
  assert.equal(noAircraftCount, 3, 'all three stat cards state no aircraft is selected')
  await app.close()
})

test('an active aircraft with no wb/maintenance/flight data states each field is unrecorded', async () => {
  const app = await makeApp()
  const cookie = await signUpPilot(app)
  await addActiveAircraft(app, cookie)
  const res = await app.inject({ method: 'GET', url: '/es', headers: { cookie } })
  assert.equal(res.statusCode, 200)
  assert.ok(res.body.includes('Sin perfil de peso y balance registrado'))
  assert.ok(res.body.includes('Sin condición de mantenimiento calculable'))
  assert.ok(res.body.includes('Sin vuelos registrados'))
  await app.close()
})

test('a flight intent with no assessment never shows a favorable verdict', async () => {
  const pool = new FakePoolFacade()
  const app = await makeApp({ pool })
  const cookie = await signUpPilot(app)
  const aircraftId = await addActiveAircraft(app, cookie)

  const flightIntentRepo = createFlightIntentRepo(pool)
  const pilotId = pool.pilots[0]?.id as string
  const created = await flightIntentRepo.create(pilotId, {
    aircraftId,
    plannedDate: nextWeekDate(),
    departureIcao: 'LEMD',
    destinationIcao: 'LEBL',
  })
  assert.ok(created.ok)

  const res = await app.inject({ method: 'GET', url: '/es', headers: { cookie } })
  assert.equal(res.statusCode, 200)
  assert.ok(res.body.includes('Sin evaluar'))
  assert.ok(!res.body.includes('Riesgo bajo'))
  assert.ok(!res.body.includes('Riesgo medio'))
  assert.ok(!res.body.includes('Riesgo alto'))
  await app.close()
})

test('an assessed flight intent shows the derived verdict, score, and submission time', async () => {
  const pool = new FakePoolFacade()
  const app = await makeApp({ pool })
  const cookie = await signUpPilot(app)
  const aircraftId = await addActiveAircraft(app, cookie)
  const pilotId = pool.pilots[0]?.id as string

  const flightIntentRepo = createFlightIntentRepo(pool)
  const riskAssessmentRepo = createRiskAssessmentRepo(pool)
  const created = await flightIntentRepo.create(pilotId, {
    aircraftId,
    plannedDate: nextWeekDate(),
    departureIcao: 'LEMD',
    destinationIcao: 'LEBL',
  })
  assert.ok(created.ok)
  if (!created.ok) return
  await riskAssessmentRepo.create(pilotId, {
    flightIntentId: created.flightIntent.id,
    answers: [],
    domainScores: [],
    overallScore: 5,
    verdict: 'low',
    aircraftSnapshot: { engineExceedance: null, fuelStatus: null, hoursToNextMaintenance: null },
  })

  const res = await app.inject({ method: 'GET', url: '/es', headers: { cookie } })
  assert.equal(res.statusCode, 200)
  assert.ok(res.body.includes('Riesgo bajo'))
  assert.ok(res.body.includes('LEMD'))
  assert.ok(res.body.includes('LEBL'))
  await app.close()
})

test('only past flight intents render the plan-a-flight prompt with no route value', async () => {
  const pool = new FakePoolFacade()
  const app = await makeApp({ pool })
  const cookie = await signUpPilot(app)
  const aircraftId = await addActiveAircraft(app, cookie)
  const pilotId = pool.pilots[0]?.id as string
  const flightIntentRepo = createFlightIntentRepo(pool)
  await flightIntentRepo.create(pilotId, {
    aircraftId,
    plannedDate: pastDate(),
    departureIcao: 'LEMD',
    destinationIcao: 'LEBL',
  })

  const res = await app.inject({ method: 'GET', url: '/es', headers: { cookie } })
  assert.equal(res.statusCode, 200)
  assert.ok(res.body.includes('No tienes ningún vuelo planificado'))
  assert.ok(!res.body.includes('LEMD'))
  assert.ok(!res.body.includes('LEBL'))
  await app.close()
})

test('the aircraft stat cards show real values when data is recorded', async () => {
  const pool = new FakePoolFacade()
  const app = await makeApp({ pool })
  const cookie = await signUpPilot(app)
  const aircraftId = await addActiveAircraft(app, cookie)
  const pilotId = pool.pilots[0]?.id as string

  const wbRepo = createWbRepo(pool)
  await wbRepo.set(pilotId, aircraftId, {
    emptyWeight: 1500,
    emptyWeightArm: 40,
    mtow: 2450,
    mlw: null,
    mzfw: null,
    usableFuelQty: 40,
    usableFuelArm: 48,
    massUnit: 'lb',
    lengthUnit: 'in',
    loadStations: [],
    envelopePoints: [],
  })

  const flightRepo = createFlightRepo(pool)
  await flightRepo.create(pilotId, flightEntryInput(aircraftId))

  const maintenanceRepo = createMaintenanceRepo(pool)
  await maintenanceRepo.create(pilotId, aircraftId, {
    description: 'Cambio de aceite',
    dueOn: null,
    dueAtHours: 1300,
    hoursBasis: 'tach',
    recurrenceMonths: null,
    recurrenceHours: 50,
    reference: null,
  })

  const res = await app.inject({ method: 'GET', url: '/es', headers: { cookie } })
  assert.equal(res.statusCode, 200)
  assert.ok(res.body.includes('40.0'), 'usable fuel value renders')
  assert.ok(res.body.includes('Cambio de aceite'), 'nearest-due maintenance item renders')
  assert.ok(res.body.includes('LEMD'), 'last flight route renders')
  await app.close()
})

test('the weather fragment renders METAR and NOTAMs with provenance', async () => {
  const pool = new FakePoolFacade()
  const mcp = stubMcp()
  const app = await makeApp({ pool, weatherMcp: mcp })
  const cookie = await signUpPilot(app)
  const aircraftId = await addActiveAircraft(app, cookie)
  const pilotId = pool.pilots[0]?.id as string
  const flightIntentRepo = createFlightIntentRepo(pool)
  await flightIntentRepo.create(pilotId, {
    aircraftId,
    plannedDate: nextWeekDate(),
    departureIcao: 'LEMD',
    destinationIcao: 'LEBL',
  })

  const res = await app.inject({
    method: 'GET',
    url: '/es/resumen-meteorologico',
    headers: { cookie },
  })
  assert.equal(res.statusCode, 200)
  assert.ok(res.body.includes('LEMD 011000Z'), 'metar report renders')
  assert.ok(res.body.includes('mock'), 'provider renders')
  assert.ok(res.body.includes('Sin NOTAMs activos'), 'empty notam list is distinct from a failure')
  assert.ok(res.body.includes('Datos de muestra'), 'sample caveat renders')
  await app.close()
})

/** Render the home weather fragment for a pilot whose next intent departs LEMD. */
async function homeWeatherFragment(
  getNotams: WeatherMcpClient['getNotams'],
  departureIcao = 'LEMD',
): Promise<string> {
  const pool = new FakePoolFacade()
  const app = await makeApp({ pool, weatherMcp: stubMcp({ getNotams }) })
  const cookie = await signUpPilot(app)
  const aircraftId = await addActiveAircraft(app, cookie)
  const pilotId = pool.pilots[0]?.id as string
  await createFlightIntentRepo(pool).create(pilotId, {
    aircraftId,
    plannedDate: nextWeekDate(),
    departureIcao,
    destinationIcao: 'LEBL',
  })
  const res = await app.inject({
    method: 'GET',
    url: '/es/resumen-meteorologico',
    headers: { cookie },
  })
  assert.equal(res.statusCode, 200)
  await app.close()
  return res.body
}

const HOME_UNCONFIRMED = 'Esto no confirma que no haya NOTAMs en vigor'

test('the home NOTAM band lists NOTAMs with their validity window and provenance', async () => {
  const body = await homeWeatherFragment(async () =>
    okResult({
      ...baseProvenance(),
      entries: [
        {
          icao: 'LEMD',
          notams: [
            {
              id: 'A1234/26',
              text: 'RWY 14L/32R CLSD',
              startAt: '2026-08-25T06:00:00Z',
              endAt: '2026-08-28T14:00:00Z',
            },
          ],
          coverage: 'unknown' as const,
        },
      ],
    }),
  )
  assert.ok(body.includes('A1234/26'))
  assert.ok(body.includes('Validez'), 'validity window renders')
  assert.ok(body.includes('mock'), 'provenance renders')
  assert.ok(body.includes('Datos de muestra'), 'sample caveat renders')
})

for (const [label, entries] of [
  ['unknown coverage', [{ icao: 'LEMD', notams: [], coverage: 'unknown' as const }]],
  ['absent coverage', [{ icao: 'LEMD', notams: [] }]],
  [
    'no entry for the departure indicator',
    [{ icao: 'LEBL', notams: [], coverage: 'complete' as const }],
  ],
] as const) {
  test(`the home NOTAM band never states "no NOTAMs in force" for an empty list with ${label}`, async () => {
    const body = await homeWeatherFragment(async () =>
      okResult({ ...baseProvenance(), entries: entries.map((e) => ({ ...e, notams: [] })) }),
    )
    assert.ok(!body.includes('Sin NOTAMs activos'))
    assert.ok(body.includes(HOME_UNCONFIRMED))
    assert.ok(body.includes('mock'), 'the unconfirmed-empty state carries provenance')
  })
}

test('the home NOTAM band renders unstated validity as "not stated", never a fabricated time', async () => {
  const body = await homeWeatherFragment(async () =>
    okResult({
      ...baseProvenance(),
      entries: [
        {
          icao: 'LEMD',
          notams: [{ id: 'A9/26', text: 'TWY A CLSD', startAt: null, endAt: null }],
          coverage: 'unknown' as const,
        },
      ],
    }),
  )
  assert.equal(body.split('no indicada').length - 1, 2)
  assert.ok(!body.includes('1970'))
})

for (const kind of ['timeout', 'rate_limit', 'provider_error', 'validation'] as const) {
  test(`weather fragment failure (${kind}) renders a localized error box and nothing else`, async () => {
    const pool = new FakePoolFacade()
    const mcp = stubMcp({
      getMetar: async () => errorResult(kind),
      getNotams: async () => errorResult(kind),
    })
    const app = await makeApp({ pool, weatherMcp: mcp })
    const cookie = await signUpPilot(app)
    const aircraftId = await addActiveAircraft(app, cookie)
    const pilotId = pool.pilots[0]?.id as string
    const flightIntentRepo = createFlightIntentRepo(pool)
    await flightIntentRepo.create(pilotId, {
      aircraftId,
      plannedDate: nextWeekDate(),
      departureIcao: 'LEMD',
      destinationIcao: 'LEBL',
    })

    const res = await app.inject({
      method: 'GET',
      url: '/es/resumen-meteorologico',
      headers: { cookie },
    })
    assert.equal(res.statusCode, 200)
    assert.ok(res.body.includes('role="alert"'), 'renders the error box')
    assert.ok(!res.body.includes('27008KT'), 'no report text leaks through')

    // The surrounding brief still renders independently of the failure.
    const home = await app.inject({ method: 'GET', url: '/es', headers: { cookie } })
    assert.ok(home.body.includes('LEMD'))
    await app.close()
  })
}

test('no flight intent means no weather retrieval and the fragment states no aerodrome selected', async () => {
  const mcp = stubMcp()
  const app = await makeApp({ weatherMcp: mcp })
  const cookie = await signUpPilot(app)

  const res = await app.inject({
    method: 'GET',
    url: '/es/resumen-meteorologico',
    headers: { cookie },
  })
  assert.equal(res.statusCode, 200)
  assert.ok(res.body.includes('Sin aeródromo de salida seleccionado'))
  assert.equal(mcp.calls, 0, 'no MCP call was made')
  await app.close()
})

test('the brief renders without waiting on the weather retrieval', async () => {
  const pool = new FakePoolFacade()
  const neverResolving = stubMcp({
    getMetar: () => new Promise(() => {}),
    getNotams: () => new Promise(() => {}),
  })
  const app = await makeApp({ pool, weatherMcp: neverResolving })
  const cookie = await signUpPilot(app)
  const aircraftId = await addActiveAircraft(app, cookie)
  const pilotId = pool.pilots[0]?.id as string
  const flightIntentRepo = createFlightIntentRepo(pool)
  await flightIntentRepo.create(pilotId, {
    aircraftId,
    plannedDate: nextWeekDate(),
    departureIcao: 'LEMD',
    destinationIcao: 'LEBL',
  })

  const res = await app.inject({ method: 'GET', url: '/es', headers: { cookie } })
  assert.equal(res.statusCode, 200)
  assert.ok(res.body.includes('LEMD'))
  assert.ok(res.body.includes('Estado de la Aeronave'))
  await app.close()
})

test('the home page is usable without client-side scripting: a real link to the weather screen is present pre-swap', async () => {
  const pool = new FakePoolFacade()
  const app = await makeApp({ pool })
  const cookie = await signUpPilot(app)
  const aircraftId = await addActiveAircraft(app, cookie)
  const pilotId = pool.pilots[0]?.id as string
  const flightIntentRepo = createFlightIntentRepo(pool)
  await flightIntentRepo.create(pilotId, {
    aircraftId,
    plannedDate: nextWeekDate(),
    departureIcao: 'LEMD',
    destinationIcao: 'LEBL',
  })

  const res = await app.inject({ method: 'GET', url: '/es', headers: { cookie } })
  assert.match(res.body, /href="\/es\/meteorologia\?icao=LEMD"/)
  assert.ok(!res.body.toLowerCase().includes('spinner'))
  await app.close()
})

test('the HX-Request response is the bare partial, matching the full page embed', async () => {
  const app = await makeApp()
  const cookie = await signUpPilot(app)
  const full = await app.inject({ method: 'GET', url: '/es', headers: { cookie } })
  const fragment = await app.inject({
    method: 'GET',
    url: '/es',
    headers: { cookie, 'hx-request': 'true' },
  })
  assert.equal(fragment.statusCode, 200)
  assert.ok(!fragment.body.includes('<!doctype html>'))
  assert.ok(!fragment.body.includes('<aside'))
  assert.ok(full.body.includes(fragment.body.trim().slice(0, 80)))
  await app.close()
})

test('every tile and stat card on the home screen carries the touch-target class', async () => {
  const pool = new FakePoolFacade()
  const app = await makeApp({ pool })
  const cookie = await signUpPilot(app)
  await addActiveAircraft(app, cookie)
  const res = await app.inject({ method: 'GET', url: '/es', headers: { cookie } })
  // Four tiles + three stat cards, each an <a class="touch-target ...">.
  const touchTargetLinks = [...res.body.matchAll(/<a[^>]*class="touch-target[^"]*"/g)]
  assert.ok(
    touchTargetLinks.length >= 7,
    `expected at least 7 touch-target links, found ${touchTargetLinks.length}`,
  )
  await app.close()
})

test('home screen renders localized text with no untranslated key leaking through', async () => {
  const app = await makeApp()
  const cookie = await signUpPilot(app)
  for (const locale of SUPPORTED_LOCALES) {
    const res = await app.inject({ method: 'GET', url: `/${locale}`, headers: { cookie } })
    assert.equal(res.statusCode, 200, `${locale} resolves`)
    assert.ok(!res.body.includes('home.'), `${locale} leaks a raw home.* key`)
  }
  await app.close()
})

test('catalogs supporting the home screen contain no operational-value shapes', async () => {
  const { loadCatalogs } = await import('../../platform/i18n/catalog.js')
  const catalogs = loadCatalogs()
  const suspectPattern = /\b[A-Z]{4}\b|\d{2,}\s?(hrs|USG|lb|kg)/
  for (const locale of SUPPORTED_LOCALES) {
    for (const [key, value] of Object.entries(catalogs[locale])) {
      if (!key.startsWith('home.')) continue
      if (typeof value !== 'string') continue
      assert.ok(
        !suspectPattern.test(value),
        `${locale}:${key} looks like an operational value: ${value}`,
      )
    }
  }
})

test('dashboard destination is registered', async () => {
  const { ALL_MODULES } = await import('../registry.js')
  assert.ok(ALL_MODULES.some((m) => m.id === 'dashboard'))
})

// awc-weather-provider: official briefing link in the NOTAM attention band.

test('the home NOTAM band for a Spanish departure with unconfirmed NOTAMs links to ENAIRE ICARO XXI', async () => {
  const body = await homeWeatherFragment(async () =>
    okResult({
      ...baseProvenance(),
      entries: [{ icao: 'LEMD', notams: [], coverage: 'unknown' as const }],
    }),
  )
  assert.ok(body.includes('href="https://notampib.enaire.es/icaro"'))
})

test('the home NOTAM band for a departure outside Spain and Portugal has no briefing link', async () => {
  const body = await homeWeatherFragment(
    async () =>
      okResult({
        ...baseProvenance(),
        entries: [{ icao: 'SUMU', notams: [], coverage: 'unknown' as const }],
      }),
    'SUMU',
  )
  assert.ok(!body.includes('notampib.enaire.es') && !body.includes('ais.nav.pt'))
  assert.ok(body.includes(HOME_UNCONFIRMED), 'the AIS text is still there')
})

test('the home NOTAM band with a confirmed complete list has no briefing link', async () => {
  const body = await homeWeatherFragment(async () =>
    okResult({
      ...baseProvenance(),
      entries: [{ icao: 'LEMD', notams: [], coverage: 'complete' as const }],
    }),
  )
  assert.ok(!body.includes('notampib.enaire.es'))
})
