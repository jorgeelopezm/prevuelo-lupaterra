import { formatLongDate } from '../../platform/i18n/format.js'
import type { SupportedLocale } from '../../platform/i18n/locale.js'
import type { AircraftRecord } from '../../platform/fleet/types.js'
import type { FlightRepo } from '../../platform/fleet/flight-repo.js'
import type { MaintenanceRepo } from '../../platform/fleet/maintenance-repo.js'
import type { EngineDataRepo } from '../../platform/fleet/engine-data-repo.js'
import type { WbRepo } from '../../platform/fleet/wb-repo.js'
import type { AircraftRepo } from '../../platform/fleet/aircraft-repo.js'
import type { FlightIntentRepo } from '../../platform/risk/flight-intent-repo.js'
import type { RiskAssessmentRepo } from '../../platform/risk/risk-assessment-repo.js'
import type { ChecklistRepo } from '../../platform/checklists/checklist-repo.js'
import type { RunRepo } from '../../platform/checklists/run-repo.js'
import { deriveMaintenanceStatus } from '../../platform/fleet/maintenance-status.js'
import { readAircraftSnapshot } from '../../platform/risk/aircraft-snapshot.js'
import type { FlightIntentRecord, RiskVerdict } from '../../platform/risk/types.js'
import type {
  MetarReport,
  NotamReport,
  WeatherLocale,
  WeatherMcpClient,
  WeatherMcpError,
} from '../../platform/weather-mcp/types.js'
import { isConfirmedEmpty } from '../../platform/weather-mcp/coverage.js'
import { briefingForNotams } from '../../platform/weather-mcp/briefing.js'
import type {
  DecisionView,
  HomeNotams,
  HomeStats,
  HomeTiles,
  HomeViewModel,
  HomeWeatherReport,
  HomeWeatherResult,
  StatCardView,
  StatusTone,
  TileView,
  WeatherErrorView,
  WeatherSection,
} from './types.js'

/** Threshold below which the nearest-due maintenance card treats "hours
 * remaining" as due-soon, matching `readAircraftSnapshot`'s own constant
 * (kept independent since this card renders the item, not just a factor). */
const MAINTENANCE_WARNING_HOURS = 10
const MAINTENANCE_WARNING_DAYS = 14

const VERDICT_TONE: Record<RiskVerdict, StatusTone> = {
  low: 'good',
  medium: 'warn',
  high: 'bad',
}

export interface HomeRepos {
  flightIntentRepo: Pick<FlightIntentRepo, 'listForPilot'>
  riskAssessmentRepo: Pick<RiskAssessmentRepo, 'listForFlightIntent'>
  flightRepo: Pick<FlightRepo, 'lastForAircraft' | 'aircraftTotals'>
  maintenanceRepo: Pick<MaintenanceRepo, 'list'>
  engineDataRepo: Pick<EngineDataRepo, 'getForFlight' | 'getAircraftLimits'>
  wbRepo: Pick<WbRepo, 'get'>
  aircraftRepo: Pick<AircraftRepo, 'getActiveAircraft' | 'findById'>
  /** `platform/checklists` is platform, not a feature module — importing it
   * here does not trip `module-boundary/no-cross-module-import`; importing
   * `modules/checklists/*` would, so this stays a repo interface, not a
   * cross-module import (design.md task 7.2). */
  checklistRepo: Pick<ChecklistRepo, 'listForAircraft'>
  runRepo: Pick<RunRepo, 'preflightProgressForIntent'>
}

export interface HomeLinks {
  weatherHref: string
  weatherFragmentHref: string
  riskHref: string
  aircraftHref: string
  checklistsHref: string
  planFlightHref: string
  wbHrefFor(aircraftId: string): string
  startAssessmentHref(flightIntentId: string): string
}

export interface BuildHomeViewModelOptions {
  pilotId: string
  activeAircraft: AircraftRecord | null
  repos: HomeRepos
  links: HomeLinks
  locale: SupportedLocale
  now: Date
}

/** The soonest flight intent planned on or after `now`'s UTC date (design
 * decision 3). Ties (same `plannedDate`) break on `createdAt`, oldest first,
 * for a deterministic result. Exported so the weather-fragment route (group
 * 3) can derive the same departure indicator without duplicating the
 * selection logic. */
