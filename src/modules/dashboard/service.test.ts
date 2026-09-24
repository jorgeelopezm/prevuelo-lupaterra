import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  buildHomeViewModel,
  buildHomeWeatherViewModel,
  selectNextIntent,
  type HomeRepos,
  type HomeLinks,
} from './service.js'
import type { AircraftRecord } from '../../platform/fleet/types.js'
import type { FlightIntentRecord, RiskAssessmentRecord } from '../../platform/risk/types.js'
import type { NotamReport, WeatherMcpClient } from '../../platform/weather-mcp/types.js'

function intent(overrides: Partial<FlightIntentRecord> = {}): FlightIntentRecord {
  return {
    id: overrides.id ?? 'intent-1',
    pilotId: 'pilot-1',
    aircraftId: 'aircraft-1',
    plannedDate: '2026-07-15',
    departureIcao: 'LEMD',
    destinationIcao: 'LEBL',
    createdAt: new Date('2026-07-01T00:00:00Z'),
    ...overrides,
  }
}

const NOW = new Date('2026-07-15T12:00:00Z')

test('selectNextIntent includes a same-day intent', () => {
  const result = selectNextIntent([intent({ plannedDate: '2026-07-15' })], NOW)
  assert.equal(result?.id, 'intent-1')
})

test('selectNextIntent excludes a past intent', () => {
  const result = selectNextIntent([intent({ plannedDate: '2026-07-14' })], NOW)
  assert.equal(result, null)
})

test('selectNextIntent returns null for an empty list', () => {
  assert.equal(selectNextIntent([], NOW), null)
})

test('selectNextIntent picks the soonest of several upcoming intents', () => {
  const soonest = intent({ id: 'soonest', plannedDate: '2026-07-16' })
  const later = intent({ id: 'later', plannedDate: '2026-07-20' })
  const result = selectNextIntent([later, soonest], NOW)
  assert.equal(result?.id, 'soonest')
})

test('selectNextIntent breaks a same-planned-date tie by createdAt, oldest first', () => {
  const newer = intent({
    id: 'newer',
    plannedDate: '2026-07-16',
    createdAt: new Date('2026-07-02T00:00:00Z'),
  })
  const older = intent({
    id: 'older',
    plannedDate: '2026-07-16',
    createdAt: new Date('2026-07-01T00:00:00Z'),
  })
  const result = selectNextIntent([newer, older], NOW)
  assert.equal(result?.id, 'older')
})

function aircraft(overrides: Partial<AircraftRecord> = {}): AircraftRecord {
  return {
    id: 'aircraft-1',
    pilotId: 'pilot-1',
    registration: 'EC-ABC',
    icaoType: 'C172',
    manufacturer: 'Cessna',
    model: '172S',
    serialNumber: null,
    classCategory: null,
    engine: null,
    propeller: null,
    yearOfManufacture: null,
    homeBase: null,
    nickname: null,
    openingAirframeHours: null,
    openingEngineHours: null,
    openingTachHours: null,
    openingLandings: null,
    retiredAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  }
}

function assessment(overrides: Partial<RiskAssessmentRecord> = {}): RiskAssessmentRecord {
  return {
    id: 'assessment-1',
    pilotId: 'pilot-1',
    flightIntentId: 'intent-1',
    answers: [],
    domainScores: [],
    overallScore: 4,
    verdict: 'low',
    aircraftSnapshot: { engineExceedance: null, fuelStatus: null, hoursToNextMaintenance: null },
    submittedAt: new Date('2026-07-10T00:00:00Z'),
    ...overrides,
  }
}

function noopLinks(): HomeLinks {
  return {
    weatherHref: '/es/meteorologia',
    weatherFragmentHref: '/es/resumen-meteorologico',
    riskHref: '/es/riesgo',
    aircraftHref: '/es/aeronave',
    checklistsHref: '/es/checklists',
    planFlightHref: '/es/riesgo/intento-vuelo/nuevo',
    wbHrefFor: (aircraftId) => `/es/aeronave/aviones/${aircraftId}/peso-balance`,
    startAssessmentHref: (flightIntentId) => `/es/riesgo/evaluacion/${flightIntentId}/nuevo`,
  }
}

