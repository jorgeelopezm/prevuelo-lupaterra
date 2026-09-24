import type { PoolFacade, Queryable } from '../db/pool.js'
import { DEFAULT_LOCALE, type SupportedLocale } from '../i18n/locale.js'
import type {
  AircraftRecord,
  AircraftWriteResult,
  CreateAircraftInput,
  UpdateAircraftInput,
} from './types.js'

interface AircraftRow {
  id: string
  pilot_id: string
  registration: string
  icao_type: string
  manufacturer: string
  model: string
  serial_number: string | null
  class_category: string | null
  engine: string | null
  propeller: string | null
  year_of_manufacture: number | null
  home_base: string | null
  nickname: string | null
  opening_airframe_hours: string | null
  opening_engine_hours: string | null
  opening_tach_hours: string | null
  opening_landings: number | null
  retired_at: Date | null
  created_at: Date
  updated_at: Date
}

const AIRCRAFT_COLUMNS = [
  'id',
  'pilot_id',
  'registration',
  'icao_type',
  'manufacturer',
  'model',
  'serial_number',
  'class_category',
  'engine',
  'propeller',
  'year_of_manufacture',
  'home_base',
  'nickname',
  'opening_airframe_hours',
  'opening_engine_hours',
  'opening_tach_hours',
  'opening_landings',
  'retired_at',
  'created_at',
  'updated_at',
].join(', ')

