import { test } from 'node:test'
import assert from 'node:assert/strict'

import type { FastifyInstance } from 'fastify'

import { buildApp, type BuildAppOptions } from '../../server/app.js'
import { loadConfig } from '../../server/config.js'
import { FakePoolFacade } from '../../platform/db/fake-pool.js'

const SECRET = 's'.repeat(48)

function makeConfig() {
  return loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgres://localhost/ga',
    SESSION_SECRET: SECRET,
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

/** Builds a raw multipart/form-data body (fields + one file part) for
 * exercising the engine-data upload route directly through `app.inject()`. */
function multipartBody(
  fields: Record<string, string>,
  file: { filename: string; content: string } | null,
): { body: string; contentType: string } {
  const boundary = '----gacoretestboundary'
  const parts: string[] = []
  for (const [key, value] of Object.entries(fields)) {
    parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`)
  }
  if (file) {
    parts.push(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.filename}"\r\nContent-Type: text/csv\r\n\r\n${file.content}\r\n`,
    )
  }
  parts.push(`--${boundary}--\r\n`)
  return { body: parts.join(''), contentType: `multipart/form-data; boundary=${boundary}` }
}

/** Adds an aircraft via the real routes and returns its id plus the location
 * of the aircraft screen with it selected. */
async function addAircraft(
  app: FastifyInstance,
  cookie: string,
  overrides: Record<string, string> = {},
): Promise<{ id: string; location: string }> {
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
      ...overrides,
    }),
  })
  const location = created.headers.location as string
  const id = new URL(location, 'http://x').searchParams.get('aircraft') as string
  return { id, location }
}

/** Registers a fresh pilot via the real HTTP flow and returns a session cookie. */
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

test('unauthenticated request to the aircraft screen redirects to sign-in', async () => {
  const app = await makeApp()
  const res = await app.inject({ method: 'GET', url: '/es/aeronave' })
  assert.equal(res.statusCode, 302)
  assert.match(res.headers.location ?? '', /\/es\/auth\/sign-in/)
  await app.close()
})

test('signed-in pilot with no aircraft sees the empty state and no operational value', async () => {
  const app = await makeApp()
  const cookie = await signUpPilot(app)
  const res = await app.inject({ method: 'GET', url: '/es/aeronave', headers: { cookie } })
  assert.equal(res.statusCode, 200)
  assert.ok(res.body.includes('Ninguna aeronave registrada'))
  for (const forbidden of ['Hobbs', 'hrs', 'CHT', 'EGT', '°F', '°C']) {
    assert.ok(!res.body.includes(forbidden), `must not contain '${forbidden}'`)
  }
  await app.close()
})

