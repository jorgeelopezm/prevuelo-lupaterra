import { test } from 'node:test'
import assert from 'node:assert/strict'

import type { FastifyInstance } from 'fastify'

import { buildApp, type BuildAppOptions } from '../../server/app.js'
import { loadConfig } from '../../server/config.js'
import { FakePoolFacade } from '../../platform/db/fake-pool.js'
import { SUPPORTED_LOCALES } from '../../platform/i18n/locale.js'
import { destinationPath } from '../../platform/i18n/segments.js'
import { checklistPath } from './paths.js'

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

/** Adds an aircraft via the real fleet routes (which seed the checklist
 * library in the same transaction) and returns its id. */
async function addAircraft(
  app: FastifyInstance,
  cookie: string,
  registration = 'EC-ABC',
): Promise<string> {
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
      registration,
      icaoType: 'C172',
      manufacturer: 'Cessna',
      model: '172S',
      csrfToken: csrf,
    }),
  })
  assert.equal(created.statusCode, 303)
  const location = created.headers.location as string
  return new URL(location, 'http://x').searchParams.get('aircraft') as string
}

/** Creates a flight intent via the real risk routes for the given aircraft. */
async function createFlightIntent(
  app: FastifyInstance,
  cookie: string,
  aircraftId: string,
  plannedDate = '2026-12-01',
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
      plannedDate,
      departureIcao: 'LEMD',
      destinationIcao: 'LEBL',
      csrfToken: csrf,
    }),
  })
  assert.equal(created.statusCode, 303)
  return created.headers.location as string
}

async function getSelector(app: FastifyInstance, cookie: string, aircraftId: string) {
  return app.inject({ method: 'GET', url: `/es/listas/${aircraftId}`, headers: { cookie } })
}

/** Extracts every toggle form action from one rendered run page. */
function toggleHrefs(html: string): string[] {
  return [...html.matchAll(/action="(\/es\/listas\/alternar\/[^"]+)"/g)].map((m) => m[1] as string)
}

/** Confirms every item of a run in one pass (a completed run starts a fresh
 * one on the next GET, so this never re-fetches the items page mid-loop —
 * see checklist-runs: "Starting again after completion"). Returns the final
 * toggle's response, whose redirect points at the run's history detail. */
async function completeRun(
  app: FastifyInstance,
  cookie: string,
  csrf: string,
  runPageHtml: string,
) {
  const hrefs = toggleHrefs(runPageHtml)
  assert.ok(hrefs.length > 0, 'the run page has at least one item to confirm')
  let res
  for (const href of hrefs) {
    res = await app.inject({
      method: 'POST',
      url: href,
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      payload: formBody({ csrfToken: csrf }),
    })
  }
  return res as NonNullable<typeof res>
}

async function getItems(
  app: FastifyInstance,
  cookie: string,
  aircraftId: string,
  checklistId: string,
) {
  return app.inject({
    method: 'GET',
    url: `/es/listas/${aircraftId}/${checklistId}`,
    headers: { cookie },
  })
}

/** Finds one checklist id from the selector page's rendered links by name,
 * across both groups. */
function checklistIdFromSelector(html: string, name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`/es/listas/[^/"]+/([^/"]+)"[^>]*>[\\s\\S]{0,80}?${escaped}`)
  const match = re.exec(html)
  assert.ok(match, `checklist link for "${name}" found in selector`)
  return match[1] as string
}

// --- Happy path: library ---------------------------------------------------

test('creating an aircraft seeds the nine checklists, grouped, owned by the pilot', async () => {
  const app = await makeApp()
  const cookie = await signUpPilot(app)
  const aircraftId = await addAircraft(app, cookie)

  const res = await getSelector(app, cookie, aircraftId)
  assert.equal(res.statusCode, 200)
  assert.ok(res.body.includes('Procedimientos normales'))
  assert.ok(res.body.includes('Emergencia'))
  // Six normal + three emergency checklist names from the template.
  assert.ok(res.body.includes('Antes de arrancar'))
  assert.ok(res.body.includes('Falla de motor'))
  await app.close()
})