export function selectNextIntent(
  intents: readonly FlightIntentRecord[],
  now: Date,
): FlightIntentRecord | null {
  const today = now.toISOString().slice(0, 10)
  const upcoming = intents.filter((i) => i.plannedDate >= today)
  if (upcoming.length === 0) return null
  upcoming.sort((a, b) => {
    if (a.plannedDate !== b.plannedDate) return a.plannedDate < b.plannedDate ? -1 : 1
    return a.createdAt.getTime() - b.createdAt.getTime()
  })
  return upcoming[0] as FlightIntentRecord
}

function greetingKeyFor(now: Date): string {
  const hour = now.getUTCHours()
  if (hour < 12) return 'home.greeting_morning'
  if (hour < 18) return 'home.greeting_afternoon'
  return 'home.greeting_evening'
}

async function buildDecision(
  intent: FlightIntentRecord | null,
  repos: HomeRepos,
  links: HomeLinks,
): Promise<DecisionView> {
  if (!intent) return null
  const assessments = await repos.riskAssessmentRepo.listForFlightIntent(intent.pilotId, intent.id)
  if (assessments.length === 0) {
    return { state: 'unassessed', startHref: links.startAssessmentHref(intent.id) }
  }
  const newest = assessments.reduce((a, b) => (b.submittedAt > a.submittedAt ? b : a))
  return {
    state: 'assessed',
    verdict: newest.verdict,
    tone: VERDICT_TONE[newest.verdict],
    overallScore: newest.overallScore,
    submittedAt: newest.submittedAt,
  }
}

function riskTile(decision: DecisionView, links: HomeLinks): TileView {
  if (decision === null) {
    return {
      href: links.riskHref,
      labelKey: 'home.tile_risk',
      status: null,
      detail: null,
      detailKey: null,
      sub: null,
      unavailableKey: 'home.tile_risk_unavailable',
    }
  }
  if (decision.state === 'unassessed') {
    return {
      href: decision.startHref,
      labelKey: 'home.tile_risk',
      status: { tone: 'neutral', labelKey: 'home.decision_unassessed' },
      detail: null,
      detailKey: null,
      sub: null,
      unavailableKey: null,
    }
  }
  return {
    href: links.riskHref,
    labelKey: 'home.tile_risk',
    status: { tone: decision.tone, labelKey: `home.verdict_${decision.verdict}` },
    detail: String(decision.overallScore),
    detailKey: null,
    sub: null,
    unavailableKey: null,
  }
}

function aircraftTile(
  activeAircraft: AircraftRecord | null,
  fuelStatus: 'ok' | 'low' | null,
  links: HomeLinks,
): TileView {
  if (!activeAircraft) {
    return {
      href: links.aircraftHref,
      labelKey: 'home.tile_aircraft',
      status: null,
      detail: null,
      detailKey: null,
      sub: null,
      unavailableKey: 'home.tile_aircraft_no_active',
    }
  }
  return {
    href: links.aircraftHref,
    labelKey: 'home.tile_aircraft',
    status: fuelStatus
      ? { tone: fuelStatus === 'ok' ? 'good' : 'warn', labelKey: `home.fuel_status_${fuelStatus}` }
      : null,
    detail: activeAircraft.registration,
    detailKey: null,
    sub: null,
    unavailableKey: fuelStatus ? null : 'home.tile_aircraft_unavailable',
  }
}

function unavailableChecklistsTile(links: HomeLinks, unavailableKey: string): TileView {
  return {
    href: links.checklistsHref,
    labelKey: 'home.tile_checklists',
    status: null,
    detail: null,
    detailKey: null,
    sub: null,
    unavailableKey,
  }
}

/** The Checklists tile reads the pre-flight checklist's run progress for the
 * pilot's next flight intent (checklist-runs: "Pre-flight progress is
 * exposed to the pre-flight brief"), scoped to *that intent's own aircraft*
 * — not the pilot's separately-toggled active aircraft — matching how the
 * checklists screen itself resolves a run (design decision 11). Every
 * absent reason states itself in text rather than showing a favorable or
 * invented count (AGENTS.md no-fabrication rule). */