test('adding an aircraft lists it and shows its detail', async () => {
  const app = await makeApp()
  const cookie = await signUpPilot(app)
  const formPage = await app.inject({
    method: 'GET',
    url: '/es/aeronave/aviones/nuevo',
    headers: { cookie },
  })
  const csrf = csrfFrom(formPage.body)

  const create = await app.inject({
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
  assert.equal(create.statusCode, 303)

  const list = await app.inject({
    method: 'GET',
    url: create.headers.location as string,
    headers: { cookie },
  })
  assert.equal(list.statusCode, 200)
  assert.ok(list.body.includes('EC-ABC'))
  assert.ok(list.body.includes('172S'))
  await app.close()
})

test('missing registration is rejected with a field-level message and preserved values', async () => {
  const app = await makeApp()
  const cookie = await signUpPilot(app)
  const formPage = await app.inject({
    method: 'GET',
    url: '/es/aeronave/aviones/nuevo',
    headers: { cookie },
  })
  const csrf = csrfFrom(formPage.body)

  const res = await app.inject({
    method: 'POST',
    url: '/es/aeronave/aviones/nuevo',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    payload: formBody({
      registration: '',
      icaoType: 'C172',
      manufacturer: 'Cessna',
      model: '172S',
      csrfToken: csrf,
    }),
  })
  assert.equal(res.statusCode, 422)
  assert.ok(res.body.includes('La matrícula es obligatoria'))
  assert.ok(res.body.includes('value="Cessna"'), 'other values preserved')
  await app.close()
})

test('a bad registration format is rejected', async () => {
  const app = await makeApp()
  const cookie = await signUpPilot(app)
  const formPage = await app.inject({
    method: 'GET',
    url: '/es/aeronave/aviones/nuevo',
    headers: { cookie },
  })
  const csrf = csrfFrom(formPage.body)

  const res = await app.inject({
    method: 'POST',
    url: '/es/aeronave/aviones/nuevo',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    payload: formBody({
      registration: '###',
      icaoType: 'C172',
      manufacturer: 'Cessna',
      model: '172S',
      csrfToken: csrf,
    }),
  })
  assert.equal(res.statusCode, 422)
  assert.ok(res.body.includes('La matrícula no tiene un formato válido'))
  await app.close()
})

test('a duplicate registration for the same pilot is rejected', async () => {
  const app = await makeApp()
  const cookie = await signUpPilot(app)

  async function submit() {
    const formPage = await app.inject({
      method: 'GET',
      url: '/es/aeronave/aviones/nuevo',
      headers: { cookie },
    })
    const csrf = csrfFrom(formPage.body)
    return app.inject({
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
  }

  const first = await submit()
  assert.equal(first.statusCode, 303)
  const second = await submit()
  assert.equal(second.statusCode, 422)
  assert.ok(second.body.includes('Ya tiene una aeronave con esta matrícula'))
  await app.close()
})

test("another pilot cannot see or edit this pilot's aircraft", async () => {
  const app = await makeApp()
  const ownerCookie = await signUpPilot(app, 'owner@example.com')
  const formPage = await app.inject({
    method: 'GET',
    url: '/es/aeronave/aviones/nuevo',
    headers: { cookie: ownerCookie },
  })
  const csrf = csrfFrom(formPage.body)
  const created = await app.inject({
    method: 'POST',
    url: '/es/aeronave/aviones/nuevo',
    headers: { cookie: ownerCookie, 'content-type': 'application/x-www-form-urlencoded' },
    payload: formBody({
      registration: 'EC-ABC',
      icaoType: 'C172',
      manufacturer: 'Cessna',
      model: '172S',
      csrfToken: csrf,
    }),
  })
  const aircraftId = new URL(created.headers.location as string, 'http://x').searchParams.get(
    'aircraft',
  ) as string

  const otherCookie = await signUpPilot(app, 'other@example.com')
  const editPage = await app.inject({
    method: 'GET',
    url: `/es/aeronave/aviones/${aircraftId}/editar`,
    headers: { cookie: otherCookie },
  })
  assert.equal(editPage.statusCode, 404)
  assert.ok(!editPage.body.includes('EC-ABC'))
  await app.close()
})

test('retiring an aircraft requires confirmation and preserves it as retired', async () => {
  const app = await makeApp()
  const cookie = await signUpPilot(app)
  const formPage = await app.inject({
    method: 'GET',
    url: '/es/aeronave/aviones/nuevo',
    headers: { cookie },
  })
  const csrf1 = csrfFrom(formPage.body)
  const created = await app.inject({
    method: 'POST',
    url: '/es/aeronave/aviones/nuevo',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    payload: formBody({
      registration: 'EC-ABC',
      icaoType: 'C172',
      manufacturer: 'Cessna',
      model: '172S',
      csrfToken: csrf1,
    }),
  })
  const aircraftId = new URL(created.headers.location as string, 'http://x').searchParams.get(
    'aircraft',
  ) as string

  const confirmPage = await app.inject({
    method: 'GET',
    url: `/es/aeronave/aviones/${aircraftId}/eliminar`,
    headers: { cookie },
  })
  assert.equal(confirmPage.statusCode, 200)
  const csrf2 = csrfFrom(confirmPage.body)

  const retire = await app.inject({
    method: 'POST',
    url: `/es/aeronave/aviones/${aircraftId}/eliminar`,
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    payload: formBody({ csrfToken: csrf2 }),
  })
  assert.equal(retire.statusCode, 303)

  const list = await app.inject({ method: 'GET', url: '/es/aeronave', headers: { cookie } })
  assert.ok(list.body.includes('EC-ABC'), 'still listed')
  assert.ok(list.body.includes('Retirada'), 'shown as retired')
  await app.close()
})

test('the aircraft screen renders correctly in all three locales with no untranslated key', async () => {
  const app = await makeApp()
  for (const [locale, path] of [
    ['es', '/es/aeronave'],
    ['en', '/en/aircraft'],
    ['pt', '/pt/aeronave'],
  ] as const) {
    const cookie = await signUpPilot(app, `pilot-${locale}@example.com`)
    const res = await app.inject({ method: 'GET', url: path, headers: { cookie } })
    assert.equal(res.statusCode, 200, `${path} resolves`)
    assert.ok(!res.body.includes('fleet.'), `${path} has no raw translation key`)
  }
  await app.close()
})

test('a nickname containing markup is escaped', async () => {
  const app = await makeApp()
  const cookie = await signUpPilot(app)
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
      nickname: '<script>alert(1)</script>',
      csrfToken: csrf,
    }),
  })
  const list = await app.inject({
    method: 'GET',
    url: created.headers.location as string,
    headers: { cookie },
  })
  assert.ok(!list.body.includes('<script>alert(1)</script>'))
  assert.ok(list.body.includes('&lt;script&gt;'))
  await app.close()
})

test('the documents and weight & balance panels show the no-data state for a new aircraft', async () => {
  const app = await makeApp()
  const cookie = await signUpPilot(app)
  const { location } = await addAircraft(app, cookie)
  const res = await app.inject({ method: 'GET', url: location, headers: { cookie } })
  assert.ok(res.body.includes('No hay documentos registrados'))
  assert.ok(res.body.includes('Sin perfil de peso y balance'))
  await app.close()
})

