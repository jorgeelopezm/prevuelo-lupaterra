import { test } from 'node:test'
import assert from 'node:assert/strict'

import type { FastifyInstance } from 'fastify'

import { buildApp, type BuildAppOptions } from '../../server/app.js'
import { loadConfig } from '../../server/config.js'
import { FakePoolFacade } from '../../platform/db/fake-pool.js'
import { ALL_PILOT_ANSWERED_ITEM_KEYS } from '../../platform/risk/scoring.js'
import { SUPPORTED_LOCALES, type SupportedLocale } from '../../platform/i18n/locale.js'
import { loadCatalogs } from '../../platform/i18n/catalog.js'
import { destinationPath } from '../../platform/i18n/segments.js'
import { riskPath } from './paths.js'

/** Builds the localized "add aircraft" URL without importing the fleet
 * module's own path helper (module-boundary/no-cross-module-import forbids
 * a feature module — or its tests — importing another feature module). */
function aircraftNewPath(locale: SupportedLocale): string {
  const catalog = loadCatalogs()[locale]
  return `${destinationPath('fleet', locale)}/${catalog['fleet.segment.aircraft']}/${catalog['fleet.segment.new']}`
}

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

/** Adds an aircraft via the real fleet routes and returns its id. */
async function addAircraft(app: FastifyInstance, cookie: string): Promise<string> {
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
  return new URL(location, 'http://x').searchParams.get('aircraft') as string
}

/** Creates a flight intent via the real risk routes and returns the
 * assessment-start redirect location (the questionnaire URL). */
async function createFlightIntent(
  app: FastifyInstance,
  cookie: string,
  aircraftId: string,
): Promise<string> {
  const formPage = await app.inject({
    method: 'GET',
    url: '/es/riesgo/intento-vuelo/nuevo',
    headers: { cookie },
  })
  const csrf = csrfFrom(formPage.body)
  const created = await app.inject({
    method: 'POST',
    url: '/es/riesgo/intento-vuelo/nuevo',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    payload: formBody({
      aircraftId,
      plannedDate: '2026-12-01',
      departureIcao: 'LEMD',
      destinationIcao: 'LEBL',
      csrfToken: csrf,
    }),
  })
  assert.equal(created.statusCode, 303)
  return created.headers.location as string
}

function favorableAnswers(): Record<string, string> {
  const answers: Record<string, string> = {}
  for (const key of ALL_PILOT_ANSWERED_ITEM_KEYS) answers[key] = '0'
  return answers
}

test('unauthenticated request to the risk screen redirects to sign-in', async () => {
  const app = await makeApp()
  const res = await app.inject({ method: 'GET', url: '/es/riesgo' })
  assert.equal(res.statusCode, 302)
  assert.match(res.headers.location ?? '', /\/es\/auth\/sign-in/)
  await app.close()
})

test('a pilot with no flight intents sees the empty state', async () => {
  const app = await makeApp()
  const cookie = await signUpPilot(app)
  const res = await app.inject({ method: 'GET', url: '/es/riesgo', headers: { cookie } })
  assert.equal(res.statusCode, 200)
  assert.ok(res.body.includes('Sin planes de vuelo'))
  await app.close()
})

test('creating a flight intent redirects to the questionnaire for it', async () => {
  const app = await makeApp()
  const cookie = await signUpPilot(app)
  const aircraftId = await addAircraft(app, cookie)
  const location = await createFlightIntent(app, cookie, aircraftId)
  assert.match(location, /\/es\/riesgo\/evaluacion\/.+\/nuevo/)
  await app.close()
})

test('submitting an incomplete questionnaire is rejected with unanswered items identified', async () => {
  const app = await makeApp()
  const cookie = await signUpPilot(app)
  const aircraftId = await addAircraft(app, cookie)
  const location = await createFlightIntent(app, cookie, aircraftId)

  const page = await app.inject({ method: 'GET', url: location, headers: { cookie } })
  const csrf = csrfFrom(page.body)

  const answers = favorableAnswers()
  delete answers.illness // leave one item unanswered
  const res = await app.inject({
    method: 'POST',
    url: location,
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    payload: formBody({ ...answers, csrfToken: csrf }),
  })
  assert.equal(res.statusCode, 422)
  assert.ok(res.body.includes('Responde todas las preguntas'))
  await app.close()
})

test('submitting a complete questionnaire stores a record and shows the low-risk verdict', async () => {
  const app = await makeApp()
  const cookie = await signUpPilot(app)
  const aircraftId = await addAircraft(app, cookie)
  const location = await createFlightIntent(app, cookie, aircraftId)

  const page = await app.inject({ method: 'GET', url: location, headers: { cookie } })
  const csrf = csrfFrom(page.body)

  const res = await app.inject({
    method: 'POST',
    url: location,
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    payload: formBody({ ...favorableAnswers(), csrfToken: csrf }),
  })
  assert.equal(res.statusCode, 303)

  const result = await app.inject({
    method: 'GET',
    url: res.headers.location as string,
    headers: { cookie },
  })
  assert.equal(result.statusCode, 200)
  assert.ok(
    result.body.includes('RIESGO BAJO'.normalize()) || result.body.toLowerCase().includes('bajo'),
  )
  await app.close()
})