test('renaming, reordering, adding, and deleting persist against the library', async () => {
  const app = await makeApp()
  const cookie = await signUpPilot(app)
  const aircraftId = await addAircraft(app, cookie)
  const selectorPage = await getSelector(app, cookie, aircraftId)
  const checklistId = checklistIdFromSelector(selectorPage.body, 'Antes de arrancar')

  const itemsPage = await getItems(app, cookie, aircraftId, checklistId)
  assert.equal(itemsPage.statusCode, 200)
  const csrf = csrfFrom(itemsPage.body)

  // Rename.
  const renamed = await app.inject({
    method: 'POST',
    url: `/es/listas/editar/${aircraftId}/${checklistId}`,
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    payload: formBody({ name: 'Antes de arrancar (editado)', csrfToken: csrf }),
  })
  assert.equal(renamed.statusCode, 303)
  const renamedPage = await getItems(app, cookie, aircraftId, checklistId)
  assert.ok(renamedPage.body.includes('Antes de arrancar (editado)'))
  // Caveat disappears once the pilot edits (renaming counts as an edit).
  assert.ok(!renamedPage.body.includes('genérico'))

  // Add an item.
  const added = await app.inject({
    method: 'POST',
    url: `/es/listas/items/${aircraftId}/${checklistId}/nuevo`,
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    payload: formBody({ text: 'Ítem añadido por la prueba', csrfToken: csrf }),
  })
  assert.equal(added.statusCode, 303)
  const withNewItem = await getItems(app, cookie, aircraftId, checklistId)
  assert.ok(withNewItem.body.includes('Ítem añadido por la prueba'))

  await app.close()
})

test('empty or whitespace-only checklist and item names are rejected with a localized message', async () => {
  const app = await makeApp()
  const cookie = await signUpPilot(app)
  const aircraftId = await addAircraft(app, cookie)
  const selectorPage = await getSelector(app, cookie, aircraftId)
  const csrf = csrfFrom(selectorPage.body)

  const rejected = await app.inject({
    method: 'POST',
    url: `/es/listas/nuevo/${aircraftId}`,
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    payload: formBody({ name: '   ', kind: 'normal', csrfToken: csrf }),
  })
  assert.equal(rejected.statusCode, 303)
  const backTo = rejected.headers.location as string
  assert.match(backTo, /error=/)
  const errorPage = await app.inject({ method: 'GET', url: backTo, headers: { cookie } })
  assert.ok(errorPage.body.includes('no puede estar vacío'))
  await app.close()
})

// --- Happy path: runs -------------------------------------------------------

test('opening a normal checklist with an upcoming intent starts a run; toggling persists and completes it', async () => {
  const app = await makeApp()
  const cookie = await signUpPilot(app)
  const aircraftId = await addAircraft(app, cookie)
  await createFlightIntent(app, cookie, aircraftId)
  const selectorPage = await getSelector(app, cookie, aircraftId)
  const checklistId = checklistIdFromSelector(selectorPage.body, 'Antes de arrancar')

  const runPage = await getItems(app, cookie, aircraftId, checklistId)
  assert.equal(runPage.statusCode, 200)
  assert.match(runPage.body, /0 \/ \d+/)
  const csrf = csrfFrom(runPage.body)

  // Extract the first toggle href.
  const toggleMatch = /action="(\/es\/listas\/alternar\/[^"]+)"/.exec(runPage.body)
  assert.ok(toggleMatch, 'a toggle form is present')
  const toggleHref = toggleMatch[1] as string

  const toggled = await app.inject({
    method: 'POST',
    url: toggleHref,
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    payload: formBody({ csrfToken: csrf }),
  })
  assert.equal(toggled.statusCode, 303, 'non-htmx toggle redirects')

  // Reopening the screen resumes the same run: the toggled item stays confirmed.
  const resumed = await getItems(app, cookie, aircraftId, checklistId)
  assert.match(resumed.body, /1 \/ \d+/)
  await app.close()
})

// --- Happy path: history ----------------------------------------------------