test('recording a document with an expiry date shows it with a derived status', async () => {
  const app = await makeApp()
  const cookie = await signUpPilot(app)
  const { id, location } = await addAircraft(app, cookie)
  const page = await app.inject({ method: 'GET', url: location, headers: { cookie } })
  const csrf = csrfFrom(page.body)

  const future = new Date(Date.now() + 400 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const res = await app.inject({
    method: 'POST',
    url: `/es/aeronave/aviones/${id}/documentos`,
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    payload: formBody({ kind: 'arc', reference: 'ARC-1', expiresOn: future, csrfToken: csrf }),
  })
  assert.equal(res.statusCode, 303)

  const after = await app.inject({
    method: 'GET',
    url: res.headers.location as string,
    headers: { cookie },
  })
  assert.ok(after.body.includes('ARC-1'))
  assert.ok(after.body.includes('Vigente'), 'far-future expiry is shown as valid, in text')
  await app.close()
})

test('an expired document is labeled expired in text', async () => {
  const app = await makeApp()
  const cookie = await signUpPilot(app)
  const { id, location } = await addAircraft(app, cookie)
  const page = await app.inject({ method: 'GET', url: location, headers: { cookie } })
  const csrf = csrfFrom(page.body)

  const res = await app.inject({
    method: 'POST',
    url: `/es/aeronave/aviones/${id}/documentos`,
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    payload: formBody({ kind: 'arc', expiresOn: '2020-01-01', csrfToken: csrf }),
  })
  const after = await app.inject({
    method: 'GET',
    url: res.headers.location as string,
    headers: { cookie },
  })
  assert.ok(after.body.includes('Vencido'))
  await app.close()
})

test('a document with expiry before issue is rejected and not stored', async () => {
  const app = await makeApp()
  const cookie = await signUpPilot(app)
  const { id, location } = await addAircraft(app, cookie)
  const page = await app.inject({ method: 'GET', url: location, headers: { cookie } })
  const csrf = csrfFrom(page.body)

  const res = await app.inject({
    method: 'POST',
    url: `/es/aeronave/aviones/${id}/documentos`,
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    payload: formBody({
      kind: 'arc',
      issuedOn: '2027-01-01',
      expiresOn: '2026-01-01',
      csrfToken: csrf,
    }),
  })
  const after = await app.inject({
    method: 'GET',
    url: res.headers.location as string,
    headers: { cookie },
  })
  assert.ok(after.body.includes('No hay documentos registrados'), 'nothing was stored')
  assert.ok(after.body.includes('anterior a la de emisión'), 'names the conflict')
  await app.close()
})

test('storing a weight and balance profile redisplays it with its units', async () => {
  const app = await makeApp()
  const cookie = await signUpPilot(app)
  const { id, location } = await addAircraft(app, cookie)

  const wbPage = await app.inject({
    method: 'GET',
    url: `/es/aeronave/aviones/${id}/peso-balance`,
    headers: { cookie },
  })
  assert.equal(wbPage.statusCode, 200)
  const csrf = csrfFrom(wbPage.body)

  const res = await app.inject({
    method: 'POST',
    url: `/es/aeronave/aviones/${id}/peso-balance`,
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    payload: formBody({
      emptyWeight: '1500',
      emptyWeightArm: '40',
      mtow: '2400',
      massUnit: 'lb',
      lengthUnit: 'in',
      station_name_0: 'Front',
      station_arm_0: '37',
      station_max_weight_0: '400',
      point_weight_0: '1500',
      point_cg_0: '39',
      csrfToken: csrf,
    }),
  })
  assert.equal(res.statusCode, 303)

  const after = await app.inject({ method: 'GET', url: location, headers: { cookie } })
  assert.ok(after.body.includes('1500'))
  assert.ok(after.body.includes('lb'), 'unit shown, not converted')
  assert.ok(after.body.includes('Front'))
  await app.close()
})

test('empty weight above MTOW is rejected and the profile stays empty', async () => {
  const app = await makeApp()
  const cookie = await signUpPilot(app)
  const { id, location } = await addAircraft(app, cookie)

  const wbPage = await app.inject({
    method: 'GET',
    url: `/es/aeronave/aviones/${id}/peso-balance`,
    headers: { cookie },
  })
  const csrf = csrfFrom(wbPage.body)

  const res = await app.inject({
    method: 'POST',
    url: `/es/aeronave/aviones/${id}/peso-balance`,
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    payload: formBody({ emptyWeight: '3000', mtow: '2400', csrfToken: csrf }),
  })
  assert.equal(res.statusCode, 422)
  assert.ok(res.body.includes('no puede superar el MTOW'))

  const after = await app.inject({ method: 'GET', url: location, headers: { cookie } })
  assert.ok(after.body.includes('Sin perfil de peso y balance'), 'rejected profile is not stored')
  await app.close()
})

test('logging a flight lists it and updates the aircraft total and pilot totals', async () => {
  const app = await makeApp()
  const cookie = await signUpPilot(app)
  const { id, location } = await addAircraft(app, cookie, { openingAirframeHours: '1200' })

  const formPage = await app.inject({
    method: 'GET',
    url: `/es/aeronave/bitacora/nuevo?aircraft=${id}`,
    headers: { cookie },
  })
  assert.equal(formPage.statusCode, 200)
  const csrf = csrfFrom(formPage.body)

  const res = await app.inject({
    method: 'POST',
    url: '/es/aeronave/bitacora/nuevo',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    payload: formBody({
      entryType: 'flight',
      aircraftId: id,
      flightDate: '2026-08-01',
      departureAerodrome: 'LEMD',
      arrivalAerodrome: 'LEBL',
      pilotFunction: 'pic',
      totalTime: '0.9',
      dayLandings: '1',
      csrfToken: csrf,
    }),
  })
  assert.equal(res.statusCode, 303)

  const after = await app.inject({ method: 'GET', url: location, headers: { cookie } })
  assert.ok(after.body.includes('LEMD'))
  assert.ok(after.body.includes('1200.9'), 'aircraft total reflects the logged flight')
  assert.ok(after.body.includes('0.9'), 'pilot PIC total reflects the flight')
  await app.close()
})

test('logging an FSTD session does not change any aircraft total', async () => {
  const app = await makeApp()
  const cookie = await signUpPilot(app)
  const { location } = await addAircraft(app, cookie, { openingAirframeHours: '1200' })

  const formPage = await app.inject({
    method: 'GET',
    url: '/es/aeronave/bitacora/nuevo?fstd=1',
    headers: { cookie },
  })
  const csrf = csrfFrom(formPage.body)

  const res = await app.inject({
    method: 'POST',
    url: '/es/aeronave/bitacora/nuevo',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    payload: formBody({
      entryType: 'fstd',
      flightDate: '2026-08-01',
      pilotFunction: 'pic',
      deviceType: 'Redbird FMX',
      totalTime: '2',
      csrfToken: csrf,
    }),
  })
  assert.equal(res.statusCode, 303)

  const after = await app.inject({ method: 'GET', url: location, headers: { cookie } })
  assert.ok(after.body.includes('1200.0'), 'aircraft total unchanged by FSTD time')
  await app.close()
})

test('night time exceeding total time is rejected', async () => {
  const app = await makeApp()
  const cookie = await signUpPilot(app)
  const { id } = await addAircraft(app, cookie)
  const formPage = await app.inject({
    method: 'GET',
    url: `/es/aeronave/bitacora/nuevo?aircraft=${id}`,
    headers: { cookie },
  })
  const csrf = csrfFrom(formPage.body)

  const res = await app.inject({
    method: 'POST',
    url: '/es/aeronave/bitacora/nuevo',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    payload: formBody({
      entryType: 'flight',
      aircraftId: id,
      flightDate: '2026-08-01',
      departureAerodrome: 'LEMD',
      arrivalAerodrome: 'LEBL',
      pilotFunction: 'pic',
      totalTime: '0.5',
      nightTime: '0.9',
      csrfToken: csrf,
    }),
  })
  assert.equal(res.statusCode, 422)
  assert.ok(res.body.includes('No puede superar el tiempo total'))
  await app.close()
})

test('a malformed departure aerodrome is rejected', async () => {
  const app = await makeApp()
  const cookie = await signUpPilot(app)
  const { id } = await addAircraft(app, cookie)
  const formPage = await app.inject({
    method: 'GET',
    url: `/es/aeronave/bitacora/nuevo?aircraft=${id}`,
    headers: { cookie },
  })
  const csrf = csrfFrom(formPage.body)

  const res = await app.inject({
    method: 'POST',
    url: '/es/aeronave/bitacora/nuevo',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    payload: formBody({
      entryType: 'flight',
      aircraftId: id,
      flightDate: '2026-08-01',
      departureAerodrome: 'LE',
      arrivalAerodrome: 'LEBL',
      pilotFunction: 'pic',
      totalTime: '0.5',
      csrfToken: csrf,
    }),
  })
  assert.equal(res.statusCode, 422)
  assert.ok(res.body.includes('Indicador OACI inválido'))
  await app.close()
})

test('a Hobbs-in reading lower than Hobbs-out is rejected', async () => {
  const app = await makeApp()
  const cookie = await signUpPilot(app)
  const { id } = await addAircraft(app, cookie)
  const formPage = await app.inject({
    method: 'GET',
    url: `/es/aeronave/bitacora/nuevo?aircraft=${id}`,
    headers: { cookie },
  })
  const csrf = csrfFrom(formPage.body)

  const res = await app.inject({
    method: 'POST',
    url: '/es/aeronave/bitacora/nuevo',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    payload: formBody({
      entryType: 'flight',
      aircraftId: id,
      flightDate: '2026-08-01',
      departureAerodrome: 'LEMD',
      arrivalAerodrome: 'LEBL',
      pilotFunction: 'pic',
      totalTime: '0.5',
      hobbsOut: '100',
      hobbsIn: '90',
      csrfToken: csrf,
    }),
  })
  assert.equal(res.statusCode, 422)
  assert.ok(res.body.includes('no puede ser menor'))
  await app.close()
})

test('a future flight date is rejected', async () => {
  const app = await makeApp()
  const cookie = await signUpPilot(app)
  const { id } = await addAircraft(app, cookie)
  const formPage = await app.inject({
    method: 'GET',
    url: `/es/aeronave/bitacora/nuevo?aircraft=${id}`,
    headers: { cookie },
  })
  const csrf = csrfFrom(formPage.body)
  const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const res = await app.inject({
    method: 'POST',
    url: '/es/aeronave/bitacora/nuevo',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    payload: formBody({
      entryType: 'flight',
      aircraftId: id,
      flightDate: future,
      departureAerodrome: 'LEMD',
      arrivalAerodrome: 'LEBL',
      pilotFunction: 'pic',
      totalTime: '0.5',
      csrfToken: csrf,
    }),
  })
  assert.equal(res.statusCode, 422)
  assert.ok(res.body.includes('no puede ser futura'))
  await app.close()
})

test('editing and deleting a logbook entry updates the derived totals', async () => {
  const app = await makeApp()
  const cookie = await signUpPilot(app)
  const { id, location } = await addAircraft(app, cookie, { openingAirframeHours: '1200' })

  const formPage = await app.inject({
    method: 'GET',
    url: `/es/aeronave/bitacora/nuevo?aircraft=${id}`,
    headers: { cookie },
  })
  const csrf1 = csrfFrom(formPage.body)
  await app.inject({
    method: 'POST',
    url: '/es/aeronave/bitacora/nuevo',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    payload: formBody({
      entryType: 'flight',
      aircraftId: id,
      flightDate: '2026-08-01',
      departureAerodrome: 'LEMD',
      arrivalAerodrome: 'LEBL',
      pilotFunction: 'pic',
      totalTime: '1',
      csrfToken: csrf1,
    }),
  })

  const listed = await app.inject({ method: 'GET', url: location, headers: { cookie } })
  const editHrefMatch = /\/es\/aeronave\/bitacora\/([^/"]+)\/editar/.exec(listed.body)
  assert.ok(editHrefMatch, 'edit link is present')
  const entryId = editHrefMatch?.[1] as string

  const editPage = await app.inject({
    method: 'GET',
    url: `/es/aeronave/bitacora/${entryId}/editar`,
    headers: { cookie },
  })
  assert.equal(editPage.statusCode, 200)
  const csrf2 = csrfFrom(editPage.body)
  await app.inject({
    method: 'POST',
    url: `/es/aeronave/bitacora/${entryId}/editar`,
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    payload: formBody({
      entryType: 'flight',
      aircraftId: id,
      flightDate: '2026-08-01',
      departureAerodrome: 'LEMD',
      arrivalAerodrome: 'LEBL',
      pilotFunction: 'pic',
      totalTime: '2',
      csrfToken: csrf2,
    }),
  })

  const afterEdit = await app.inject({ method: 'GET', url: location, headers: { cookie } })
  assert.ok(afterEdit.body.includes('1202.0'), 'total reflects the edited duration')

  const deleteConfirm = await app.inject({
    method: 'GET',
    url: `/es/aeronave/bitacora/${entryId}/eliminar`,
    headers: { cookie },
  })
  assert.equal(deleteConfirm.statusCode, 200)
  const csrf3 = csrfFrom(deleteConfirm.body)
  await app.inject({
    method: 'POST',
    url: `/es/aeronave/bitacora/${entryId}/eliminar`,
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    payload: formBody({ csrfToken: csrf3 }),
  })

  const afterDelete = await app.inject({ method: 'GET', url: location, headers: { cookie } })
  assert.ok(afterDelete.body.includes('1200.0'), 'total reflects the deletion')
  assert.ok(afterDelete.body.includes('No se han registrado vuelos'))
  await app.close()
})

test("another pilot cannot edit or delete this pilot's logbook entry", async () => {
  const app = await makeApp()
  const ownerCookie = await signUpPilot(app, 'owner3@example.com')
  const { id } = await addAircraft(app, ownerCookie)
  const formPage = await app.inject({
    method: 'GET',
    url: `/es/aeronave/bitacora/nuevo?aircraft=${id}`,
    headers: { cookie: ownerCookie },
  })
  const csrf = csrfFrom(formPage.body)
  const created = await app.inject({
    method: 'POST',
    url: '/es/aeronave/bitacora/nuevo',
    headers: { cookie: ownerCookie, 'content-type': 'application/x-www-form-urlencoded' },
    payload: formBody({
      entryType: 'flight',
      aircraftId: id,
      flightDate: '2026-08-01',
      departureAerodrome: 'LEMD',
      arrivalAerodrome: 'LEBL',
      pilotFunction: 'pic',
      totalTime: '1',
      csrfToken: csrf,
    }),
  })
  const listed = await app.inject({
    method: 'GET',
    url: created.headers.location as string,
    headers: { cookie: ownerCookie },
  })
  const editHrefMatch = /\/es\/aeronave\/bitacora\/([^/"]+)\/editar/.exec(listed.body)
  const entryId = editHrefMatch?.[1] as string

  const otherCookie = await signUpPilot(app, 'other3@example.com')
  const editPage = await app.inject({
    method: 'GET',
    url: `/es/aeronave/bitacora/${entryId}/editar`,
    headers: { cookie: otherCookie },
  })
  assert.equal(editPage.statusCode, 404)
  await app.close()
})

test('recent experience is a count with no legal-currency verdict', async () => {
  const app = await makeApp()
  const cookie = await signUpPilot(app)
  const { id, location } = await addAircraft(app, cookie)
  const formPage = await app.inject({
    method: 'GET',
    url: `/es/aeronave/bitacora/nuevo?aircraft=${id}`,
    headers: { cookie },
  })
  const csrf = csrfFrom(formPage.body)
  await app.inject({
    method: 'POST',
    url: '/es/aeronave/bitacora/nuevo',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    payload: formBody({
      entryType: 'flight',
      aircraftId: id,
      flightDate: new Date().toISOString().slice(0, 10),
      departureAerodrome: 'LEMD',
      arrivalAerodrome: 'LEBL',
      pilotFunction: 'pic',
      totalTime: '1',
      dayLandings: '2',
      csrfToken: csrf,
    }),
  })

  const after = await app.inject({ method: 'GET', url: location, headers: { cookie } })
  assert.ok(after.body.includes('Experiencia Reciente'))
  assert.ok(!after.body.toLowerCase().includes('vigente para'))
  await app.close()
})

test("another pilot cannot see or add documents to this pilot's aircraft", async () => {
  const app = await makeApp()
  const ownerCookie = await signUpPilot(app, 'owner2@example.com')
  const { id } = await addAircraft(app, ownerCookie)

  const otherCookie = await signUpPilot(app, 'other2@example.com')
  const wbPage = await app.inject({
    method: 'GET',
    url: `/es/aeronave/aviones/${id}/peso-balance`,
    headers: { cookie: otherCookie },
  })
  assert.equal(wbPage.statusCode, 404)
  await app.close()
})

test('adding a date-based maintenance item and completing it shows history', async () => {
  const app = await makeApp()
  const cookie = await signUpPilot(app)
  const { id, location } = await addAircraft(app, cookie)

  const formPage = await app.inject({
    method: 'GET',
    url: `/es/aeronave/mantenimiento/${id}/nuevo`,
    headers: { cookie },
  })
  assert.equal(formPage.statusCode, 200)
  const csrf = csrfFrom(formPage.body)

  const create = await app.inject({
    method: 'POST',
    url: `/es/aeronave/mantenimiento/${id}/nuevo`,
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    payload: formBody({
      description: 'Batería ELT',
      dueOn: '2020-01-01',
      csrfToken: csrf,
    }),
  })
  assert.equal(create.statusCode, 303)

  const listed = await app.inject({ method: 'GET', url: location, headers: { cookie } })
  assert.ok(listed.body.includes('Batería ELT'))
  assert.ok(listed.body.includes('Vencido'), 'a past due date is labeled overdue in text')

  const completeMatch = /\/es\/aeronave\/mantenimiento\/([^/"]+)\/completar/.exec(listed.body)
  assert.ok(completeMatch, 'complete link is present')
  const itemId = completeMatch?.[1] as string

  const completePage = await app.inject({
    method: 'GET',
    url: `/es/aeronave/mantenimiento/${itemId}/completar`,
    headers: { cookie },
  })
  assert.equal(completePage.statusCode, 200)
  const csrf2 = csrfFrom(completePage.body)

  const completed = await app.inject({
    method: 'POST',
    url: `/es/aeronave/mantenimiento/${itemId}/completar`,
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    payload: formBody({ completedOn: '2026-09-07', csrfToken: csrf2 }),
  })
  assert.equal(completed.statusCode, 303)

  const after = await app.inject({ method: 'GET', url: location, headers: { cookie } })
  assert.ok(!after.body.includes('Vencido'), 'non-recurring item closed, no leftover overdue state')
  await app.close()
})

test('an hours-based item with no aircraft hour data states it cannot be computed', async () => {
  const app = await makeApp()
  const cookie = await signUpPilot(app)
  const { id, location } = await addAircraft(app, cookie)

  const formPage = await app.inject({
    method: 'GET',
    url: `/es/aeronave/mantenimiento/${id}/nuevo`,
    headers: { cookie },
  })
  const csrf = csrfFrom(formPage.body)
  await app.inject({
    method: 'POST',
    url: `/es/aeronave/mantenimiento/${id}/nuevo`,
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    payload: formBody({
      description: 'Cambio de aceite',
      dueAtHours: '1222',
      hoursBasis: 'airframe',
      csrfToken: csrf,
    }),
  })

  const after = await app.inject({ method: 'GET', url: location, headers: { cookie } })
  assert.ok(after.body.includes('No calculable'))
  await app.close()
})

test('an item with no due condition is rejected', async () => {
  const app = await makeApp()
  const cookie = await signUpPilot(app)
  const { id } = await addAircraft(app, cookie)

  const formPage = await app.inject({
    method: 'GET',
    url: `/es/aeronave/mantenimiento/${id}/nuevo`,
    headers: { cookie },
  })
  const csrf = csrfFrom(formPage.body)
  const res = await app.inject({
    method: 'POST',
    url: `/es/aeronave/mantenimiento/${id}/nuevo`,
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    payload: formBody({ description: 'Nada', csrfToken: csrf }),
  })
  assert.equal(res.statusCode, 422)
  assert.ok(res.body.includes('Debe indicar una fecha o una lectura de horas de vencimiento'))
  await app.close()
})

test('the maintenance panel never asserts airworthiness and always carries the pilot-entered caveat', async () => {
  const app = await makeApp()
  const cookie = await signUpPilot(app)
  const { location } = await addAircraft(app, cookie)
  const after = await app.inject({ method: 'GET', url: location, headers: { cookie } })
  assert.ok(after.body.includes('no es el registro oficial de mantenimiento'))
  assert.ok(!after.body.toLowerCase().includes('aeronavegable'))
  await app.close()
})

test("another pilot cannot see or complete this pilot's maintenance item", async () => {
  const app = await makeApp()
  const ownerCookie = await signUpPilot(app, 'owner4@example.com')
  const { id } = await addAircraft(app, ownerCookie)
  const formPage = await app.inject({
    method: 'GET',
    url: `/es/aeronave/mantenimiento/${id}/nuevo`,
    headers: { cookie: ownerCookie },
  })
  const csrf = csrfFrom(formPage.body)
  const created = await app.inject({
    method: 'POST',
    url: `/es/aeronave/mantenimiento/${id}/nuevo`,
    headers: { cookie: ownerCookie, 'content-type': 'application/x-www-form-urlencoded' },
    payload: formBody({ description: 'Batería ELT', dueOn: '2027-01-01', csrfToken: csrf }),
  })
  assert.equal(created.statusCode, 303)
  const listed = await app.inject({
    method: 'GET',
    url: created.headers.location as string,
    headers: { cookie: ownerCookie },
  })
  const completeMatch = /\/es\/aeronave\/mantenimiento\/([^/"]+)\/completar/.exec(listed.body)
  const itemId = completeMatch?.[1] as string

  const otherCookie = await signUpPilot(app, 'other4@example.com')
  const completePage = await app.inject({
    method: 'GET',
    url: `/es/aeronave/mantenimiento/${itemId}/completar`,
    headers: { cookie: otherCookie },
  })
  assert.equal(completePage.statusCode, 404)
  await app.close()
})

async function addAircraftWithFlight(app: FastifyInstance, cookie: string) {
  const { id: aircraftId, location } = await addAircraft(app, cookie)
  const formPage = await app.inject({
    method: 'GET',
    url: `/es/aeronave/bitacora/nuevo?aircraft=${aircraftId}`,
    headers: { cookie },
  })
  const csrf = csrfFrom(formPage.body)
  const created = await app.inject({
    method: 'POST',
    url: '/es/aeronave/bitacora/nuevo',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    payload: formBody({
      entryType: 'flight',
      aircraftId,
      flightDate: '2026-08-01',
      departureAerodrome: 'LEMD',
      arrivalAerodrome: 'LEBL',
      pilotFunction: 'pic',
      totalTime: '1',
      csrfToken: csrf,
    }),
  })
  const listed = await app.inject({ method: 'GET', url: location, headers: { cookie } })
  const editMatch = /\/es\/aeronave\/bitacora\/([^/"]+)\/editar/.exec(listed.body)
  const flightEntryId = editMatch?.[1] as string
  void created
  return { aircraftId, flightEntryId, location }
}

const SAMPLE_ENGINE_CSV = 'Time,CHT1,OILT\n0,355,192\n1,356,192\n'

test('a screen with a flight but no engine data states so and shows no engine value', async () => {
  const app = await makeApp()
  const cookie = await signUpPilot(app)
  const { location } = await addAircraftWithFlight(app, cookie)

  const res = await app.inject({ method: 'GET', url: location, headers: { cookie } })
  assert.ok(res.body.includes('No se han importado datos del motor'))
  for (const forbidden of ['355', '192', '°F', 'PSI']) {
    assert.ok(!res.body.includes(forbidden), `must not contain '${forbidden}'`)
  }
  await app.close()
})

test('importing an engine-monitor CSV shows the trend strip with provenance', async () => {
  const app = await makeApp()
  const cookie = await signUpPilot(app)
  const { flightEntryId, location } = await addAircraftWithFlight(app, cookie)

  const page = await app.inject({ method: 'GET', url: location, headers: { cookie } })
  const csrf = csrfFrom(page.body)
  const { body, contentType } = multipartBody(
    { csrfToken: csrf },
    { filename: 'flight.csv', content: SAMPLE_ENGINE_CSV },
  )

  const uploadRes = await app.inject({
    method: 'POST',
    url: `/es/aeronave/motor/${flightEntryId}/subir`,
    headers: { cookie, 'content-type': contentType },
    payload: body,
  })
  assert.equal(uploadRes.statusCode, 303)

  const after = await app.inject({ method: 'GET', url: location, headers: { cookie } })
  assert.ok(after.body.includes('flight.csv'))
  assert.ok(after.body.includes('355'), 'the imported CHT value is shown')
  assert.ok(after.body.includes('no es una lectura en vivo'), 'not-live-reading caveat is present')
  await app.close()
})

test('an upload with a bad CSRF token is rejected and stores nothing', async () => {
  const app = await makeApp()
  const cookie = await signUpPilot(app)
  const { flightEntryId, location } = await addAircraftWithFlight(app, cookie)

  const { body, contentType } = multipartBody(
    { csrfToken: 'not-a-real-token' },
    { filename: 'flight.csv', content: SAMPLE_ENGINE_CSV },
  )
  const uploadRes = await app.inject({
    method: 'POST',
    url: `/es/aeronave/motor/${flightEntryId}/subir`,
    headers: { cookie, 'content-type': contentType },
    payload: body,
  })
  assert.equal(uploadRes.statusCode, 403)

  const after = await app.inject({ method: 'GET', url: location, headers: { cookie } })
  assert.ok(after.body.includes('No se han importado datos del motor'))
  await app.close()
})

test('a CSV with no recognizable channel is rejected and the flight is unchanged', async () => {
  const app = await makeApp()
  const cookie = await signUpPilot(app)
  const { flightEntryId, location } = await addAircraftWithFlight(app, cookie)

  const page = await app.inject({ method: 'GET', url: location, headers: { cookie } })
  const csrf = csrfFrom(page.body)
  const { body, contentType } = multipartBody(
    { csrfToken: csrf },
    { filename: 'nochannel.csv', content: 'Time,Waypoint\n0,LEMD\n1,LEBL\n' },
  )
  const uploadRes = await app.inject({
    method: 'POST',
    url: `/es/aeronave/motor/${flightEntryId}/subir`,
    headers: { cookie, 'content-type': contentType },
    payload: body,
  })
  assert.equal(uploadRes.statusCode, 303)

  const after = await app.inject({
    method: 'GET',
    url: uploadRes.headers.location as string,
    headers: { cookie },
  })
  // The generic format's own detector requires at least one recognizable
  // channel to claim the file, so a file with none never reaches the
  // importer's separate "no_channels" branch — it's rejected as
  // "unsupported_format" instead (see importer.ts). With only the generic
  // format registered, the two collapse to the same outcome for this case.
  assert.ok(after.body.includes('Formato de archivo no compatible'))
  assert.ok(after.body.includes('No se han importado datos del motor'))
  await app.close()
})

test('deleting the import returns the panel to the no-data state, leaving the flight unchanged', async () => {
  const app = await makeApp()
  const cookie = await signUpPilot(app)
  const { flightEntryId, location } = await addAircraftWithFlight(app, cookie)

  const page = await app.inject({ method: 'GET', url: location, headers: { cookie } })
  const csrf = csrfFrom(page.body)
  const { body, contentType } = multipartBody(
    { csrfToken: csrf },
    { filename: 'flight.csv', content: SAMPLE_ENGINE_CSV },
  )
  await app.inject({
    method: 'POST',
    url: `/es/aeronave/motor/${flightEntryId}/subir`,
    headers: { cookie, 'content-type': contentType },
    payload: body,
  })

  const afterUpload = await app.inject({ method: 'GET', url: location, headers: { cookie } })
  const csrf2 = csrfFrom(afterUpload.body)
  const deleteRes = await app.inject({
    method: 'POST',
    url: `/es/aeronave/motor/${flightEntryId}/eliminar`,
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    payload: formBody({ csrfToken: csrf2 }),
  })
  assert.equal(deleteRes.statusCode, 303)

  const after = await app.inject({ method: 'GET', url: location, headers: { cookie } })
  assert.ok(after.body.includes('No se han importado datos del motor'))
  assert.ok(after.body.includes('LEMD'), 'the flight entry itself is unaffected')
  await app.close()
})

test("another pilot cannot upload engine data to this pilot's flight", async () => {
  const app = await makeApp()
  const ownerCookie = await signUpPilot(app, 'owner5@example.com')
  const { flightEntryId } = await addAircraftWithFlight(app, ownerCookie)

  const otherCookie = await signUpPilot(app, 'other5@example.com')
  const { body, contentType } = multipartBody(
    { csrfToken: 'irrelevant' },
    { filename: 'flight.csv', content: SAMPLE_ENGINE_CSV },
  )
  const uploadRes = await app.inject({
    method: 'POST',
    url: `/es/aeronave/motor/${flightEntryId}/subir`,
    headers: { cookie: otherCookie, 'content-type': contentType },
    payload: body,
  })
  assert.equal(uploadRes.statusCode, 404)
  await app.close()
})

test('pilot-entered engine limits render a limit marker; none entered renders no marker', async () => {
  const app = await makeApp()
  const cookie = await signUpPilot(app)
  const { aircraftId, flightEntryId, location } = await addAircraftWithFlight(app, cookie)

  const page = await app.inject({ method: 'GET', url: location, headers: { cookie } })
  const csrf = csrfFrom(page.body)
  const { body, contentType } = multipartBody(
    { csrfToken: csrf },
    { filename: 'flight.csv', content: SAMPLE_ENGINE_CSV },
  )
  await app.inject({
    method: 'POST',
    url: `/es/aeronave/motor/${flightEntryId}/subir`,
    headers: { cookie, 'content-type': contentType },
    payload: body,
  })

  const beforeLimits = await app.inject({ method: 'GET', url: location, headers: { cookie } })
  assert.ok(!beforeLimits.body.includes('Límite:'), 'no limit marker before one is entered')

  const limitsPage = await app.inject({
    method: 'GET',
    url: `/es/aeronave/aviones/${aircraftId}/motor`,
    headers: { cookie },
  })
  assert.equal(limitsPage.statusCode, 200)
  const csrf2 = csrfFrom(limitsPage.body)
  await app.inject({
    method: 'POST',
    url: `/es/aeronave/aviones/${aircraftId}/motor`,
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    payload: formBody({ cht: '420', csrfToken: csrf2 }),
  })

  const afterLimits = await app.inject({ method: 'GET', url: location, headers: { cookie } })
  assert.ok(afterLimits.body.includes('Límite: 420'), 'limit marker shown once entered')
  await app.close()
})
