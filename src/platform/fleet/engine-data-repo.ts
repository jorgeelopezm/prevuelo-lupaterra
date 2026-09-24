import type { PoolFacade } from '../db/pool.js'
import type { EngineDataFileRecord, EngineLimits } from './types.js'
import type { ImportedEngineData } from '../../modules/fleet/engine-data/importer.js'

interface FileRow {
  id: string
  pilot_id: string
  flight_entry_id: string
  original_filename: string
  byte_size: number
  content_digest: string
  detected_format: string
  imported_at: Date
  channels: EngineDataFileRecord['channels']
  series: EngineDataFileRecord['series']
  ignored_columns: string[]
}

function mapFile(row: FileRow): EngineDataFileRecord {
  return {
    id: row.id,
    pilotId: row.pilot_id,
    flightEntryId: row.flight_entry_id,
    originalFilename: row.original_filename,
    byteSize: row.byte_size,
    contentDigest: row.content_digest,
    detectedFormat: row.detected_format,
    importedAt: row.imported_at,
    channels: row.channels,
    series: row.series,
    ignoredColumns: row.ignored_columns,
  }
}

const FILE_COLUMNS =
  'id, pilot_id, flight_entry_id, original_filename, byte_size, content_digest, detected_format, imported_at, channels, series, ignored_columns'

export interface EngineDataRepo {
  getForFlight(pilotId: string, flightEntryId: string): Promise<EngineDataFileRecord | null>
  /** Replaces any existing import for this flight entry (design decision 8:
   * one import per flight entry). Caller has already verified the flight
   * entry belongs to this pilot. */
  replace(
    pilotId: string,
    flightEntryId: string,
    data: ImportedEngineData,
  ): Promise<EngineDataFileRecord>
  delete(pilotId: string, flightEntryId: string): Promise<boolean>
  getAircraftLimits(pilotId: string, aircraftId: string): Promise<EngineLimits | null>
  setAircraftLimits(pilotId: string, aircraftId: string, limits: EngineLimits): Promise<void>
}

export function createEngineDataRepo(pool: PoolFacade): EngineDataRepo {
  return {
    async getForFlight(pilotId, flightEntryId) {
      const result = await pool.query<FileRow>(
        `SELECT ${FILE_COLUMNS} FROM engine_data_files WHERE pilot_id = $1 AND flight_entry_id = $2`,
        [pilotId, flightEntryId],
      )
      const row = result.rows[0]
      return row ? mapFile(row) : null
    },

    async replace(pilotId, flightEntryId, data) {
      return pool.withTransaction(async (tx) => {
        await tx.query(
          `DELETE FROM engine_data_files WHERE pilot_id = $1 AND flight_entry_id = $2`,
          [pilotId, flightEntryId],
        )
        const inserted = await tx.query<{ id: string }>(
          `INSERT INTO engine_data_files (
             pilot_id, flight_entry_id, original_filename, byte_size, content_digest,
             detected_format, channels, series, ignored_columns
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING id`,
          [
            pilotId,
            flightEntryId,
            data.originalFilename,
            data.byteSize,
            data.contentDigest,
            data.detectedFormat,
            JSON.stringify(data.channels),
            JSON.stringify(data.series),
            data.ignoredColumns,
          ],
        )
        const id = inserted.rows[0]?.id
        if (!id) throw new Error('engine_data_files insert returned no id')
        const result = await tx.query<FileRow>(
          `SELECT ${FILE_COLUMNS} FROM engine_data_files WHERE id = $1`,
          [id],
        )
        return mapFile(result.rows[0] as FileRow)
      })
    },

    async delete(pilotId, flightEntryId) {
      const result = await pool.query<{ id: string }>(
        `DELETE FROM engine_data_files WHERE pilot_id = $1 AND flight_entry_id = $2 RETURNING id`,
        [pilotId, flightEntryId],
      )
      return result.rows.length > 0
    },

    async getAircraftLimits(pilotId, aircraftId) {
      const result = await pool.query<{ engine_limits: EngineLimits | null }>(
        `SELECT engine_limits FROM aircraft WHERE id = $1 AND pilot_id = $2`,
        [aircraftId, pilotId],
      )
      return result.rows[0]?.engine_limits ?? null
    },

    async setAircraftLimits(pilotId, aircraftId, limits) {
      await pool.query(`UPDATE aircraft SET engine_limits = $3 WHERE id = $1 AND pilot_id = $2`, [
        aircraftId,
        pilotId,
        JSON.stringify(limits),
      ])
    },
  }
}