/** Repos with no data at all — every read resolves to empty/null. */
function emptyRepos(overrides: Partial<HomeRepos> = {}): HomeRepos {
  return {
    flightIntentRepo: { listForPilot: async () => [] },
    riskAssessmentRepo: { listForFlightIntent: async () => [] },
    flightRepo: {
      lastForAircraft: async () => null,
      aircraftTotals: async () => ({
        computable: false,
        airframeHours: null,
        engineHours: null,
        tachHours: null,
        landings: null,
      }),
    },
    maintenanceRepo: { list: async () => [] },
    engineDataRepo: { getForFlight: async () => null, getAircraftLimits: async () => null },
    wbRepo: {
      get: async () => ({
        emptyWeight: null,
        emptyWeightArm: null,
        mtow: null,
        mlw: null,
        mzfw: null,
        usableFuelQty: null,
        usableFuelArm: null,
        massUnit: null,
        lengthUnit: null,
        loadStations: [],
        envelopePoints: [],
      }),
    },
    aircraftRepo: { getActiveAircraft: async () => null, findById: async () => null },
    checklistRepo: { listForAircraft: async () => [] },
    runRepo: { preflightProgressForIntent: async () => null },
    ...overrides,
  }
}

test('an intent with no risk assessment resolves to the unassessed decision, carrying no verdict or score', async () => {
  const theIntent = intent()
  const repos = emptyRepos({
    flightIntentRepo: { listForPilot: async () => [theIntent] },
    aircraftRepo: { getActiveAircraft: async () => null, findById: async () => aircraft() },
  })
  const vm = await buildHomeViewModel({
    pilotId: 'pilot-1',
    activeAircraft: null,
    repos,
    links: noopLinks(),
    locale: 'es',
    now: NOW,
  })
  assert.ok(vm.decision)
  assert.equal(vm.decision?.state, 'unassessed')
  assert.ok(!('verdict' in (vm.decision as object)))
  assert.ok(!('overallScore' in (vm.decision as object)))
})

test('an intent with a submitted assessment resolves to the assessed decision with the newest verdict', async () => {
  const theIntent = intent()
  const older = assessment({
    id: 'older',
    verdict: 'high',
    overallScore: 20,
    submittedAt: new Date('2026-07-05T00:00:00Z'),
  })
  const newer = assessment({
    id: 'newer',
    verdict: 'low',
    overallScore: 3,
    submittedAt: new Date('2026-07-12T00:00:00Z'),
  })
  const repos = emptyRepos({
    flightIntentRepo: { listForPilot: async () => [theIntent] },
    riskAssessmentRepo: { listForFlightIntent: async () => [older, newer] },
  })
  const vm = await buildHomeViewModel({
    pilotId: 'pilot-1',
    activeAircraft: null,
    repos,
    links: noopLinks(),
    locale: 'es',
    now: NOW,
  })
  assert.equal(vm.decision?.state, 'assessed')
  if (vm.decision?.state === 'assessed') {
    assert.equal(vm.decision.verdict, 'low')
    assert.equal(vm.decision.overallScore, 3)
  }
})

test('no next intent means no decision indicator at all', async () => {
  const vm = await buildHomeViewModel({
    pilotId: 'pilot-1',
    activeAircraft: null,
    repos: emptyRepos(),
    links: noopLinks(),
    locale: 'es',
    now: NOW,
  })
  assert.equal(vm.decision, null)
  assert.equal(vm.intent, null)
  assert.equal(vm.noIntentKey, 'home.no_upcoming_flight')
})

test('no active aircraft: all three stat cards share the no-aircraft-selected reason', async () => {
  const vm = await buildHomeViewModel({
    pilotId: 'pilot-1',
    activeAircraft: null,
    repos: emptyRepos(),
    links: noopLinks(),
    locale: 'es',
    now: NOW,
  })
  assert.equal(vm.stats.fuel.unavailableKey, 'home.stat_no_aircraft')
  assert.equal(vm.stats.maintenance.unavailableKey, 'home.stat_no_aircraft')
  assert.equal(vm.stats.lastFlight.unavailableKey, 'home.stat_no_aircraft')
  assert.equal(vm.stats.fuel.value, null)
})