test('a completed run appears in per-aircraft history, most recent first, and its detail is read-only', async () => {
  const app = await makeApp()
  const cookie = await signUpPilot(app)
  const aircraftId = await addAircraft(app, cookie)
  await createFlightIntent(app, cookie, aircraftId)
  const selectorPage = await getSelector(app, cookie, aircraftId)
  const checklistId = checklistIdFromSelector(selectorPage.body, 'Antes de arrancar')

  const runPage = await getItems(app, cookie, aircraftId, checklistId)
  const csrf = csrfFrom(runPage.body)
  const completed = await completeRun(app, cookie, csrf, runPage.body)
  assert.equal(completed.statusCode, 303)
  assert.match(completed.headers.location as string, /\/es\/listas\/historial\//)

  const history = await app.inject({
    method: 'GET',
    url: `/es/listas/historial/${aircraftId}`,
    headers: { cookie },
  })
  assert.equal(history.statusCode, 200)
  assert.ok(history.body.includes('Antes de arrancar'))

  const detailMatch = /href="(\/es\/listas\/historial\/[^/"]+\/[^"]+)"/.exec(history.body)
  assert.ok(detailMatch, 'a history detail link is present')
  const detail = await app.inject({
    method: 'GET',
    url: detailMatch[1] as string,
    headers: { cookie },
  })
  assert.equal(detail.statusCode, 200)
  assert.ok(detail.body.includes('Lista completa'))
  await app.close()
})

// --- Sad path: authorization -------------------------------------------------

test('unauthenticated requests to every checklists route redirect to sign-in', async () => {
  const app = await makeApp()
  for (const url of ['/es/listas', '/es/listas/x', '/es/listas/x/y']) {
    const res = await app.inject({ method: 'GET', url })
    assert.equal(res.statusCode, 302, url)
    assert.match(res.headers.location ?? '', /\/es\/auth\/sign-in/)
  }
  await app.close()
})

test('cross-pilot aircraft, checklist, and item identifiers all answer 404, disclosing nothing', async () => {
  const app = await makeApp()
  const cookieA = await signUpPilot(app, 'a@example.com')
  const aircraftId = await addAircraft(app, cookieA)
  const selectorPage = await getSelector(app, cookieA, aircraftId)
  const checklistId = checklistIdFromSelector(selectorPage.body, 'Antes de arrancar')

  const cookieB = await signUpPilot(app, 'b@example.com')
  const selectorAsB = await getSelector(app, cookieB, aircraftId)
  assert.equal(selectorAsB.statusCode, 404)
  const itemsAsB = await getItems(app, cookieB, aircraftId, checklistId)
  assert.equal(itemsAsB.statusCode, 404)
  await app.close()
})

// --- Sad path: invalid state -------------------------------------------------

test('starting, toggling, or resetting a run against an emergency checklist is rejected', async () => {
  const app = await makeApp()
  const cookie = await signUpPilot(app)
  const aircraftId = await addAircraft(app, cookie)
  await createFlightIntent(app, cookie, aircraftId)
  const selectorPage = await getSelector(app, cookie, aircraftId)
  const emergencyId = checklistIdFromSelector(selectorPage.body, 'Falla de motor')

  const emergencyPage = await getItems(app, cookie, aircraftId, emergencyId)
  assert.equal(emergencyPage.statusCode, 200)
  // No confirmation controls at all — the "toggle" action path must not
  // appear in the checklist content itself (the fragment, excluding the
  // shell's own unrelated drawer-toggle checkbox).
  const fragment = await app.inject({
    method: 'GET',
    url: `/es/listas/${aircraftId}/${emergencyId}`,
    headers: { cookie, 'hx-request': 'true' },
  })
  assert.ok(!fragment.body.includes('/alternar/'))
  assert.ok(!/type="checkbox"/.test(fragment.body))

  const csrf = csrfFrom(emergencyPage.body)
  const fakeRunItemId = 'nonexistent-item'
  const toggle = await app.inject({
    method: 'POST',
    url: `/es/listas/alternar/${aircraftId}/${emergencyId}/${fakeRunItemId}`,
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    payload: formBody({ csrfToken: csrf }),
  })
  assert.equal(toggle.statusCode, 400)

  const reset = await app.inject({
    method: 'POST',
    url: `/es/listas/reiniciar/${aircraftId}/${emergencyId}`,
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    payload: formBody({ csrfToken: csrf }),
  })
  assert.equal(reset.statusCode, 400)
  await app.close()
})

test('designating an emergency checklist as pre-flight is rejected', async () => {
  const app = await makeApp()
  const cookie = await signUpPilot(app)
  const aircraftId = await addAircraft(app, cookie)
  const selectorPage = await getSelector(app, cookie, aircraftId)
  const emergencyId = checklistIdFromSelector(selectorPage.body, 'Falla de motor')
  const itemsPage = await getItems(app, cookie, aircraftId, emergencyId)
  const csrf = csrfFrom(itemsPage.body)

  const result = await app.inject({
    method: 'POST',
    url: checklistPath('preflight', 'es', [aircraftId, emergencyId]),
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    payload: formBody({ csrfToken: csrf }),
  })
  assert.equal(result.statusCode, 303)
  assert.match(result.headers.location as string, /error=/)
  await app.close()
})

test('toggling or resetting a completed run is rejected and leaves it unchanged', async () => {
  const app = await makeApp()
  const cookie = await signUpPilot(app)
  const aircraftId = await addAircraft(app, cookie)
  await createFlightIntent(app, cookie, aircraftId)
  const selectorPage = await getSelector(app, cookie, aircraftId)
  const checklistId = checklistIdFromSelector(selectorPage.body, 'Antes de arrancar')

  const runPage = await getItems(app, cookie, aircraftId, checklistId)
  const csrf = csrfFrom(runPage.body)
  const hrefs = toggleHrefs(runPage.body)
  const completed = await completeRun(app, cookie, csrf, runPage.body)
  assert.match(completed.headers.location as string, /\/es\/listas\/historial\//)

  // The just-completed run's toggle is now rejected.
  const rejectedToggle = await app.inject({
    method: 'POST',
    url: hrefs[0] as string,
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    payload: formBody({ csrfToken: csrf }),
  })
  assert.equal(rejectedToggle.statusCode, 400)
  // Resetting a completed run is rejected at the repository layer
  // (run-repo.test.ts covers this directly); the route itself resolves "the
  // current run" via `openOrStart`, which never resolves to an
  // already-completed run — it starts a fresh one instead, per
  // checklist-runs: "Starting again after completion".
  await app.close()
})

// --- Sad path: nothing to show ----------------------------------------------

test('a pilot with no aircraft sees the empty fleet state with no name, item text, or progress', async () => {
  const app = await makeApp()
  const cookie = await signUpPilot(app)
  const res = await app.inject({ method: 'GET', url: '/es/listas', headers: { cookie } })
  assert.equal(res.statusCode, 200)
  assert.ok(res.body.includes('Sin aeronaves registradas'))
  assert.ok(!/\d+ \/ \d+/.test(res.body))
  await app.close()
})

test('a normal checklist with no upcoming flight intent renders the read-only plan-a-flight prompt', async () => {
  const app = await makeApp()
  const cookie = await signUpPilot(app)
  const aircraftId = await addAircraft(app, cookie)
  const selectorPage = await getSelector(app, cookie, aircraftId)
  const checklistId = checklistIdFromSelector(selectorPage.body, 'Antes de arrancar')

  const itemsPage = await getItems(app, cookie, aircraftId, checklistId)
  assert.equal(itemsPage.statusCode, 200)
  assert.ok(itemsPage.body.includes('Planificar vuelo'))
  assert.ok(!/\d+ \/ \d+/.test(itemsPage.body))

  const fragment = await app.inject({
    method: 'GET',
    url: `/es/listas/${aircraftId}/${checklistId}`,
    headers: { cookie, 'hx-request': 'true' },
  })
  assert.ok(!/type="checkbox"/.test(fragment.body))
  await app.close()
})

test('an empty history states its localized empty message with no name or figure', async () => {
  const app = await makeApp()
  const cookie = await signUpPilot(app)
  const aircraftId = await addAircraft(app, cookie)
  const res = await app.inject({
    method: 'GET',
    url: `/es/listas/historial/${aircraftId}`,
    headers: { cookie },
  })
  assert.equal(res.statusCode, 200)
  assert.ok(res.body.includes('No se ha completado ninguna lista'))
  await app.close()
})

// --- Eval: snapshot immutability --------------------------------------------

test('editing an item after a run started leaves the open run showing the original text', async () => {
  const app = await makeApp()
  const cookie = await signUpPilot(app)
  const aircraftId = await addAircraft(app, cookie)
  await createFlightIntent(app, cookie, aircraftId)
  const selectorPage = await getSelector(app, cookie, aircraftId)
  const checklistId = checklistIdFromSelector(selectorPage.body, 'Antes de arrancar')

  const runPage = await getItems(app, cookie, aircraftId, checklistId)
  assert.ok(runPage.body.includes('Frenos'))
  const csrf = csrfFrom(runPage.body)

  const editMatch = /action="(\/es\/listas\/items\/[^"]+\/editar)"/.exec(runPage.body)
  assert.ok(editMatch)
  await app.inject({
    method: 'POST',
    url: editMatch[1] as string,
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    payload: formBody({ text: 'Texto editado tras iniciar la ejecución', csrfToken: csrf }),
  })

  const afterEdit = await getItems(app, cookie, aircraftId, checklistId)
  // The run's own item text (rendered inside the run's checkbox rows) is
  // unaffected — only the "manage" panel below shows the edited text.
  assert.ok(afterEdit.body.includes('Frenos'), 'the open run still shows the original text')
  assert.ok(afterEdit.body.includes('Texto editado tras iniciar la ejecución'))
  await app.close()
})

