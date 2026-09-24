import type { PoolFacade } from '../db/pool.js'
import type {
  AircraftTotals,
  CreateFlightEntryInput,
  FlightEntryRecord,
  FlightEntryWriteResult,
  PilotTotals,
} from './types.js'

interface FlightEntryRow {
  id: string
  pilot_id: string
  aircraft_id: string | null
  kind: string
  flight_date: string
  departure_aerodrome: string | null
  departure_time: string | null
  arrival_aerodrome: string | null
  arrival_time: string | null
  pilot_function: string
  single_engine: boolean | null
  multi_engine: boolean | null
  total_minutes: number
  night_minutes: number
  ifr_minutes: number
  cross_country_minutes: number
  instrument_minutes: number
  hobbs_out: string | null
  hobbs_in: string | null
  tach_out: string | null
  tach_in: string | null
  fuel_uplift: string | null
  fuel_burn: string | null
  day_landings: number
  night_landings: number
  passengers: number
  remarks: string | null
  device_type: string | null
  device_qualification: string | null
  created_at: Date
  updated_at: Date
}

function n(v: string | null): number | null {
  return v === null ? null : Number(v)
}

function mapEntry(row: FlightEntryRow): FlightEntryRecord {
  return {
    id: row.id,
    pilotId: row.pilot_id,
    aircraftId: row.aircraft_id,
    kind: row.kind as FlightEntryRecord['kind'],
    flightDate: row.flight_date,
    departureAerodrome: row.departure_aerodrome,
    departureTime: row.departure_time,
    arrivalAerodrome: row.arrival_aerodrome,
    arrivalTime: row.arrival_time,
    pilotFunction: row.pilot_function as FlightEntryRecord['pilotFunction'],
    singleEngine: row.single_engine,
    multiEngine: row.multi_engine,
    totalMinutes: row.total_minutes,
    nightMinutes: row.night_minutes,
    ifrMinutes: row.ifr_minutes,
    crossCountryMinutes: row.cross_country_minutes,
    instrumentMinutes: row.instrument_minutes,
    hobbsOut: n(row.hobbs_out),
    hobbsIn: n(row.hobbs_in),
    tachOut: n(row.tach_out),
    tachIn: n(row.tach_in),
    fuelUplift: n(row.fuel_uplift),
    fuelBurn: n(row.fuel_burn),
    dayLandings: row.day_landings,
    nightLandings: row.night_landings,
    passengers: row.passengers,
    remarks: row.remarks,
    deviceType: row.device_type,
    deviceQualification: row.device_qualification,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// flight_date is cast to text: `pg` parses a bare DATE column into a JS
// `Date` (local-midnight, UTC-shifted), not the 'YYYY-MM-DD' string every
// caller here expects (comparisons, display, the FCL.050 date fields) — the
// cast is a pure text format, not a timezone conversion, so it's exact.
const ENTRY_COLUMNS = [
  'id',
  'pilot_id',
  'aircraft_id',
  'kind',
  'flight_date::text AS flight_date',
  'departure_aerodrome',
  'departure_time',
  'arrival_aerodrome',
  'arrival_time',
  'pilot_function',
  'single_engine',
  'multi_engine',
  'total_minutes',
  'night_minutes',
  'ifr_minutes',
  'cross_country_minutes',
  'instrument_minutes',
  'hobbs_out',
  'hobbs_in',
  'tach_out',
  'tach_in',
  'fuel_uplift',
  'fuel_burn',
  'day_landings',
  'night_landings',
  'passengers',
  'remarks',
  'device_type',
  'device_qualification',
  'created_at',
  'updated_at',
].join(', ')

export interface ListEntriesOptions {
  aircraftId?: string
  limit?: number
  offset?: number
}

export interface FlightRepo {
  create(pilotId: string, input: CreateFlightEntryInput): Promise<FlightEntryWriteResult>
  update(
    pilotId: string,
    id: string,
    input: CreateFlightEntryInput,
  ): Promise<FlightEntryWriteResult>
  findById(pilotId: string, id: string): Promise<FlightEntryRecord | null>
  /** The aircraft's most recent flight entry (kind = 'flight'), for the
   * new-entry pre-fill (flight-logbook spec). */
  lastForAircraft(pilotId: string, aircraftId: string): Promise<FlightEntryRecord | null>
  list(pilotId: string, opts?: ListEntriesOptions): Promise<FlightEntryRecord[]>
  count(pilotId: string, opts?: ListEntriesOptions): Promise<number>
  delete(pilotId: string, id: string): Promise<boolean>
  aircraftTotals(pilotId: string, aircraftId: string): Promise<AircraftTotals>
  pilotTotals(pilotId: string, now?: Date): Promise<PilotTotals>
}

export function createFlightRepo(pool: PoolFacade): FlightRepo {
  return {
    async create(pilotId, input) {
      try {
        const inserted = await pool.query<{ id: string }>(
          `INSERT INTO flight_entries (
             pilot_id, aircraft_id, kind, flight_date, departure_aerodrome, departure_time,
             arrival_aerodrome, arrival_time, pilot_function, single_engine, multi_engine,
             total_minutes, night_minutes, ifr_minutes, cross_country_minutes, instrument_minutes,
             hobbs_out, hobbs_in, tach_out, tach_in, fuel_uplift, fuel_burn,
             day_landings, night_landings, passengers, remarks, device_type, device_qualification
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
             $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28
           ) RETURNING id`,
          entryParams(pilotId, input),
        )
        const id = inserted.rows[0]?.id
        if (!id) throw new Error('flight_entries insert returned no id')
        const entry = await findByPilotAndId(pool, pilotId, id)
        return { ok: true, entry: entry as FlightEntryRecord }
      } catch (error) {
        if (isFkViolation(error)) return { ok: false, reason: 'aircraft_not_owned' }
        throw error
      }
    },

    async update(pilotId, id, input) {
      try {
        await pool.query(
          `UPDATE flight_entries SET
             aircraft_id = $3, kind = $4, flight_date = $5, departure_aerodrome = $6,
             departure_time = $7, arrival_aerodrome = $8, arrival_time = $9, pilot_function = $10,
             single_engine = $11, multi_engine = $12, total_minutes = $13, night_minutes = $14,
             ifr_minutes = $15, cross_country_minutes = $16, instrument_minutes = $17,
             hobbs_out = $18, hobbs_in = $19, tach_out = $20, tach_in = $21, fuel_uplift = $22,
             fuel_burn = $23, day_landings = $24, night_landings = $25, passengers = $26,
             remarks = $27, device_type = $28, device_qualification = $29
           WHERE id = $1 AND pilot_id = $2`,
          [id, pilotId, ...entryParams(pilotId, input).slice(1)],
        )
        const entry = await findByPilotAndId(pool, pilotId, id)
        if (!entry) return { ok: false, reason: 'aircraft_not_owned' }
        return { ok: true, entry }
      } catch (error) {
        if (isFkViolation(error)) return { ok: false, reason: 'aircraft_not_owned' }
        throw error
      }
    },

    async findById(pilotId, id) {
      return findByPilotAndId(pool, pilotId, id)
    },

    async lastForAircraft(pilotId, aircraftId) {
      const result = await pool.query<FlightEntryRow>(
        `SELECT ${ENTRY_COLUMNS} FROM flight_entries
         WHERE pilot_id = $1 AND aircraft_id = $2 AND kind = 'flight'
         ORDER BY flight_date DESC, created_at DESC LIMIT 1`,
        [pilotId, aircraftId],
      )
      const row = result.rows[0]
      return row ? mapEntry(row) : null
    },

    async list(pilotId, opts = {}) {
      const params: unknown[] = [pilotId]
      let where = 'pilot_id = $1'
      if (opts.aircraftId) {
        params.push(opts.aircraftId)
        where += ` AND aircraft_id = $${params.length}`
      }
      const limit = opts.limit ?? 50
      const offset = opts.offset ?? 0
      params.push(limit, offset)
      const result = await pool.query<FlightEntryRow>(
        `SELECT ${ENTRY_COLUMNS} FROM flight_entries
         WHERE ${where}
         ORDER BY flight_date DESC, created_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      )
      return result.rows.map(mapEntry)
    },

    async count(pilotId, opts = {}) {
      const params: unknown[] = [pilotId]
      let where = 'pilot_id = $1'
      if (opts.aircraftId) {
        params.push(opts.aircraftId)
        where += ` AND aircraft_id = $${params.length}`
      }
      const result = await pool.query<{ count: string }>(
        `SELECT count(*) AS count FROM flight_entries WHERE ${where}`,
        params,
      )
      return Number(result.rows[0]?.count ?? 0)
    },

    async delete(pilotId, id) {
      const result = await pool.query<{ id: string }>(
        `DELETE FROM flight_entries WHERE id = $1 AND pilot_id = $2 RETURNING id`,
        [id, pilotId],
      )
      return result.rows.length > 0
    },

    async aircraftTotals(pilotId, aircraftId) {
      const openingResult = await pool.query<{
        opening_airframe_hours: string | null
        opening_engine_hours: string | null
        opening_tach_hours: string | null
        opening_landings: number | null
      }>(
        `SELECT opening_airframe_hours, opening_engine_hours, opening_tach_hours, opening_landings
         FROM aircraft WHERE id = $1 AND pilot_id = $2`,
        [aircraftId, pilotId],
      )
      const opening = openingResult.rows[0]

      const aggResult = await pool.query<{
        total_minutes: string | null
        landings: string | null
        count: string
      }>(
        `SELECT
           COALESCE(SUM(total_minutes), 0) AS total_minutes,
           COALESCE(SUM(day_landings + night_landings), 0) AS landings,
           count(*) AS count
         FROM flight_entries
         WHERE pilot_id = $1 AND aircraft_id = $2 AND kind = 'flight'`,
        [pilotId, aircraftId],
      )
      const agg = aggResult.rows[0]
      const flownHours = agg ? Number(agg.total_minutes) / 60 : 0
      const flownLandings = agg ? Number(agg.landings) : 0
      const entryCount = agg ? Number(agg.count) : 0

      const hasOpening = Boolean(
        opening &&
        (opening.opening_airframe_hours !== null ||
          opening.opening_engine_hours !== null ||
          opening.opening_tach_hours !== null ||
          opening.opening_landings !== null),
      )
      const computable = hasOpening || entryCount > 0

      if (!computable) {
        return {
          computable: false,
          airframeHours: null,
          engineHours: null,
          tachHours: null,
          landings: null,
        }
      }

      // Once any offset or entry exists, a missing individual opening field
      // contributes zero rather than making that one total "not computable" —
      // the not-computable state is only for an aircraft with nothing at all
      // (spec: "No offset recorded").
      const openingOr0 = (v: string | null | undefined) => (v ? Number(v) : 0)
      return {
        computable: true,
        airframeHours: openingOr0(opening?.opening_airframe_hours) + flownHours,
        engineHours: openingOr0(opening?.opening_engine_hours) + flownHours,
        tachHours: openingOr0(opening?.opening_tach_hours) + flownHours,
        landings: (opening?.opening_landings ?? 0) + flownLandings,
      }
    },

    async pilotTotals(pilotId, now = new Date()) {
      const cutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
      const cutoffIso = cutoff.toISOString().slice(0, 10)

      const result = await pool.query<{
        total_minutes: string
        pic_minutes: string
        spic_minutes: string
        sic_minutes: string
        dual_minutes: string
        instructor_minutes: string
        night_minutes: string
        ifr_minutes: string
        cross_country_minutes: string
        instrument_minutes: string
        total_landings: string
        fstd_minutes: string
        recent_landings: string
        recent_night_landings: string
        count: string
      }>(
        `SELECT
           COALESCE(SUM(total_minutes) FILTER (WHERE kind = 'flight'), 0) AS total_minutes,
           COALESCE(SUM(total_minutes) FILTER (WHERE kind = 'flight' AND pilot_function = 'pic'), 0) AS pic_minutes,
           COALESCE(SUM(total_minutes) FILTER (WHERE kind = 'flight' AND pilot_function = 'spic'), 0) AS spic_minutes,
           COALESCE(SUM(total_minutes) FILTER (WHERE kind = 'flight' AND pilot_function = 'sic'), 0) AS sic_minutes,
           COALESCE(SUM(total_minutes) FILTER (WHERE kind = 'flight' AND pilot_function = 'dual'), 0) AS dual_minutes,
           COALESCE(SUM(total_minutes) FILTER (WHERE kind = 'flight' AND pilot_function = 'instructor'), 0) AS instructor_minutes,
           COALESCE(SUM(night_minutes) FILTER (WHERE kind = 'flight'), 0) AS night_minutes,
           COALESCE(SUM(ifr_minutes) FILTER (WHERE kind = 'flight'), 0) AS ifr_minutes,
           COALESCE(SUM(cross_country_minutes) FILTER (WHERE kind = 'flight'), 0) AS cross_country_minutes,
           COALESCE(SUM(instrument_minutes) FILTER (WHERE kind = 'flight'), 0) AS instrument_minutes,
           COALESCE(SUM(day_landings + night_landings) FILTER (WHERE kind = 'flight'), 0) AS total_landings,
           COALESCE(SUM(total_minutes) FILTER (WHERE kind = 'fstd'), 0) AS fstd_minutes,
           COALESCE(SUM(day_landings + night_landings) FILTER (WHERE kind = 'flight' AND flight_date >= $2), 0) AS recent_landings,
           COALESCE(SUM(night_landings) FILTER (WHERE kind = 'flight' AND flight_date >= $2), 0) AS recent_night_landings,
           count(*) AS count
         FROM flight_entries WHERE pilot_id = $1`,
        [pilotId, cutoffIso],
      )
      const row = result.rows[0]
      if (!row) {
        return {
          totalMinutes: 0,
          picMinutes: 0,
          spicMinutes: 0,
          sicMinutes: 0,
          dualMinutes: 0,
          instructorMinutes: 0,
          nightMinutes: 0,
          ifrMinutes: 0,
          crossCountryMinutes: 0,
          instrumentMinutes: 0,
          totalLandings: 0,
          fstdMinutes: 0,
          recentLandings90d: 0,
          recentNightLandings90d: 0,
          hasEntries: false,
        }
      }
      return {
        totalMinutes: Number(row.total_minutes),
        picMinutes: Number(row.pic_minutes),
        spicMinutes: Number(row.spic_minutes),
        sicMinutes: Number(row.sic_minutes),
        dualMinutes: Number(row.dual_minutes),
        instructorMinutes: Number(row.instructor_minutes),
        nightMinutes: Number(row.night_minutes),
        ifrMinutes: Number(row.ifr_minutes),
        crossCountryMinutes: Number(row.cross_country_minutes),
        instrumentMinutes: Number(row.instrument_minutes),
        totalLandings: Number(row.total_landings),
        fstdMinutes: Number(row.fstd_minutes),
        recentLandings90d: Number(row.recent_landings),
        recentNightLandings90d: Number(row.recent_night_landings),
        hasEntries: Number(row.count) > 0,
      }
    },
  }
}

function entryParams(pilotId: string, input: CreateFlightEntryInput): unknown[] {
  return [
    pilotId,
    input.aircraftId,
    input.kind,
    input.flightDate,
    input.departureAerodrome,
    input.departureTime,
    input.arrivalAerodrome,
    input.arrivalTime,
    input.pilotFunction,
    input.singleEngine,
    input.multiEngine,
    input.totalMinutes,
    input.nightMinutes,
    input.ifrMinutes,
    input.crossCountryMinutes,
    input.instrumentMinutes,
    input.hobbsOut,
    input.hobbsIn,
    input.tachOut,
    input.tachIn,
    input.fuelUplift,
    input.fuelBurn,
    input.dayLandings,
    input.nightLandings,
    input.passengers,
    input.remarks,
    input.deviceType,
    input.deviceQualification,
  ]
}

async function findByPilotAndId(
  pool: PoolFacade,
  pilotId: string,
  id: string,
): Promise<FlightEntryRecord | null> {
  const result = await pool.query<FlightEntryRow>(
    `SELECT ${ENTRY_COLUMNS} FROM flight_entries WHERE id = $1 AND pilot_id = $2 LIMIT 1`,
    [id, pilotId],
  )
  const row = result.rows[0]
  return row ? mapEntry(row) : null
}

function isFkViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: string }).code === '23503'
  )
}
