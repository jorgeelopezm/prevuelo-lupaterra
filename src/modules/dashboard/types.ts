import type { RiskVerdict } from '../../platform/risk/types.js'
import type { WeatherMcpErrorKind, WeatherProvenance } from '../../platform/weather-mcp/types.js'
import type { OfficialBriefing } from '../../platform/weather-mcp/briefing.js'

/** Status-band tone shared by tiles and stat cards, mapped to the shell's
 * `statusChip`/`badge` macros. Meaning is always carried by the paired
 * `labelKey` text too — tone alone never conveys state (design decisions 4/5). */
export type StatusTone = 'good' | 'warn' | 'bad' | 'neutral'

export interface StatusBand {
  tone: StatusTone
  labelKey: string
}

/** Uniform shape for the four status tiles (Weather, Risk, Aircraft,
 * Checklists) — one code path in the template for "has a value" and "states
 * its unavailability" (design decision 5). A `null` `status`/`detail` means
 * the tile has nothing to show and `unavailableKey` names the localized
 * reason. */
export interface TileView {
  href: string
  labelKey: string
  status: StatusBand | null
  detail: string | null
  detailKey: string | null
  sub: string | null
  unavailableKey: string | null
}

export interface HomeTiles {
  weather: TileView
  risk: TileView
  aircraft: TileView
  checklists: TileView
}

/** The header's next-flight-intent summary, or `null` when there is none
 * (spec: "Only past intents" / "No intents at all"). */
export interface IntentView {
  id: string
  aircraftId: string
  /** The flight intent's own aircraft, not necessarily the active aircraft
   * used for the stat cards (design.md open question 1) — `null` when that
   * aircraft has since been retired or removed. */
  aircraftRegistration: string | null
  departureIcao: string
  destinationIcao: string
  plannedDate: string
}

/** The go/no-go decision indicator. `null` only when there is no next flight
 * intent at all — an intent with no assessment is still `'unassessed'`, never
 * absent (design decision 4: "unknown" is never "GO"). */
export type DecisionView =
  | {
      state: 'assessed'
      verdict: RiskVerdict
      tone: StatusTone
      overallScore: number
      submittedAt: Date
    }
  | { state: 'unassessed'; startHref: string }
  | null

/** Uniform shape for the three aircraft stat cards (usable fuel, nearest-due
 * maintenance, last flight). Every value field is nullable with a companion
 * `unavailableKey` (design decision 5's rule extended to the stat row). */
export interface StatCardView {
  labelKey: string
  value: string | null
  unit: string | null
  sub: string | null
  status: StatusBand | null
  unavailableKey: string
  href: string | null
}

export interface HomeStats {
  fuel: StatCardView
  maintenance: StatCardView
  lastFlight: StatCardView
}

/** The signed-in pilot's assembled pre-flight brief. Every value not sourced
 * from the pilot's own data is `null`, paired with the localized reason it is
 * missing (AGENTS.md no-fabrication rule). */
export interface HomeViewModel {
  signedIn: true
  greetingKey: string
  dateLine: string
  intent: IntentView | null
  noIntentKey: string | null
  planFlightHref: string
  decision: DecisionView
  tiles: HomeTiles
  stats: HomeStats
  /** `hx-get` target for the weather + NOTAM fragment (design decision 2). */
  weatherFragmentHref: string
}

// --- Weather fragment (group 3) ---

export interface WeatherErrorView {
  kind: WeatherMcpErrorKind
  provider?: string
  retryAfterSeconds?: number
}

export type WeatherSection<T> =
  | { status: 'ok'; provenance: WeatherProvenance; data: T }
  | { status: 'error'; error: WeatherErrorView }

export interface HomeWeatherReport {
  report: string | null
  observationTime: string | null
}

export interface HomeNotamEntry {
  id: string
  text: string
  /** `null` when the provider does not state it. */
  startAt: string | null
  /** `null` when the provider does not state it. */
  endAt: string | null
}

export interface HomeNotams {
  notams: HomeNotamEntry[]
  /** True only when the provider marked an empty list `complete`. */
  confirmedEmpty: boolean
  /** Official briefing link, only when the list is not confirmed complete. */
  briefing: OfficialBriefing | null
}

export interface HomeWeatherViewModel {
  icao: string
  weatherHref: string
  metar: WeatherSection<HomeWeatherReport>
  notams: WeatherSection<HomeNotams>
}

/** `no_aerodrome` when there is no next flight intent to derive a departure
 * indicator from (spec: "No flight intent means no weather retrieval") — the
 * fragment makes no MCP call in that case. */
export type HomeWeatherResult =
  { status: 'no_aerodrome' } | { status: 'ready'; data: HomeWeatherViewModel }
