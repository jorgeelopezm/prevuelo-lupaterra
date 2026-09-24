/** The pilot-owned aircraft record (`aircraft-fleet` capability). */
export interface AircraftRecord {
  id: string
  pilotId: string
  registration: string
  icaoType: string
  manufacturer: string
  model: string
  serialNumber: string | null
  classCategory: string | null
  engine: string | null
  propeller: string | null
  yearOfManufacture: number | null
  homeBase: string | null
  nickname: string | null
  /** Airframe/engine/tach hours and landings the aircraft had when the pilot
   * began logging it here. `null` when not recorded — current totals are then
   * "not computable" rather than assumed to start at zero (flight-logbook
   * spec, "Aircraft hour totals are derived from logged flights"). */
  openingAirframeHours: number | null
  openingEngineHours: number | null
  openingTachHours: number | null
  openingLandings: number | null
  retiredAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface CreateAircraftInput {
  registration: string
  icaoType: string
  manufacturer: string
  model: string
  serialNumber?: string | null
  classCategory?: string | null
  engine?: string | null
  propeller?: string | null
  yearOfManufacture?: number | null
  homeBase?: string | null
  nickname?: string | null
  openingAirframeHours?: number | null
  openingEngineHours?: number | null
  openingTachHours?: number | null
  openingLandings?: number | null
}

export type UpdateAircraftInput = CreateAircraftInput

export type AircraftWriteResult =
  { ok: true; aircraft: AircraftRecord } | { ok: false; reason: 'duplicate_registration' }

/** An airworthiness/document validity record (aircraft-fleet capability).
 * `issuedOn`/`expiresOn` are ISO date strings (`YYYY-MM-DD`) or `null` — the
 * expiring-soon/expired status is always derived from `expiresOn` at render
 * time, never stored (see `documentStatus` in `document-status.ts`). */
export interface AircraftDocumentRecord {
  id: string
  aircraftId: string
  pilotId: string
  kind: string
  reference: string | null
  issuedOn: string | null
  expiresOn: string | null
  createdAt: Date
  updatedAt: Date
}

export interface CreateAircraftDocumentInput {
  kind: string
  reference?: string | null
  issuedOn?: string | null
  expiresOn?: string | null
}

export type DocumentWriteResult =
  { ok: true; document: AircraftDocumentRecord } | { ok: false; reason: 'invalid_dates' }

/** One load station in the weight & balance profile. */
export interface LoadStation {
  id: string
  position: number
  name: string
  arm: number
  maxWeight: number | null
}

/** One (weight, cg) point of the centre-of-gravity envelope polygon. */
export interface CgEnvelopePoint {
  id: string
  position: number
  weight: number
  cg: number
}

/** The weight & balance profile stored on an aircraft. `emptyWeight === null`
 * means no profile has been entered — every other field is then irrelevant
 * and the screen renders the "no profile entered" state rather than any
 * numeric value (aircraft-fleet spec: "Aircraft without a profile"). */
export interface WbProfile {
  emptyWeight: number | null
  emptyWeightArm: number | null
  mtow: number | null
  mlw: number | null
  mzfw: number | null
  usableFuelQty: number | null
  usableFuelArm: number | null
  massUnit: string | null
  lengthUnit: string | null
  loadStations: LoadStation[]
  envelopePoints: CgEnvelopePoint[]
}

export interface CreateWbProfileInput {
  emptyWeight: number | null
  emptyWeightArm: number | null
  mtow: number | null
  mlw: number | null
  mzfw: number | null
  usableFuelQty: number | null
  usableFuelArm: number | null
  massUnit: string | null
  lengthUnit: string | null
  loadStations: Array<{ name: string; arm: number; maxWeight: number | null }>
  envelopePoints: Array<{ weight: number; cg: number }>
}

export type WbWriteResult = { ok: true } | { ok: false; reason: 'limits_invalid' }

/** The capacity a pilot acted in for one flight entry (flight-logbook
 * capability) — FCL.050's one-function-per-logged-leg model, so the entry's
 * whole `totalMinutes` counts toward exactly one pilot-totals bucket. */
export type PilotFunction = 'pic' | 'spic' | 'sic' | 'dual' | 'instructor'

export type FlightEntryKind = 'flight' | 'fstd'

/** One logged flight leg or FSTD session. `aircraftId`/device fields are
 * mutually exclusive per `kind` (design decision 1, enforced by a DB check
 * constraint too). Every duration is stored as integer minutes (design
 * decision 2). */
export interface FlightEntryRecord {
  id: string
  pilotId: string
  aircraftId: string | null
  kind: FlightEntryKind
  flightDate: string
  departureAerodrome: string | null
  departureTime: string | null
  arrivalAerodrome: string | null
  arrivalTime: string | null
  pilotFunction: PilotFunction
  singleEngine: boolean | null
  multiEngine: boolean | null
  totalMinutes: number
  nightMinutes: number
  ifrMinutes: number
  crossCountryMinutes: number
  instrumentMinutes: number
  hobbsOut: number | null
  hobbsIn: number | null
  tachOut: number | null
  tachIn: number | null
  fuelUplift: number | null
  fuelBurn: number | null
  dayLandings: number
  nightLandings: number
  passengers: number
  remarks: string | null
  deviceType: string | null
  deviceQualification: string | null
  createdAt: Date
  updatedAt: Date
}

export type CreateFlightEntryInput = Omit<
  FlightEntryRecord,
  'id' | 'pilotId' | 'createdAt' | 'updatedAt'
>

export type FlightEntryWriteResult =
  { ok: true; entry: FlightEntryRecord } | { ok: false; reason: 'aircraft_not_owned' }

/** An aircraft's derived hour/landing totals (flight-logbook spec: "Aircraft
 * hour totals are derived from logged flights"). `computable === false` means
 * the aircraft has neither an opening offset nor any logged flights — the
 * screen then states the total cannot be computed rather than showing zero. */
export interface AircraftTotals {
  computable: boolean
  airframeHours: number | null
  engineHours: number | null
  tachHours: number | null
  landings: number | null
}

/** A pilot's lifetime totals plus 90-day recent-experience counts, all
 * derived from logged entries at render time (flight-logbook spec). */
export interface PilotTotals {
  totalMinutes: number
  picMinutes: number
  spicMinutes: number
  sicMinutes: number
  dualMinutes: number
  instructorMinutes: number
  nightMinutes: number
  ifrMinutes: number
  crossCountryMinutes: number
  instrumentMinutes: number
  totalLandings: number
  fstdMinutes: number
  recentLandings90d: number
  recentNightLandings90d: number
  hasEntries: boolean
}

/** Which of the aircraft's derived hour totals a maintenance item's
 * `dueAtHours` is measured against (maintenance-tracking capability). */
export type HoursBasis = 'airframe' | 'tach'

export interface MaintenanceItemRecord {
  id: string
  pilotId: string
  aircraftId: string
  description: string
  dueOn: string | null
  dueAtHours: number | null
  hoursBasis: HoursBasis | null
  recurrenceMonths: number | null
  recurrenceHours: number | null
  reference: string | null
  createdAt: Date
  updatedAt: Date
}

export type CreateMaintenanceItemInput = Omit<
  MaintenanceItemRecord,
  'id' | 'pilotId' | 'aircraftId' | 'createdAt' | 'updatedAt'
>

export type MaintenanceWriteResult =
  { ok: true; item: MaintenanceItemRecord } | { ok: false; reason: 'no_due_condition' }

export interface MaintenanceCompletionRecord {
  id: string
  maintenanceItemId: string
  completedOn: string
  completedAtHours: number | null
  reference: string | null
  createdAt: Date
}

export interface CompleteMaintenanceInput {
  completedOn: string
  completedAtHours: number | null
  reference: string | null
}

/** The due status a maintenance item is presented in — always derived at
 * render time from its due conditions, the current date, and the aircraft's
 * derived hour total (maintenance-tracking spec: "Due status is stated in
 * text"). `not_computable` is the hours-basis equivalent of "none" — the
 * aircraft has no derivable hour total to compare against. */
export type MaintenanceStatus = 'ok' | 'due_soon' | 'overdue'

export interface MaintenanceItemView {
  item: MaintenanceItemRecord
  status: MaintenanceStatus
  daysRemaining: number | null
  hoursRemaining: number | null
  hoursComputable: boolean
  completions: MaintenanceCompletionRecord[]
}

/** One recognized engine-monitor channel (engine-data-import capability).
 * `cylinder` is set for per-cylinder channels (CHT/EGT); `unit` is recorded
 * exactly as found in the file — never converted (spec: "Units preserved"). */
export interface EngineChannel {
  key: string
  label: string
  unit: string
  cylinder: number | null
}

/** Column-oriented sample series: parallel arrays, one value per channel per
 * elapsed-time point. Stored as one compact JSONB document per file (design
 * decision 8) rather than per-sample rows. */
export interface EngineSeries {
  t: number[]
  values: Record<string, number[]>
}

export interface EngineDataFileRecord {
  id: string
  pilotId: string
  flightEntryId: string
  originalFilename: string
  byteSize: number
  contentDigest: string
  detectedFormat: string
  importedAt: Date
  channels: EngineChannel[]
  series: EngineSeries
  ignoredColumns: string[]
}

export type EngineImportRejectReason =
  'unsupported_format' | 'malformed' | 'no_channels' | 'empty' | 'too_large'

export type EngineImportResult =
  { ok: true; file: EngineDataFileRecord } | { ok: false; reason: EngineImportRejectReason }

/** Pilot-entered per-channel limits (engine-data-import spec: "Limits are
 * shown only when the pilot has entered them" — never inferred from the
 * aircraft type or the imported data itself). Keyed by channel key; the unit
 * is whatever unit that channel's own imported samples are recorded in. */
export type EngineLimits = Record<string, number>