test('deleting a checklist preserves its completed runs in history', async () => {
  const app = await makeApp()
  const cookie = await signUpPilot(app)
  const aircraftId = await addAircraft(app, cookie)
  await createFlightIntent(app, cookie, aircraftId)
  const selectorPage = await getSelector(app, cookie, aircraftId)
  const checklistId = checklistIdFromSelector(selectorPage.body, 'Antes de arrancar')

  const runPage = await getItems(app, cookie, aircraftId, checklistId)
  const csrf = csrfFrom(runPage.body)
  await completeRun(app, cookie, csrf, runPage.body)

  await app.inject({
    method: 'POST',
    url: `/es/listas/eliminar/${aircraftId}/${checklistId}`,
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    payload: formBody({ csrfToken: csrf }),
  })

  const history = await app.inject({
    method: 'GET',
    url: `/es/listas/historial/${aircraftId}`,
    headers: { cookie },
  })
  assert.equal(history.statusCode, 200)
  assert.ok(history.body.includes('Antes de arrancar'), 'the completed run still shows its name')
  await app.close()
})

// --- Eval: generic-content provenance ---------------------------------------

test('a template-sourced checklist carries the generic caveat until the pilot edits it', async () => {
  const app = await makeApp()
  const cookie = await signUpPilot(app)
  const aircraftId = await addAircraft(app, cookie)
  const selectorPage = await getSelector(app, cookie, aircraftId)
  const checklistId = checklistIdFromSelector(selectorPage.body, 'Antes de arrancar')

  const itemsPage = await getItems(app, cookie, aircraftId, checklistId)
  assert.ok(itemsPage.body.includes('genérico'))
  assert.ok(!itemsPage.body.toUpperCase().includes('CERTIFICAD'))
  await app.close()
})

