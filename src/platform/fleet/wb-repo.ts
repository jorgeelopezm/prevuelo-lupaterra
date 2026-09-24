import type { PoolFacade } from '../db/pool.js'
import type {
  CgEnvelopePoint,
  CreateWbProfileInput,
  LoadStation,
  WbProfile,
  WbWriteResult,
} from './types.js'

interface AircraftWbRow {
  wb_empty_weight: string | null
  wb_empty_weight_arm: string | null
  wb_mtow: string | null
  wb_mlw: string | null
  wb_mzfw: string | null
  wb_usable_fuel_qty: string | null
  wb_usable_fuel_arm: string | null
  wb_mass_unit: string | null
  wb_length_unit: string | null
}

interface StationRow {
  id: string
  position: number
  name: string
  arm: string
  max_weight: string | null
}

interface EnvelopePointRow {
  id: string
  position: number
  weight: string
  cg: string
}

function toNumberOrNull(value: string | null): number | null {
  return value === null ? null : Number(value)
}

export interface WbRepo {
  get(pilotId: string, aircraftId: string): Promise<WbProfile>
  /** Replaces the whole profile (empty-weight fields plus every load station
   * and envelope point) in one transaction. */
  set(pilotId: string, aircraftId: string, input: CreateWbProfileInput): Promise<WbWriteResult>
}

export function createWbRepo(pool: PoolFacade): WbRepo {
  return {
    async get(pilotId, aircraftId) {
      const aircraftResult = await pool.query<AircraftWbRow>(
        `SELECT wb_empty_weight, wb_empty_weight_arm, wb_mtow, wb_mlw, wb_mzfw,
                wb_usable_fuel_qty, wb_usable_fuel_arm, wb_mass_unit, wb_length_unit
         FROM aircraft WHERE id = $1 AND pilot_id = $2`,
        [aircraftId, pilotId],
      )
      const row = aircraftResult.rows[0]

      const stationsResult = await pool.query<StationRow>(
        `SELECT id, position, name, arm, max_weight FROM aircraft_load_stations
         WHERE pilot_id = $1 AND aircraft_id = $2 ORDER BY position ASC`,
        [pilotId, aircraftId],
      )
      const pointsResult = await pool.query<EnvelopePointRow>(
        `SELECT id, position, weight, cg FROM aircraft_cg_envelope_points
         WHERE pilot_id = $1 AND aircraft_id = $2 ORDER BY position ASC`,
        [pilotId, aircraftId],
      )

      const loadStations: LoadStation[] = stationsResult.rows.map((s) => ({
        id: s.id,
        position: s.position,
        name: s.name,
        arm: Number(s.arm),
        maxWeight: toNumberOrNull(s.max_weight),
      }))
      const envelopePoints: CgEnvelopePoint[] = pointsResult.rows.map((p) => ({
        id: p.id,
        position: p.position,
        weight: Number(p.weight),
        cg: Number(p.cg),
      }))

      return {
        emptyWeight: row ? toNumberOrNull(row.wb_empty_weight) : null,
        emptyWeightArm: row ? toNumberOrNull(row.wb_empty_weight_arm) : null,
        mtow: row ? toNumberOrNull(row.wb_mtow) : null,
        mlw: row ? toNumberOrNull(row.wb_mlw) : null,
        mzfw: row ? toNumberOrNull(row.wb_mzfw) : null,
        usableFuelQty: row ? toNumberOrNull(row.wb_usable_fuel_qty) : null,
        usableFuelArm: row ? toNumberOrNull(row.wb_usable_fuel_arm) : null,
        massUnit: row?.wb_mass_unit ?? null,
        lengthUnit: row?.wb_length_unit ?? null,
        loadStations,
        envelopePoints,
      }
    },

    async set(pilotId, aircraftId, input) {
      if (input.emptyWeight !== null && input.mtow !== null && input.emptyWeight > input.mtow) {
        return { ok: false, reason: 'limits_invalid' }
      }
      try {
        await pool.withTransaction(async (tx) => {
          await tx.query(
            `UPDATE aircraft SET
               wb_empty_weight = $3, wb_empty_weight_arm = $4, wb_mtow = $5, wb_mlw = $6,
               wb_mzfw = $7, wb_usable_fuel_qty = $8, wb_usable_fuel_arm = $9,
               wb_mass_unit = $10, wb_length_unit = $11
             WHERE id = $1 AND pilot_id = $2`,
            [
              aircraftId,
              pilotId,
              input.emptyWeight,
              input.emptyWeightArm,
              input.mtow,
              input.mlw,
              input.mzfw,
              input.usableFuelQty,
              input.usableFuelArm,
              input.massUnit,
              input.lengthUnit,
            ],
          )

          await tx.query(
            `DELETE FROM aircraft_load_stations WHERE pilot_id = $1 AND aircraft_id = $2`,
            [pilotId, aircraftId],
          )
          let position = 0
          for (const station of input.loadStations) {
            await tx.query(
              `INSERT INTO aircraft_load_stations (pilot_id, aircraft_id, position, name, arm, max_weight)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              [pilotId, aircraftId, position, station.name, station.arm, station.maxWeight],
            )
            position += 1
          }

          await tx.query(
            `DELETE FROM aircraft_cg_envelope_points WHERE pilot_id = $1 AND aircraft_id = $2`,
            [pilotId, aircraftId],
          )
          let pointPosition = 0
          for (const point of input.envelopePoints) {
            await tx.query(
              `INSERT INTO aircraft_cg_envelope_points (pilot_id, aircraft_id, position, weight, cg)
               VALUES ($1, $2, $3, $4, $5)`,
              [pilotId, aircraftId, pointPosition, point.weight, point.cg],
            )
            pointPosition += 1
          }
        })
        return { ok: true }
      } catch (error) {
        if (isCheckViolation(error)) return { ok: false, reason: 'limits_invalid' }
        throw error
      }
    },
  }
}

function isCheckViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: string }).code === '23514'
  )
}