async function checklistsTile(
  nextIntent: FlightIntentRecord | null,
  intentAircraft: AircraftRecord | null,
  repos: HomeRepos,
  links: HomeLinks,
): Promise<TileView> {
  if (!nextIntent) return unavailableChecklistsTile(links, 'home.tile_checklists_no_intent')
  if (!intentAircraft) return unavailableChecklistsTile(links, 'home.tile_checklists_no_aircraft')

  const library = await repos.checklistRepo.listForAircraft(nextIntent.pilotId, intentAircraft.id)
  const hasPreflightChecklist = library.some((c) => c.role === 'preflight')
  if (!hasPreflightChecklist) {
    return unavailableChecklistsTile(links, 'home.tile_checklists_no_checklist')
  }

  const progress = await repos.runRepo.preflightProgressForIntent(
    nextIntent.pilotId,
    nextIntent.id,
    intentAircraft.id,
  )
  if (!progress) return unavailableChecklistsTile(links, 'home.tile_checklists_not_started')

  return {
    href: links.checklistsHref,
    labelKey: 'home.tile_checklists',
    status: null,
    detail: `${progress.checkedCount} / ${progress.totalCount}`,
    detailKey: null,
    sub: progress.checklistName,
    unavailableKey: null,
  }
}

function weatherTile(intent: FlightIntentRecord | null, links: HomeLinks): TileView {
  if (!intent) {
    return {
      href: links.weatherHref,
      labelKey: 'home.tile_weather',
      status: null,
      detail: null,
      detailKey: null,
      sub: null,
      unavailableKey: 'home.no_aerodrome_selected',
    }
  }
  return {
    href: `${links.weatherHref}?icao=${encodeURIComponent(intent.departureIcao)}`,
    labelKey: 'home.tile_weather',
    status: { tone: 'neutral', labelKey: 'home.weather_pending' },
    detail: intent.departureIcao,
    detailKey: null,
    sub: null,
    unavailableKey: null,
  }
}

function fuelStatCard(
  wbProfile: Awaited<ReturnType<HomeRepos['wbRepo']['get']>>,
  activeAircraft: AircraftRecord,
  links: HomeLinks,
): StatCardView {
  const wbHref = links.wbHrefFor(activeAircraft.id)
  if (wbProfile.usableFuelQty === null) {
    return {
      labelKey: 'home.stat_fuel',
      value: null,
      unit: null,
      sub: null,
      status: null,
      unavailableKey: 'home.stat_fuel_unavailable',
      href: wbHref,
    }
  }
  return {
    labelKey: 'home.stat_fuel',
    value: wbProfile.usableFuelQty.toFixed(1),
    unit: wbProfile.massUnit,
    sub: null,
    status: null,
    unavailableKey: 'home.stat_fuel_unavailable',
    href: wbHref,
  }
}

async function maintenanceStatCard(
  activeAircraft: AircraftRecord,
  repos: HomeRepos,
  links: HomeLinks,
  now: Date,
): Promise<StatCardView> {
  const [items, totals] = await Promise.all([
    repos.maintenanceRepo.list(activeAircraft.pilotId, activeAircraft.id),
    repos.flightRepo.aircraftTotals(activeAircraft.pilotId, activeAircraft.id),
  ])

  let nearest: { description: string; id: string; hoursRemaining: number; status: string } | null =
    null
  for (const item of items) {
    if (item.dueAtHours === null) continue
    const basisHours = item.hoursBasis === 'tach' ? totals.tachHours : totals.airframeHours
    const derived = deriveMaintenanceStatus(
      item,
      now,
      totals.computable ? basisHours : null,
      MAINTENANCE_WARNING_DAYS,
      MAINTENANCE_WARNING_HOURS,
    )
    if (!derived.hoursComputable || derived.hoursRemaining === null) continue
    if (nearest === null || derived.hoursRemaining < nearest.hoursRemaining) {
      nearest = {
        description: item.description,
        id: item.id,
        hoursRemaining: derived.hoursRemaining,
        status: derived.status,
      }
    }
  }

  if (!nearest) {
    return {
      labelKey: 'home.stat_maintenance',
      value: null,
      unit: null,
      sub: null,
      status: null,
      unavailableKey: 'home.stat_maintenance_unavailable',
      href: links.aircraftHref,
    }
  }

  const tone: StatusTone =
    nearest.status === 'overdue' ? 'bad' : nearest.status === 'due_soon' ? 'warn' : 'good'
  return {
    labelKey: 'home.stat_maintenance',
    value: nearest.hoursRemaining.toFixed(1),
    unit: 'h',
    sub: nearest.description,
    status: { tone, labelKey: `home.maintenance_status_${nearest.status}` },
    unavailableKey: 'home.stat_maintenance_unavailable',
    href: links.aircraftHref,
  }
}