test('the recorded assessment appears in the history screen', async () => {
  const app = await makeApp()
  const cookie = await signUpPilot(app)
  const aircraftId = await addAircraft(app, cookie)
  const location = await createFlightIntent(app, cookie, aircraftId)
  const page = await app.inject({ method: 'GET', url: location, headers: { cookie } })
  const csrf = csrfFrom(page.body)
  await app.inject({
    method: 'POST',
    url: location,
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    payload: formBody({ ...favorableAnswers(), csrfToken: csrf }),
  })

  const history = await app.inject({
    method: 'GET',
    url: '/es/riesgo/historial',
    headers: { cookie },
  })
  assert.equal(history.statusCode, 200)
  assert.ok(history.body.includes('LEMD'))
  assert.ok(!history.body.includes('type="radio"'), 'history is read-only, no editable controls')
  await app.close()
})

test("a pilot cannot start an assessment against another pilot's flight intent", async () => {
  const app = await makeApp()
  const cookieA = await signUpPilot(app, 'a@example.com')
  const aircraftId = await addAircraft(app, cookieA)
  const location = await createFlightIntent(app, cookieA, aircraftId)
  const flightIntentPath = location.replace(/\/nuevo$/, '')

  const cookieB = await signUpPilot(app, 'b@example.com')
  const res = await app.inject({
    method: 'GET',
    url: `${flightIntentPath}/nuevo`,
    headers: { cookie: cookieB },
  })
  assert.equal(res.statusCode, 404)
  await app.close()
})

test('the full flow works end to end in every supported locale', async () => {
  const app = await makeApp()
  for (const locale of SUPPORTED_LOCALES) {
    const cookie = await signUpPilot(app, `pilot-${locale}@example.com`)

    const aircraftFormPage = await app.inject({
      method: 'GET',
      url: aircraftNewPath(locale),
      headers: { cookie },
    })
    const aircraftCsrf = csrfFrom(aircraftFormPage.body)
    const aircraftCreated = await app.inject({
      method: 'POST',
      url: aircraftNewPath(locale),
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      payload: formBody({
        registration: 'EC-ABC',
        icaoType: 'C172',
        manufacturer: 'Cessna',
        model: '172S',
        csrfToken: aircraftCsrf,
      }),
    })
    const aircraftId = new URL(
      aircraftCreated.headers.location as string,
      'http://x',
    ).searchParams.get('aircraft') as string

    const intentFormPage = await app.inject({
      method: 'GET',
      url: riskPath('flight-intent', locale, ['new']),
      headers: { cookie },
    })
    const intentCsrf = csrfFrom(intentFormPage.body)
    const intentCreated = await app.inject({
      method: 'POST',
      url: riskPath('flight-intent', locale, ['new']),
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      payload: formBody({
        aircraftId,
        plannedDate: '2026-12-01',
        departureIcao: 'LEMD',
        destinationIcao: 'LEBL',
        csrfToken: intentCsrf,
      }),
    })
    assert.equal(intentCreated.statusCode, 303, `${locale}: flight intent creation redirects`)
    const questionnaireUrl = intentCreated.headers.location as string

    const questionnairePage = await app.inject({
      method: 'GET',
      url: questionnaireUrl,
      headers: { cookie },
    })
    assert.equal(questionnairePage.statusCode, 200, `${locale}: questionnaire renders`)
    const questionnaireCsrf = csrfFrom(questionnairePage.body)
    const submitted = await app.inject({
      method: 'POST',
      url: questionnaireUrl,
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      payload: formBody({ ...favorableAnswers(), csrfToken: questionnaireCsrf }),
    })
    assert.equal(submitted.statusCode, 303, `${locale}: submission redirects to the result`)

    const result = await app.inject({
      method: 'GET',
      url: submitted.headers.location as string,
      headers: { cookie },
    })
    assert.equal(result.statusCode, 200, `${locale}: result renders`)

    const history = await app.inject({
      method: 'GET',
      url: riskPath('history', locale, []),
      headers: { cookie },
    })
    assert.equal(history.statusCode, 200, `${locale}: history renders`)
    assert.ok(history.body.includes('LEMD'), `${locale}: history shows the flight intent`)
  }
  await app.close()
})

test("a pilot cannot view another pilot's risk-assessment result", async () => {
  const app = await makeApp()
  const cookieA = await signUpPilot(app, 'a@example.com')
  const aircraftId = await addAircraft(app, cookieA)
  const location = await createFlightIntent(app, cookieA, aircraftId)
  const page = await app.inject({ method: 'GET', url: location, headers: { cookie: cookieA } })
  const csrf = csrfFrom(page.body)
  const submitted = await app.inject({
    method: 'POST',
    url: location,
    headers: { cookie: cookieA, 'content-type': 'application/x-www-form-urlencoded' },
    payload: formBody({ ...favorableAnswers(), csrfToken: csrf }),
  })
  const resultUrl = submitted.headers.location as string

  const cookieB = await signUpPilot(app, 'b@example.com')
  const res = await app.inject({ method: 'GET', url: resultUrl, headers: { cookie: cookieB } })
  assert.equal(res.statusCode, 404)
  await app.close()
})
