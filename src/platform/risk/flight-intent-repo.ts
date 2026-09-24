import type { PoolFacade } from '../db/pool.js'
import type {
  CreateFlightIntentInput,
  FlightIntentRecord,
  FlightIntentWriteResult,
} from './types.js'

interface FlightIntentRow {
  id: string
  pilot_id: string
  aircraft_id: string
  planned_date: string
  departure_icao: string
  destination_icao: string
  created_at: Date
}

function mapFlightIntent(row: FlightIntentRow): FlightIntentRecord {
  return {
    id: row.id,
    pilotId: row.pilot_id,
    aircraftId: row.aircraft_id,
    plannedDate: row.planned_date,
    departureIcao: row.departure_icao,
    destinationIcao: row.destination_icao,
    createdAt: row.created_at,
  }
}

// planned_date cast to text: see fleet's flight-repo.ts ENTRY_COLUMNS comment
// — `pg` parses a bare DATE column into a JS Date, not the 'YYYY-MM-DD'
// string the form values and templates expect.
const FLIGHT_INTENT_COLUMNS =
  'id, pilot_id, aircraft_id, planned_date::text AS planned_date, departure_icao, destination_icao, created_at'

async function ownsNonRetiredAircraft(
  pool: PoolFacade,
  pilotId: string,
  aircraftId: string,
): Promise<boolean> {
  const result = await pool.query<{ id: string }>(
    `SELECT id FROM aircraft WHERE id = $1 AND pilot_id = $2 AND retired_at IS NULL LIMIT 1`,
    [aircraftId, pilotId],
  )
  return result.rows.length > 0
}

export interface FlightIntentRepo {
  create(pilotId: string, input: CreateFlightIntentInput): Promise<FlightIntentWriteResult>
  findById(pilotId: string, id: string): Promise<FlightIntentRecord | null>
  listForPilot(pilotId: string): Promise<FlightIntentRecord[]>
  /** Deletes the flight intent only when no risk assessment references it
   * (flight-intent spec: "A flight intent is a stable attachment point").
   * Returns `false` when not found, not owned, or still referenced. */
  deleteIfUnreferenced(pilotId: string, id: string): Promise<boolean>
}

export function createFlightIntentRepo(pool: PoolFacade): FlightIntentRepo {
  return {
    async create(pilotId, input) {
      if (!(await ownsNonRetiredAircraft(pool, pilotId, input.aircraftId))) {
        return { ok: false, reason: 'aircraft_not_owned' }
      }
      const inserted = await pool.query<{ id: string }>(
        `INSERT INTO flight_intents (pilot_id, aircraft_id, planned_date, departure_icao, destination_icao)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [pilotId, input.aircraftId, input.plannedDate, input.departureIcao, input.destinationIcao],
      )
      const id = inserted.rows[0]?.id
      if (!id) throw new Error('flight_intents insert returned no id')
      const flightIntent = await findByPilotAndId(pool, pilotId, id)
      return { ok: true, flightIntent: flightIntent as FlightIntentRecord }
    },

    async findById(pilotId, id) {
      return findByPilotAndId(pool, pilotId, id)
    },

    async listForPilot(pilotId) {
      const result = await pool.query<FlightIntentRow>(
        `SELECT ${FLIGHT_INTENT_COLUMNS} FROM flight_intents WHERE pilot_id = $1 ORDER BY created_at DESC`,
        [pilotId],
      )
      return result.rows.map(mapFlightIntent)
    },

    async deleteIfUnreferenced(pilotId, id) {
      const result = await pool.query<{ id: string }>(
        `DELETE FROM flight_intents
         WHERE id = $1 AND pilot_id = $2
           AND NOT EXISTS (SELECT 1 FROM risk_assessments WHERE flight_intent_id = $1)
         RETURNING id`,
        [id, pilotId],
      )
      return result.rows.length > 0
    },
  }
}

async function findByPilotAndId(
  pool: PoolFacade,
  pilotId: string,
  id: string,
): Promise<FlightIntentRecord | null> {
  const result = await pool.query<FlightIntentRow>(
    `SELECT ${FLIGHT_INTENT_COLUMNS} FROM flight_intents WHERE id = $1 AND pilot_id = $2 LIMIT 1`,
    [id, pilotId],
  )
  const row = result.rows[0]
  return row ? mapFlightIntent(row) : null
}