test('usable fuel stat card sources value and unit from the wb profile', async () => {
  const activeAircraft = aircraft()
  const repos = emptyRepos({
    wbRepo: {
      get: async () => ({
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
      }),
    },
  })
  const vm = await buildHomeViewModel({
    pilotId: 'pilot-1',
    activeAircraft,
    repos,
    links: noopLinks(),
    locale: 'es',
    now: NOW,
  })
  assert.equal(vm.stats.fuel.value, '40.0')
  assert.equal(vm.stats.fuel.unit, 'lb')
})

// --- Checklists tile (home-dashboard: "Status tiles show a sourced value or
// state why it is unavailable") ---

test('checklists tile states unavailability with no upcoming flight intent', async () => {
  const repos = emptyRepos()
  const vm = await buildHomeViewModel({
    pilotId: 'pilot-1',
    activeAircraft: null,
    repos,
    links: noopLinks(),
    locale: 'es',
    now: NOW,
  })
  assert.equal(vm.tiles.checklists.unavailableKey, 'home.tile_checklists_no_intent')
  assert.equal(vm.tiles.checklists.detail, null)
  assert.equal(vm.tiles.checklists.sub, null)
})

test("checklists tile states unavailability when the intent's own aircraft no longer resolves", async () => {
  const theIntent = intent()
  const repos = emptyRepos({
    flightIntentRepo: { listForPilot: async () => [theIntent] },
    aircraftRepo: { getActiveAircraft: async () => null, findById: async () => null },
  })
  const vm = await buildHomeViewModel({
    pilotId: 'pilot-1',
    activeAircraft: null,
    repos,
    links: noopLinks(),
    locale: 'es',
    now: NOW,
  })
  assert.equal(vm.tiles.checklists.unavailableKey, 'home.tile_checklists_no_aircraft')
  assert.equal(vm.tiles.checklists.detail, null)
})

test('checklists tile states unavailability when the aircraft has no designated pre-flight checklist', async () => {
  const theIntent = intent()
  const repos = emptyRepos({
    flightIntentRepo: { listForPilot: async () => [theIntent] },
    aircraftRepo: { getActiveAircraft: async () => null, findById: async () => aircraft() },
    checklistRepo: {
      listForAircraft: async () => [
        {
          id: 'checklist-1',
          pilotId: 'pilot-1',
          aircraftId: 'aircraft-1',
          name: 'Before Start',
          kind: 'normal',
          role: null,
          source: 'template',
          templateVersion: 1,
          position: 0,
          createdAt: new Date('2026-01-01T00:00:00Z'),
          updatedAt: new Date('2026-01-01T00:00:00Z'),
        },
      ],
    },
  })
  const vm = await buildHomeViewModel({
    pilotId: 'pilot-1',
    activeAircraft: null,
    repos,
    links: noopLinks(),
    locale: 'es',
    now: NOW,
  })
  assert.equal(vm.tiles.checklists.unavailableKey, 'home.tile_checklists_no_checklist')
  assert.equal(vm.tiles.checklists.detail, null)
})

test('checklists tile states unavailability when the pre-flight checklist has no run started', async () => {
  const theIntent = intent()
  const repos = emptyRepos({
    flightIntentRepo: { listForPilot: async () => [theIntent] },
    aircraftRepo: { getActiveAircraft: async () => null, findById: async () => aircraft() },
    checklistRepo: {
      listForAircraft: async () => [
        {
          id: 'checklist-1',
          pilotId: 'pilot-1',
          aircraftId: 'aircraft-1',
          name: 'Preflight',
          kind: 'normal',
          role: 'preflight',
          source: 'template',
          templateVersion: 1,
          position: 0,
          createdAt: new Date('2026-01-01T00:00:00Z'),
          updatedAt: new Date('2026-01-01T00:00:00Z'),
        },
      ],
    },
    runRepo: { preflightProgressForIntent: async () => null },
  })
  const vm = await buildHomeViewModel({
    pilotId: 'pilot-1',
    activeAircraft: null,
    repos,
    links: noopLinks(),
    locale: 'es',
    now: NOW,
  })
  assert.equal(vm.tiles.checklists.unavailableKey, 'home.tile_checklists_not_started')
  assert.equal(vm.tiles.checklists.detail, null)
})

