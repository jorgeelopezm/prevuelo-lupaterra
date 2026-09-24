import type { PoolFacade } from '../db/pool.js'
import type {
  CompleteMaintenanceInput,
  CreateMaintenanceItemInput,
  MaintenanceCompletionRecord,
  MaintenanceItemRecord,
  MaintenanceWriteResult,
} from './types.js'
import { rollForward } from './maintenance-status.js'

interface ItemRow {
  id: string
  pilot_id: string
  aircraft_id: string
  description: string
  due_on: string | null
  due_at_hours: string | null
  hours_basis: string | null
  recurrence_months: number | null
  recurrence_hours: string | null
  reference: string | null
  created_at: Date
  updated_at: Date
}

interface CompletionRow {
  id: string
  maintenance_item_id: string
  completed_on: string
  completed_at_hours: string | null
  reference: string | null
  created_at: Date
}

function mapItem(row: ItemRow): MaintenanceItemRecord {
  return {
    id: row.id,
    pilotId: row.pilot_id,
    aircraftId: row.aircraft_id,
    description: row.description,
    dueOn: row.due_on,
    dueAtHours: row.due_at_hours === null ? null : Number(row.due_at_hours),
    hoursBasis: row.hours_basis as MaintenanceItemRecord['hoursBasis'],
    recurrenceMonths: row.recurrence_months,
    recurrenceHours: row.recurrence_hours === null ? null : Number(row.recurrence_hours),
    reference: row.reference,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapCompletion(row: CompletionRow): MaintenanceCompletionRecord {
  return {
    id: row.id,
    maintenanceItemId: row.maintenance_item_id,
    completedOn: row.completed_on,
    completedAtHours: row.completed_at_hours === null ? null : Number(row.completed_at_hours),
    reference: row.reference,
    createdAt: row.created_at,
  }
}

// due_on/completed_on cast to text: see flight-repo.ts's ENTRY_COLUMNS
// comment — `pg` parses a bare DATE column into a JS Date, not the
// 'YYYY-MM-DD' string `deriveMaintenanceStatus`/`rollForward`/the templates
// expect.
const ITEM_COLUMNS =
  'id, pilot_id, aircraft_id, description, due_on::text AS due_on, due_at_hours, hours_basis, recurrence_months, recurrence_hours, reference, created_at, updated_at'
const COMPLETION_COLUMNS =
  'id, maintenance_item_id, completed_on::text AS completed_on, completed_at_hours, reference, created_at'

export interface MaintenanceRepo {
  list(pilotId: string, aircraftId: string): Promise<MaintenanceItemRecord[]>
  findById(pilotId: string, id: string): Promise<MaintenanceItemRecord | null>
  create(
    pilotId: string,
    aircraftId: string,
    input: CreateMaintenanceItemInput,
  ): Promise<MaintenanceWriteResult>
  listCompletions(maintenanceItemId: string): Promise<MaintenanceCompletionRecord[]>
  /** Records a completion and, per the item's recurrence, rolls its due
   * condition forward (or leaves it closed with no new condition). */
  complete(
    pilotId: string,
    id: string,
    input: CompleteMaintenanceInput,
  ): Promise<MaintenanceItemRecord | null>
}

export function createMaintenanceRepo(pool: PoolFacade): MaintenanceRepo {
  return {
    async list(pilotId, aircraftId) {
      const result = await pool.query<ItemRow>(
        `SELECT ${ITEM_COLUMNS} FROM maintenance_items
         WHERE pilot_id = $1 AND aircraft_id = $2
         ORDER BY created_at ASC`,
        [pilotId, aircraftId],
      )
      return result.rows.map(mapItem)
    },

    async findById(pilotId, id) {
      const result = await pool.query<ItemRow>(
        `SELECT ${ITEM_COLUMNS} FROM maintenance_items WHERE id = $1 AND pilot_id = $2 LIMIT 1`,
        [id, pilotId],
      )
      const row = result.rows[0]
      return row ? mapItem(row) : null
    },

    async create(pilotId, aircraftId, input) {
      if (input.dueOn === null && input.dueAtHours === null) {
        return { ok: false, reason: 'no_due_condition' }
      }
      const inserted = await pool.query<{ id: string }>(
        `INSERT INTO maintenance_items (
           pilot_id, aircraft_id, description, due_on, due_at_hours, hours_basis,
           recurrence_months, recurrence_hours, reference
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [
          pilotId,
          aircraftId,
          input.description,
          input.dueOn,
          input.dueAtHours,
          input.hoursBasis,
          input.recurrenceMonths,
          input.recurrenceHours,
          input.reference,
        ],
      )
      const id = inserted.rows[0]?.id
      if (!id) throw new Error('maintenance_items insert returned no id')
      const item = await this.findById(pilotId, id)
      return { ok: true, item: item as MaintenanceItemRecord }
    },

    async listCompletions(maintenanceItemId) {
      const result = await pool.query<CompletionRow>(
        `SELECT ${COMPLETION_COLUMNS} FROM maintenance_completions
         WHERE maintenance_item_id = $1 ORDER BY completed_on DESC`,
        [maintenanceItemId],
      )
      return result.rows.map(mapCompletion)
    },

    async complete(pilotId, id, input) {
      const item = await this.findById(pilotId, id)
      if (!item) return null

      return pool.withTransaction(async (tx) => {
        await tx.query(
          `INSERT INTO maintenance_completions (pilot_id, maintenance_item_id, completed_on, completed_at_hours, reference)
           VALUES ($1, $2, $3, $4, $5)`,
          [pilotId, id, input.completedOn, input.completedAtHours, input.reference],
        )

        const { dueOn, dueAtHours } = rollForward(item, input.completedOn, input.completedAtHours)
        await tx.query(
          `UPDATE maintenance_items SET due_on = $2, due_at_hours = $3 WHERE id = $1`,
          [id, dueOn, dueAtHours],
        )

        const result = await tx.query<ItemRow>(
          `SELECT ${ITEM_COLUMNS} FROM maintenance_items WHERE id = $1`,
          [id],
        )
        return mapItem(result.rows[0] as ItemRow)
      })
    },
  }
}