function mapAircraft(row: AircraftRow): AircraftRecord {
  return {
    id: row.id,
    pilotId: row.pilot_id,
    registration: row.registration,
    icaoType: row.icao_type,
    manufacturer: row.manufacturer,
    model: row.model,
    serialNumber: row.serial_number,
    classCategory: row.class_category,
    engine: row.engine,
    propeller: row.propeller,
    yearOfManufacture: row.year_of_manufacture,
    homeBase: row.home_base,
    nickname: row.nickname,
    openingAirframeHours:
      row.opening_airframe_hours === null ? null : Number(row.opening_airframe_hours),
    openingEngineHours: row.opening_engine_hours === null ? null : Number(row.opening_engine_hours),
    openingTachHours: row.opening_tach_hours === null ? null : Number(row.opening_tach_hours),
    openingLandings: row.opening_landings,
    retiredAt: row.retired_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** Letters/digits only, upper-cased — mirrors the DB's registration-uniqueness
 * normalization (migration 004) so `EC-ABC` and `ec abc` compare equal. */
export function normalizeRegistration(registration: string): string {
  return registration.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

async function findDuplicate(
  pool: Queryable,
  pilotId: string,
  registration: string,
  excludeId?: string,
): Promise<boolean> {
  const normalized = normalizeRegistration(registration)
  const result = await pool.query<{ id: string }>(
    `SELECT id FROM aircraft
     WHERE pilot_id = $1
       AND retired_at IS NULL
       AND upper(regexp_replace(registration, '[^A-Za-z0-9]', '', 'g')) = $2
       ${excludeId ? 'AND id <> $3' : ''}
     LIMIT 1`,
    excludeId ? [pilotId, normalized, excludeId] : [pilotId, normalized],
  )
  return result.rows.length > 0
}

export interface AircraftRepo {
  /**
   * `locale` (defaulting to the application default) is passed through to
   * `onAircraftCreated` untouched — it decides nothing about the aircraft
   * row itself, only what a hook seeds alongside it.
   */
  create(
    pilotId: string,
    input: CreateAircraftInput,
    locale?: SupportedLocale,
  ): Promise<AircraftWriteResult>
  update(pilotId: string, id: string, input: UpdateAircraftInput): Promise<AircraftWriteResult>
  findById(pilotId: string, id: string): Promise<AircraftRecord | null>
  list(pilotId: string): Promise<AircraftRecord[]>
  /** Non-retired aircraft only — the set offerable for a new flight entry or
   * as the active aircraft. */
  listActive(pilotId: string): Promise<AircraftRecord[]>
  retire(pilotId: string, id: string): Promise<boolean>
  setActiveAircraft(pilotId: string, aircraftId: string | null): Promise<boolean>
  /** The pilot's active aircraft, or `null` when none is designated. */
  getActiveAircraft(pilotId: string): Promise<AircraftRecord | null>
}

export interface AircraftRepoOptions {
  /**
   * Invoked inside `create`'s own transaction, right after the aircraft row
   * is inserted — a throw rolls back the aircraft insert alongside whatever
   * the hook already wrote (design.md decision 3). Wired at composition time
   * (the module that owns aircraft creation) with the checklists platform's
   * `seedChecklistsForAircraft`; `platform/fleet` never imports
   * `platform/checklists` directly, keeping the two platform domains
   * decoupled via injection rather than a direct dependency.
   */
  onAircraftCreated?: (
    tx: Queryable,
    pilotId: string,
    aircraftId: string,
    locale: SupportedLocale,
  ) => Promise<void>
}

export function createAircraftRepo(
  pool: PoolFacade,
  options: AircraftRepoOptions = {},
): AircraftRepo {
  const { onAircraftCreated } = options
  return {
    async create(pilotId, input, locale = DEFAULT_LOCALE) {
      return pool.withTransaction(async (tx) => {
        if (await findDuplicate(tx, pilotId, input.registration)) {
          return { ok: false, reason: 'duplicate_registration' }
        }
        try {
          const inserted = await tx.query<{ id: string }>(
            `INSERT INTO aircraft (
               pilot_id, registration, icao_type, manufacturer, model, serial_number,
               class_category, engine, propeller, year_of_manufacture, home_base, nickname,
               opening_airframe_hours, opening_engine_hours, opening_tach_hours, opening_landings
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
             RETURNING id`,
            [
              pilotId,
              input.registration,
              input.icaoType,
              input.manufacturer,
              input.model,
              input.serialNumber ?? null,
              input.classCategory ?? null,
              input.engine ?? null,
              input.propeller ?? null,
              input.yearOfManufacture ?? null,
              input.homeBase ?? null,
              input.nickname ?? null,
              input.openingAirframeHours ?? null,
              input.openingEngineHours ?? null,
              input.openingTachHours ?? null,
              input.openingLandings ?? null,
            ],
          )
          const id = inserted.rows[0]?.id
          if (!id) throw new Error('aircraft insert returned no id')
          if (onAircraftCreated) await onAircraftCreated(tx, pilotId, id, locale)
          const aircraft = await findByPilotAndId(tx, pilotId, id)
          return { ok: true, aircraft: aircraft as AircraftRecord }
        } catch (error) {
          // Defense in depth against the partial unique index (migration
          // 004): a race between the pre-check above and the insert.
          if (isUniqueViolation(error)) return { ok: false, reason: 'duplicate_registration' }
          throw error
        }
      })
    },

    async update(pilotId, id, input) {
      if (await findDuplicate(pool, pilotId, input.registration, id)) {
        return { ok: false, reason: 'duplicate_registration' }
      }
      try {
        const result = await pool.query(
          `UPDATE aircraft SET
             registration = $3, icao_type = $4, manufacturer = $5, model = $6,
             serial_number = $7, class_category = $8, engine = $9, propeller = $10,
             year_of_manufacture = $11, home_base = $12, nickname = $13,
             opening_airframe_hours = $14, opening_engine_hours = $15,
             opening_tach_hours = $16, opening_landings = $17
           WHERE id = $1 AND pilot_id = $2`,
          [
            id,
            pilotId,
            input.registration,
            input.icaoType,
            input.manufacturer,
            input.model,
            input.serialNumber ?? null,
            input.classCategory ?? null,
            input.engine ?? null,
            input.propeller ?? null,
            input.yearOfManufacture ?? null,
            input.homeBase ?? null,
            input.nickname ?? null,
            input.openingAirframeHours ?? null,
            input.openingEngineHours ?? null,
            input.openingTachHours ?? null,
            input.openingLandings ?? null,
          ],
        )
        void result
        const aircraft = await findByPilotAndId(pool, pilotId, id)
        if (!aircraft) return { ok: false, reason: 'duplicate_registration' }
        return { ok: true, aircraft }
      } catch (error) {
        if (isUniqueViolation(error)) return { ok: false, reason: 'duplicate_registration' }
        throw error
      }
    },

    async findById(pilotId, id) {
      return findByPilotAndId(pool, pilotId, id)
    },

    async list(pilotId) {
      const result = await pool.query<AircraftRow>(
        `SELECT ${AIRCRAFT_COLUMNS} FROM aircraft WHERE pilot_id = $1 ORDER BY created_at ASC`,
        [pilotId],
      )
      return result.rows.map(mapAircraft)
    },

    async listActive(pilotId) {
      const result = await pool.query<AircraftRow>(
        `SELECT ${AIRCRAFT_COLUMNS} FROM aircraft
         WHERE pilot_id = $1 AND retired_at IS NULL
         ORDER BY created_at ASC`,
        [pilotId],
      )
      return result.rows.map(mapAircraft)
    },

    async retire(pilotId, id) {
      return pool.withTransaction(async (tx) => {
        const updated = await tx.query<{ id: string }>(
          `UPDATE aircraft SET retired_at = now()
           WHERE id = $1 AND pilot_id = $2 AND retired_at IS NULL
           RETURNING id`,
          [id, pilotId],
        )
        if (updated.rows.length === 0) return false
        // Clear the active designation in the same transaction if this was it
        // (spec: "Retired aircraft cannot be active").
        await tx.query(
          `UPDATE pilots SET active_aircraft_id = NULL
           WHERE id = $1 AND active_aircraft_id = $2`,
          [pilotId, id],
        )
        return true
      })
    },

    async setActiveAircraft(pilotId, aircraftId) {
      if (aircraftId === null) {
        await pool.query('UPDATE pilots SET active_aircraft_id = NULL WHERE id = $1', [pilotId])
        return true
      }
      const result = await pool.query(
        `UPDATE pilots SET active_aircraft_id = $2
         WHERE id = $1
           AND EXISTS (
             SELECT 1 FROM aircraft
             WHERE id = $2 AND pilot_id = $1 AND retired_at IS NULL
           )`,
        [pilotId, aircraftId],
      )
      void result
      return true
    },

    async getActiveAircraft(pilotId) {
      const result = await pool.query<AircraftRow>(
        `SELECT a.${AIRCRAFT_COLUMNS.split(', ').join(', a.')} FROM pilots p
         JOIN aircraft a ON a.id = p.active_aircraft_id
         WHERE p.id = $1`,
        [pilotId],
      )
      const row = result.rows[0]
      return row ? mapAircraft(row) : null
    },
  }
}

async function findByPilotAndId(
  pool: Queryable,
  pilotId: string,
  id: string,
): Promise<AircraftRecord | null> {
  const result = await pool.query<AircraftRow>(
    `SELECT ${AIRCRAFT_COLUMNS} FROM aircraft WHERE id = $1 AND pilot_id = $2 LIMIT 1`,
    [id, pilotId],
  )
  const row = result.rows[0]
  return row ? mapAircraft(row) : null
}

/** `pg`'s unique_violation error code. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505'
  )
}