test("checklists tile shows the pre-flight checklist's run progress once started", async () => {
  const theIntent = intent()
  const repos = emptyRepos({
    flightIntentRepo: { listForPilot: async () => [theIntent] },
    aircraftRepo: { getActiveAircraft: async () => null, findById: async () => aircraft() },
    checklistRepo: {
      listForAircraft: async () => [
        {
          id: 'checklist-1',
          pilotId: 'pilot-1',
          aircraftId: 'aircraft-1',
          name: 'Preflight',
          kind: 'normal',
          role: 'preflight',
          source: 'template',
          templateVersion: 1,
          position: 0,
          createdAt: new Date('2026-01-01T00:00:00Z'),
          updatedAt: new Date('2026-01-01T00:00:00Z'),
        },
      ],
    },
    runRepo: {
      preflightProgressForIntent: async () => ({
        checklistName: 'Preflight',
        checkedCount: 3,
        totalCount: 11,
      }),
    },
  })
  const vm = await buildHomeViewModel({
    pilotId: 'pilot-1',
    activeAircraft: null,
    repos,
    links: noopLinks(),
    locale: 'es',
    now: NOW,
  })
  assert.equal(vm.tiles.checklists.unavailableKey, null)
  assert.equal(vm.tiles.checklists.detail, '3 / 11')
  assert.equal(vm.tiles.checklists.sub, 'Preflight')
})

function notamsOnlyMcp(entries: NotamReport[]): WeatherMcpClient {
  const provenance = {
    provider: 'stub',
    issuedAt: '2026-07-01T10:00:00Z',
    retrievedAt: '2026-07-01T10:05:00Z',
    cached: false,
    cacheAgeSeconds: 0,
    sample: false,
    caveat: '',
  }
  const unused = async () => ({
    ok: false as const,
    error: { kind: 'provider_error' as const, message: 'unused' },
  })
  return {
    getMetar: async () => ({ ok: true, data: { ...provenance, entries: [] } }),
    getNotams: async () => ({ ok: true, data: { ...provenance, entries } }),
    getTaf: unused,
    getSigmet: unused,
    decodeMetar: unused,
    close: async () => {},
  }
}

async function homeNotams(entries: NotamReport[]) {
  const result = await buildHomeWeatherViewModel({
    weatherMcp: notamsOnlyMcp(entries),
    icao: 'LEMD',
    weatherHref: '/es/meteorologia?icao=LEMD',
    locale: 'es',
  })
  assert.equal(result.status, 'ready')
  if (result.status !== 'ready') throw new Error('unreachable')
  assert.equal(result.data.notams.status, 'ok')
  if (result.data.notams.status !== 'ok') throw new Error('unreachable')
  return result.data.notams.data
}

test('home NOTAMs: an empty list with complete coverage is a confirmed empty', async () => {
  const notams = await homeNotams([{ icao: 'LEMD', notams: [], coverage: 'complete' }])
  assert.equal(notams.confirmedEmpty, true)
})

test('home NOTAMs: an empty list with unknown coverage is not a confirmed empty', async () => {
  const notams = await homeNotams([{ icao: 'LEMD', notams: [], coverage: 'unknown' }])
  assert.equal(notams.confirmedEmpty, false)
})

test('home NOTAMs: an empty list with absent coverage is not a confirmed empty', async () => {
  const notams = await homeNotams([{ icao: 'LEMD', notams: [] }])
  assert.equal(notams.confirmedEmpty, false)
})

test('home NOTAMs: a result without an entry for the departure ICAO is unknown, not a confirmed empty', async () => {
  const notams = await homeNotams([{ icao: 'LEBL', notams: [], coverage: 'complete' }])
  assert.deepEqual(notams.notams, [])
  assert.equal(notams.confirmedEmpty, false)
})

test('home NOTAMs: an unconfirmed list for LEMD carries the ENAIRE briefing; a complete one carries none', async () => {
  const unknown = await homeNotams([{ icao: 'LEMD', notams: [], coverage: 'unknown' }])
  assert.equal(unknown.briefing?.href, 'https://notampib.enaire.es/icaro')
  const complete = await homeNotams([{ icao: 'LEMD', notams: [], coverage: 'complete' }])
  assert.equal(complete.briefing, null)
})