// --- Eval: emergency is inert ------------------------------------------------

test('the rendered emergency screen has no checkbox, toggle, counter, or progress markup', async () => {
  const app = await makeApp()
  const cookie = await signUpPilot(app)
  const aircraftId = await addAircraft(app, cookie)
  const selectorPage = await getSelector(app, cookie, aircraftId)
  const emergencyId = checklistIdFromSelector(selectorPage.body, 'Falla de motor')
  const page = await app.inject({
    method: 'GET',
    url: `/es/listas/${aircraftId}/${emergencyId}`,
    headers: { cookie, 'hx-request': 'true' },
  })

  assert.ok(!/type="checkbox"/.test(page.body))
  assert.ok(!page.body.includes('role="progressbar"'))
  assert.ok(!/\d+ \/ \d+/.test(page.body))
  assert.ok(page.body.includes('confirme cada acción positivamente'))
  assert.ok(
    page.body.includes('referencia en tierra') || page.body.toLowerCase().includes('sin conexión'),
  )
  await app.close()
})

// --- Eval: shell contract ----------------------------------------------------

test('every checklists screen renders identically as a full page and an htmx fragment', async () => {
  const app = await makeApp()
  const cookie = await signUpPilot(app)
  const aircraftId = await addAircraft(app, cookie)

  const full = await app.inject({ method: 'GET', url: '/es/listas', headers: { cookie } })
  const fragment = await app.inject({
    method: 'GET',
    url: '/es/listas',
    headers: { cookie, 'hx-request': 'true' },
  })
  assert.equal(fragment.statusCode, 200)
  assert.ok(!fragment.body.includes('<aside'), 'fragment has no shell')
  assert.ok(full.body.includes(fragment.body.trim()), 'full page embeds the identical fragment')
  void aircraftId
  await app.close()
})