async function lastFlightStatCard(
  activeAircraft: AircraftRecord,
  repos: HomeRepos,
  links: HomeLinks,
): Promise<StatCardView> {
  const last = await repos.flightRepo.lastForAircraft(activeAircraft.pilotId, activeAircraft.id)
  if (!last) {
    return {
      labelKey: 'home.stat_last_flight',
      value: null,
      unit: null,
      sub: null,
      status: null,
      unavailableKey: 'home.stat_last_flight_unavailable',
      href: links.aircraftHref,
    }
  }
  const route =
    last.departureAerodrome && last.arrivalAerodrome
      ? `${last.departureAerodrome} → ${last.arrivalAerodrome}`
      : null
  // (minutes / 60).toFixed(1) mirrors fleet/duration.ts's
  // formatMinutesAsDecimalHours, duplicated rather than imported: the
  // module-boundary lint rule forbids a feature module importing another's
  // internals (design.md task 1.8 named that helper without accounting for
  // the boundary — see tasks.md 1.8 deviation note).
  const duration = `${(last.totalMinutes / 60).toFixed(1)}h`
  return {
    labelKey: 'home.stat_last_flight',
    value: last.flightDate,
    unit: null,
    sub: route ? `${route} · ${duration}` : duration,
    status: null,
    unavailableKey: 'home.stat_last_flight_unavailable',
    href: links.aircraftHref,
  }
}

function unavailableStatsRow(links: HomeLinks): HomeStats {
  const unavailable = (labelKey: string, unavailableKey: string): StatCardView => ({
    labelKey,
    value: null,
    unit: null,
    sub: null,
    status: null,
    unavailableKey,
    href: links.aircraftHref,
  })
  return {
    fuel: unavailable('home.stat_fuel', 'home.stat_no_aircraft'),
    maintenance: unavailable('home.stat_maintenance', 'home.stat_no_aircraft'),
    lastFlight: unavailable('home.stat_last_flight', 'home.stat_no_aircraft'),
  }
}

/**
 * Assemble the signed-in pilot's whole pre-flight brief from injected
 * repository interfaces (design decision 7) — no Fastify app, no database.
 * The weather tile/NOTAM band are filled separately by the fragment route
 * (design decision 2); this only emits the weather tile's pending/link state.
 */
