import type { PoolFacade } from '../db/pool.js'
import type {
  AircraftDocumentRecord,
  CreateAircraftDocumentInput,
  DocumentWriteResult,
} from './types.js'

interface DocumentRow {
  id: string
  aircraft_id: string
  pilot_id: string
  kind: string
  reference: string | null
  issued_on: string | null
  expires_on: string | null
  created_at: Date
  updated_at: Date
}

function mapDocument(row: DocumentRow): AircraftDocumentRecord {
  return {
    id: row.id,
    aircraftId: row.aircraft_id,
    pilotId: row.pilot_id,
    kind: row.kind,
    reference: row.reference,
    issuedOn: row.issued_on,
    expiresOn: row.expires_on,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// issued_on/expires_on cast to text: see flight-repo.ts's ENTRY_COLUMNS
// comment — `pg` parses a bare DATE column into a JS Date, not the
// 'YYYY-MM-DD' string `documentStatus`/the templates expect.
const DOCUMENT_COLUMNS =
  'id, aircraft_id, pilot_id, kind, reference, issued_on::text AS issued_on, expires_on::text AS expires_on, created_at, updated_at'

export interface DocumentsRepo {
  list(pilotId: string, aircraftId: string): Promise<AircraftDocumentRecord[]>
  create(
    pilotId: string,
    aircraftId: string,
    input: CreateAircraftDocumentInput,
  ): Promise<DocumentWriteResult>
  delete(pilotId: string, aircraftId: string, documentId: string): Promise<boolean>
}

export function createDocumentsRepo(pool: PoolFacade): DocumentsRepo {
  return {
    async list(pilotId, aircraftId) {
      const result = await pool.query<DocumentRow>(
        `SELECT ${DOCUMENT_COLUMNS} FROM aircraft_documents
         WHERE pilot_id = $1 AND aircraft_id = $2
         ORDER BY created_at ASC`,
        [pilotId, aircraftId],
      )
      return result.rows.map(mapDocument)
    },

    async create(pilotId, aircraftId, input) {
      if (
        input.issuedOn &&
        input.expiresOn &&
        new Date(input.expiresOn).getTime() < new Date(input.issuedOn).getTime()
      ) {
        return { ok: false, reason: 'invalid_dates' }
      }
      try {
        const inserted = await pool.query<{ id: string }>(
          `INSERT INTO aircraft_documents (pilot_id, aircraft_id, kind, reference, issued_on, expires_on)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id`,
          [
            pilotId,
            aircraftId,
            input.kind,
            input.reference ?? null,
            input.issuedOn ?? null,
            input.expiresOn ?? null,
          ],
        )
        const id = inserted.rows[0]?.id
        if (!id) throw new Error('aircraft_documents insert returned no id')
        const result = await pool.query<DocumentRow>(
          `SELECT ${DOCUMENT_COLUMNS} FROM aircraft_documents WHERE id = $1`,
          [id],
        )
        return { ok: true, document: mapDocument(result.rows[0] as DocumentRow) }
      } catch (error) {
        if (isCheckViolation(error)) return { ok: false, reason: 'invalid_dates' }
        throw error
      }
    },

    async delete(pilotId, aircraftId, documentId) {
      const result = await pool.query<{ id: string }>(
        `DELETE FROM aircraft_documents WHERE id = $1 AND pilot_id = $2 AND aircraft_id = $3 RETURNING id`,
        [documentId, pilotId, aircraftId],
      )
      return result.rows.length > 0
    },
  }
}

/** `pg`'s check_violation error code. */
function isCheckViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: string }).code === '23514'
  )
}