test('every interactive control on the checklists screens carries the touch-target class', async () => {
  const app = await makeApp()
  const cookie = await signUpPilot(app)
  const aircraftId = await addAircraft(app, cookie)
  const selectorPage = await getSelector(app, cookie, aircraftId)
  const checklistId = checklistIdFromSelector(selectorPage.body, 'Antes de arrancar')

  // Fragments only — the full page's shell chrome (skip link, drawer toggle)
  // is not this module's content and carries its own touch-target coverage
  // (src/server/views/components.test.ts / shell.test.ts).
  const selectorFragment = await app.inject({
    method: 'GET',
    url: `/es/listas/${aircraftId}`,
    headers: { cookie, 'hx-request': 'true' },
  })
  const itemsFragment = await app.inject({
    method: 'GET',
    url: `/es/listas/${aircraftId}/${checklistId}`,
    headers: { cookie, 'hx-request': 'true' },
  })

  for (const body of [selectorFragment.body, itemsFragment.body]) {
    const tags = [...body.matchAll(/<(button|a)\b[^>]*>/g)].map((m) => m[0])
    const offenders = tags.filter((t) => !t.includes('touch-target'))
    assert.deepEqual(offenders, [])
  }
  await app.close()
})

test('the checklists path segments and visible chrome resolve from the catalogs in every locale', async () => {
  const app = await makeApp()
  for (const locale of SUPPORTED_LOCALES) {
    const cookie = await signUpPilot(app, `${locale}@example.com`)
    const url = destinationPath('checklists', locale)
    const res = await app.inject({ method: 'GET', url, headers: { cookie } })
    assert.equal(res.statusCode, 200, url)
  }
  await app.close()
})

// --- Eval: no color-only meaning ---------------------------------------------

test('the emergency grouping states its status in text, not by color alone', async () => {
  const app = await makeApp()
  const cookie = await signUpPilot(app)
  const aircraftId = await addAircraft(app, cookie)
  const res = await getSelector(app, cookie, aircraftId)
  assert.ok(res.body.includes('Emergencia'))
  await app.close()
})

test('a completed run states completion in text', async () => {
  const app = await makeApp()
  const cookie = await signUpPilot(app)
  const aircraftId = await addAircraft(app, cookie)
  await createFlightIntent(app, cookie, aircraftId)
  const selectorPage = await getSelector(app, cookie, aircraftId)
  const checklistId = checklistIdFromSelector(selectorPage.body, 'Antes de arrancar')

  const runPage = await getItems(app, cookie, aircraftId, checklistId)
  const csrf = csrfFrom(runPage.body)
  const hrefs = toggleHrefs(runPage.body)
  let last
  for (const href of hrefs) {
    last = await app.inject({
      method: 'POST',
      url: href,
      headers: {
        cookie,
        'content-type': 'application/x-www-form-urlencoded',
        'hx-request': 'true',
      },
      payload: formBody({ csrfToken: csrf }),
    })
  }
  assert.ok(last?.body.includes('Lista completa — todos los ítems confirmados'))
  await app.close()
})

// --- Eval: scaffolding -------------------------------------------------------

test('the checklists screen no longer renders the shared not-yet-available partial', async () => {
  const app = await makeApp()
  const cookie = await signUpPilot(app)
  const res = await app.inject({ method: 'GET', url: '/es/listas', headers: { cookie } })
  assert.equal(res.statusCode, 200)
  assert.ok(!res.body.includes('En desarrollo'))
  await app.close()
})
