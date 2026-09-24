/** The minimal planned-flight record a risk assessment attaches to
 * (`flight-intent` capability). Immutable and deliberately small — see
 * design.md's "the minimal seam for the future 'New flight' feature". */
export interface FlightIntentRecord {
  id: string
  pilotId: string
  aircraftId: string
  plannedDate: string
  departureIcao: string
  destinationIcao: string
  createdAt: Date
}

export interface CreateFlightIntentInput {
  aircraftId: string
  plannedDate: string
  departureIcao: string
  destinationIcao: string
}

export type FlightIntentWriteResult =
  { ok: true; flightIntent: FlightIntentRecord } | { ok: false; reason: 'aircraft_not_owned' }

/** The four PAVE domains, top-level structure of the questionnaire
 * (design.md: "Domain structure: PAVE at the top, IMSAFE inside Pilot"). */
export type RiskDomain = 'pilot' | 'aircraft' | 'environment' | 'external'

/** One pilot-answered questionnaire item: the item's key and the selected
 * option index (0-based into that item's fixed 3-option scale). */
export interface RiskAnswer {
  itemKey: string
  optionIndex: number
}

/** One item's contribution to a domain score, pilot-answered or auto-scored. */
export interface ScoredItem {
  itemKey: string
  points: number
  autoScored: boolean
  /** `true` when an auto-scored item had no fleet data to derive a value
   * from — it contributes zero points but is flagged rather than treated as
   * favorable (preflight-risk-assessment spec: "No fleet data available yet"). */
  notAvailable: boolean
}

export interface DomainScore {
  domain: RiskDomain
  score: number
  items: ScoredItem[]
}

export type RiskVerdict = 'low' | 'medium' | 'high'

/** The Aircraft domain's auto-scored fleet-data snapshot, copied into the
 * risk-assessment record at submission time (design.md: "a snapshot, not a
 * live join"). Each field is `null` when the aircraft has no data to derive
 * it from. */
export interface AircraftSnapshot {
  /** Whether the aircraft's last logged flight recorded an engine-limit
   * exceedance against a pilot-entered limit. */
  engineExceedance: boolean | null
  /** Fuel burned on the last logged flight relative to the aircraft's usable
   * fuel capacity (weight & balance profile) — a best-effort proxy for "fuel
   * vs. required reserve" since the app has no live current-fuel-onboard
   * reading (see design.md open questions). */
  fuelStatus: 'ok' | 'low' | null
  /** Hours remaining to the nearest maintenance item due by hours. */
  hoursToNextMaintenance: number | null
}

export interface CreateRiskAssessmentInput {
  flightIntentId: string
  answers: RiskAnswer[]
  domainScores: DomainScore[]
  overallScore: number
  verdict: RiskVerdict
  aircraftSnapshot: AircraftSnapshot
}

export interface RiskAssessmentRecord {
  id: string
  pilotId: string
  flightIntentId: string
  answers: RiskAnswer[]
  domainScores: DomainScore[]
  overallScore: number
  verdict: RiskVerdict
  aircraftSnapshot: AircraftSnapshot
  submittedAt: Date
}

export type RiskAssessmentWriteResult =
  { ok: true; assessment: RiskAssessmentRecord } | { ok: false; reason: 'flight_intent_not_owned' }