export async function buildHomeViewModel(opts: BuildHomeViewModelOptions): Promise<HomeViewModel> {
  const { pilotId, activeAircraft, repos, links, locale, now } = opts

  const [intents, wbProfile, maintenanceCard, lastFlightCard, aircraftSnapshot] = await Promise.all(
    [
      repos.flightIntentRepo.listForPilot(pilotId),
      activeAircraft ? repos.wbRepo.get(pilotId, activeAircraft.id) : null,
      activeAircraft ? maintenanceStatCard(activeAircraft, repos, links, now) : null,
      activeAircraft ? lastFlightStatCard(activeAircraft, repos, links) : null,
      activeAircraft
        ? readAircraftSnapshot(pilotId, activeAircraft.id, {
            flightRepo: repos.flightRepo,
            maintenanceRepo: repos.maintenanceRepo,
            engineDataRepo: repos.engineDataRepo,
            wbRepo: repos.wbRepo,
          })
        : null,
    ],
  )

  const nextIntent = selectNextIntent(intents, now)
  const [decision, intentAircraft] = await Promise.all([
    buildDecision(nextIntent, repos, links),
    nextIntent ? repos.aircraftRepo.findById(pilotId, nextIntent.aircraftId) : null,
  ])

  const stats: HomeStats =
    activeAircraft && wbProfile && maintenanceCard && lastFlightCard
      ? {
          fuel: fuelStatCard(wbProfile, activeAircraft, links),
          maintenance: maintenanceCard,
          lastFlight: lastFlightCard,
        }
      : unavailableStatsRow(links)

  const tiles: HomeTiles = {
    weather: weatherTile(nextIntent, links),
    risk: riskTile(decision, links),
    aircraft: aircraftTile(activeAircraft, aircraftSnapshot?.fuelStatus ?? null, links),
    checklists: await checklistsTile(nextIntent, intentAircraft, repos, links),
  }

  return {
    signedIn: true,
    greetingKey: greetingKeyFor(now),
    dateLine: formatLongDate(now, locale),
    intent: nextIntent
      ? {
          id: nextIntent.id,
          aircraftId: nextIntent.aircraftId,
          aircraftRegistration: intentAircraft?.registration ?? null,
          departureIcao: nextIntent.departureIcao,
          destinationIcao: nextIntent.destinationIcao,
          plannedDate: nextIntent.plannedDate,
        }
      : null,
    noIntentKey: nextIntent ? null : 'home.no_upcoming_flight',
    planFlightHref: links.planFlightHref,
    decision,
    tiles,
    stats,
    weatherFragmentHref: links.weatherFragmentHref,
  }
}

// --- Weather fragment ---

function toWeatherError(error: WeatherMcpError): WeatherErrorView {
  return { kind: error.kind, provider: error.provider, retryAfterSeconds: error.retryAfterSeconds }
}

export interface BuildHomeWeatherViewModelOptions {
  weatherMcp: WeatherMcpClient
  icao: string | null
  weatherHref: string
  locale: WeatherLocale
}

/** Retrieve the departure indicator's METAR + NOTAMs for the home fragment,
 * mapping every outcome (success, empty NOTAM list, and each MCP error kind)
 * to a distinct rendered state (design decision 2). Never recomputes
 * provenance — the fields are returned verbatim from the MCP client. */
export async function buildHomeWeatherViewModel(
  opts: BuildHomeWeatherViewModelOptions,
): Promise<HomeWeatherResult> {
  const { weatherMcp, icao, weatherHref } = opts
  if (!icao) return { status: 'no_aerodrome' }

  const [metarResult, notamsResult] = await Promise.all([
    weatherMcp.getMetar([icao]),
    weatherMcp.getNotams([icao]),
  ])

  const metar: WeatherSection<HomeWeatherReport> = !metarResult.ok
    ? { status: 'error', error: toWeatherError(metarResult.error) }
    : {
        status: 'ok',
        provenance: stripEntries(metarResult.data),
        data: findMetar(metarResult.data.entries, icao),
      }

  const notams: WeatherSection<HomeNotams> = !notamsResult.ok
    ? { status: 'error', error: toWeatherError(notamsResult.error) }
    : {
        status: 'ok',
        provenance: stripEntries(notamsResult.data),
        data: findNotams(notamsResult.data.entries, icao),
      }

  return {
    status: 'ready',
    data: { icao, weatherHref, metar, notams },
  }
}

/** Drop the batched `entries` array, keeping only the provenance fields — the
 * fragment covers a single ICAO, so provenance is applied once rather than
 * per-entry. */
function stripEntries<T extends { entries: unknown[] }>(result: T): Omit<T, 'entries'> {
  const provenance: Partial<T> = { ...result }
  delete provenance.entries
  return provenance as Omit<T, 'entries'>
}

function findMetar(entries: MetarReport[], icao: string): HomeWeatherReport {
  const found = entries.find((e) => e.icao === icao)
  return found ?? { report: null, observationTime: null }
}

/** No entry for the indicator means the provider said nothing — unknown, never "none". */
function findNotams(entries: NotamReport[], icao: string): HomeNotams {
  const found = entries.find((e) => e.icao === icao)
  const notams = found?.notams ?? []
  return {
    notams,
    confirmedEmpty: isConfirmedEmpty(notams, found?.coverage),
    briefing: briefingForNotams(icao, found?.coverage),
  }
}
