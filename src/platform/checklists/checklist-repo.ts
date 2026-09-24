import type { PoolFacade, Queryable } from '../db/pool.js'
import type {
  Checklist,
  ChecklistItem,
  ChecklistKind,
  ChecklistWithItems,
  ChecklistWriteResult,
  CreateChecklistInput,
  SetPreflightRoleResult,
} from './types.js'

interface ChecklistRow {
  id: string
  pilot_id: string
  aircraft_id: string
  name: string
  kind: ChecklistKind
  role: 'preflight' | null
  source: 'template' | 'pilot'
  template_version: number | null
  position: number
  created_at: Date
  updated_at: Date
}

interface ChecklistItemRow {
  id: string
  pilot_id: string
  checklist_id: string
  text: string
  response: string | null
  position: number
  created_at: Date
  updated_at: Date
}

const CHECKLIST_COLUMNS =
  'id, pilot_id, aircraft_id, name, kind, role, source, template_version, position, created_at, updated_at'
const ITEM_COLUMNS = 'id, pilot_id, checklist_id, text, response, position, created_at, updated_at'

function mapChecklist(row: ChecklistRow): Checklist {
  return {
    id: row.id,
    pilotId: row.pilot_id,
    aircraftId: row.aircraft_id,
    name: row.name,
    kind: row.kind,
    role: row.role,
    source: row.source,
    templateVersion: row.template_version,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapItem(row: ChecklistItemRow): ChecklistItem {
  return {
    id: row.id,
    pilotId: row.pilot_id,
    checklistId: row.checklist_id,
    text: row.text,
    response: row.response,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function ownsNonRetiredAircraft(
  db: Queryable,
  pilotId: string,
  aircraftId: string,
): Promise<boolean> {
  const result = await db.query<{ id: string }>(
    `SELECT id FROM aircraft WHERE id = $1 AND pilot_id = $2 AND retired_at IS NULL LIMIT 1`,
    [aircraftId, pilotId],
  )
  return result.rows.length > 0
}

async function findChecklistRow(
  db: Queryable,
  pilotId: string,
  id: string,
): Promise<ChecklistRow | null> {
  const result = await db.query<ChecklistRow>(
    `SELECT ${CHECKLIST_COLUMNS} FROM checklists WHERE id = $1 AND pilot_id = $2 LIMIT 1`,
    [id, pilotId],
  )
  return result.rows[0] ?? null
}

async function listItemRows(
  db: Queryable,
  pilotId: string,
  checklistId: string,
): Promise<ChecklistItemRow[]> {
  const result = await db.query<ChecklistItemRow>(
    `SELECT ${ITEM_COLUMNS} FROM checklist_items WHERE checklist_id = $1 AND pilot_id = $2 ORDER BY position ASC`,
    [checklistId, pilotId],
  )
  return result.rows
}

async function markPilotSourced(
  db: Queryable,
  pilotId: string,
  checklistId: string,
): Promise<void> {
  await db.query(`UPDATE checklists SET source = 'pilot' WHERE id = $1 AND pilot_id = $2`, [
    checklistId,
    pilotId,
  ])
}

export interface ChecklistRepo {
  /** Every checklist for one of the pilot's aircraft, normal checklists
   * before emergency ones, ordered by position within each group. */
  listForAircraft(pilotId: string, aircraftId: string): Promise<Checklist[]>
  findById(pilotId: string, id: string): Promise<ChecklistWithItems | null>
  create(pilotId: string, input: CreateChecklistInput): Promise<ChecklistWriteResult>
  rename(pilotId: string, id: string, name: string): Promise<ChecklistWriteResult>
  move(pilotId: string, id: string, direction: 'up' | 'down'): Promise<boolean>
  remove(pilotId: string, id: string): Promise<boolean>
  addItem(pilotId: string, checklistId: string, text: string): Promise<ChecklistItem | null>
  updateItem(pilotId: string, checklistId: string, itemId: string, text: string): Promise<boolean>
  moveItem(
    pilotId: string,
    checklistId: string,
    itemId: string,
    direction: 'up' | 'down',
  ): Promise<boolean>
  removeItem(pilotId: string, checklistId: string, itemId: string): Promise<boolean>
  setPreflightRole(
    pilotId: string,
    aircraftId: string,
    checklistId: string,
  ): Promise<SetPreflightRoleResult>
}

export function createChecklistRepo(pool: PoolFacade): ChecklistRepo {
  return {
    async listForAircraft(pilotId, aircraftId) {
      const result = await pool.query<ChecklistRow>(
        `SELECT ${CHECKLIST_COLUMNS} FROM checklists
         WHERE pilot_id = $1 AND aircraft_id = $2
         ORDER BY (kind = 'emergency'), position ASC`,
        [pilotId, aircraftId],
      )
      return result.rows.map(mapChecklist)
    },

    async findById(pilotId, id) {
      const row = await findChecklistRow(pool, pilotId, id)
      if (!row) return null
      const items = await listItemRows(pool, pilotId, id)
      return { ...mapChecklist(row), items: items.map(mapItem) }
    },

    async create(pilotId, input) {
      if (!(await ownsNonRetiredAircraft(pool, pilotId, input.aircraftId))) {
        return { ok: false, reason: 'aircraft_not_owned' }
      }
      return pool.withTransaction(async (tx) => {
        const positionResult = await tx.query<{ next: string }>(
          `SELECT COALESCE(MAX(position) + 1, 0) AS next FROM checklists
           WHERE aircraft_id = $1 AND kind = $2`,
          [input.aircraftId, input.kind],
        )
        const position = Number(positionResult.rows[0]?.next ?? 0)
        const inserted = await tx.query<{ id: string }>(
          `INSERT INTO checklists (pilot_id, aircraft_id, name, kind, role, source, template_version, position)
           VALUES ($1, $2, $3, $4, NULL, 'pilot', NULL, $5)
           RETURNING id`,
          [pilotId, input.aircraftId, input.name, input.kind, position],
        )
        const id = inserted.rows[0]?.id
        if (!id) throw new Error('checklists insert returned no id')
        const row = await findChecklistRow(tx, pilotId, id)
        return { ok: true, checklist: mapChecklist(row as ChecklistRow) }
      })
    },

    async rename(pilotId, id, name) {
      const result = await pool.query<{ id: string }>(
        `UPDATE checklists SET name = $3, source = 'pilot' WHERE id = $1 AND pilot_id = $2 RETURNING id`,
        [id, pilotId, name],
      )
      if (result.rows.length === 0) return { ok: false, reason: 'not_found' }
      const row = await findChecklistRow(pool, pilotId, id)
      return { ok: true, checklist: mapChecklist(row as ChecklistRow) }
    },

    async move(pilotId, id, direction) {
      return pool.withTransaction(async (tx) => {
        const current = await findChecklistRow(tx, pilotId, id)
        if (!current) return false
        const step = direction === 'up' ? -1 : 1
        const neighborResult = await tx.query<ChecklistRow>(
          `SELECT ${CHECKLIST_COLUMNS} FROM checklists
           WHERE aircraft_id = $1 AND kind = $2 AND pilot_id = $3 AND position = $4
           LIMIT 1`,
          [current.aircraft_id, current.kind, pilotId, current.position + step],
        )
        const neighbor = neighborResult.rows[0]
        if (!neighbor) return false
        // Captured before either write: a row object handed back by a query
        // must be treated as a snapshot, never re-read after a write that
        // could target the same row.
        const currentPosition = current.position
        const neighborPosition = neighbor.position
        await tx.query(`UPDATE checklists SET position = $1 WHERE id = $2`, [
          neighborPosition,
          current.id,
        ])
        await tx.query(`UPDATE checklists SET position = $1 WHERE id = $2`, [
          currentPosition,
          neighbor.id,
        ])
        return true
      })
    },

    async remove(pilotId, id) {
      const result = await pool.query<{ id: string }>(
        `DELETE FROM checklists WHERE id = $1 AND pilot_id = $2 RETURNING id`,
        [id, pilotId],
      )
      return result.rows.length > 0
    },

    async addItem(pilotId, checklistId, text) {
      return pool.withTransaction(async (tx) => {
        const checklist = await findChecklistRow(tx, pilotId, checklistId)
        if (!checklist) return null
        const positionResult = await tx.query<{ next: string }>(
          `SELECT COALESCE(MAX(position) + 1, 0) AS next FROM checklist_items WHERE checklist_id = $1`,
          [checklistId],
        )
        const position = Number(positionResult.rows[0]?.next ?? 0)
        const inserted = await tx.query<{ id: string }>(
          `INSERT INTO checklist_items (pilot_id, checklist_id, text, position) VALUES ($1, $2, $3, $4) RETURNING id`,
          [pilotId, checklistId, text, position],
        )
        const id = inserted.rows[0]?.id
        if (!id) throw new Error('checklist_items insert returned no id')
        await markPilotSourced(tx, pilotId, checklistId)
        const itemResult = await tx.query<ChecklistItemRow>(
          `SELECT ${ITEM_COLUMNS} FROM checklist_items WHERE id = $1 LIMIT 1`,
          [id],
        )
        return mapItem(itemResult.rows[0] as ChecklistItemRow)
      })
    },

    async updateItem(pilotId, checklistId, itemId, text) {
      return pool.withTransaction(async (tx) => {
        const result = await tx.query<{ id: string }>(
          `UPDATE checklist_items SET text = $4
           WHERE id = $3 AND checklist_id = $2 AND pilot_id = $1
           RETURNING id`,
          [pilotId, checklistId, itemId, text],
        )
        if (result.rows.length === 0) return false
        await markPilotSourced(tx, pilotId, checklistId)
        return true
      })
    },

    async moveItem(pilotId, checklistId, itemId, direction) {
      return pool.withTransaction(async (tx) => {
        const currentResult = await tx.query<ChecklistItemRow>(
          `SELECT ${ITEM_COLUMNS} FROM checklist_items WHERE id = $1 AND checklist_id = $2 AND pilot_id = $3 LIMIT 1`,
          [itemId, checklistId, pilotId],
        )
        const current = currentResult.rows[0]
        if (!current) return false
        const step = direction === 'up' ? -1 : 1
        const neighborResult = await tx.query<ChecklistItemRow>(
          `SELECT ${ITEM_COLUMNS} FROM checklist_items
           WHERE checklist_id = $1 AND pilot_id = $2 AND position = $3
           LIMIT 1`,
          [checklistId, pilotId, current.position + step],
        )
        const neighbor = neighborResult.rows[0]
        if (!neighbor) return false
        const currentPosition = current.position
        const neighborPosition = neighbor.position
        await tx.query(`UPDATE checklist_items SET position = $1 WHERE id = $2`, [
          neighborPosition,
          current.id,
        ])
        await tx.query(`UPDATE checklist_items SET position = $1 WHERE id = $2`, [
          currentPosition,
          neighbor.id,
        ])
        await markPilotSourced(tx, pilotId, checklistId)
        return true
      })
    },

    async removeItem(pilotId, checklistId, itemId) {
      return pool.withTransaction(async (tx) => {
        const result = await tx.query<{ id: string }>(
          `DELETE FROM checklist_items WHERE id = $1 AND checklist_id = $2 AND pilot_id = $3 RETURNING id`,
          [itemId, checklistId, pilotId],
        )
        if (result.rows.length === 0) return false
        await markPilotSourced(tx, pilotId, checklistId)
        return true
      })
    },

    async setPreflightRole(pilotId, aircraftId, checklistId) {
      return pool.withTransaction(async (tx) => {
        const result = await tx.query<{ kind: ChecklistKind }>(
          `SELECT kind FROM checklists WHERE id = $1 AND pilot_id = $2 AND aircraft_id = $3 LIMIT 1`,
          [checklistId, pilotId, aircraftId],
        )
        const row = result.rows[0]
        if (!row) return { ok: false, reason: 'not_found' }
        if (row.kind === 'emergency') return { ok: false, reason: 'cannot_be_emergency' }

        await tx.query(
          `UPDATE checklists SET role = NULL WHERE aircraft_id = $1 AND pilot_id = $2 AND role = 'preflight'`,
          [aircraftId, pilotId],
        )
        await tx.query(`UPDATE checklists SET role = 'preflight' WHERE id = $1 AND pilot_id = $2`, [
          checklistId,
          pilotId,
        ])
        return { ok: true }
      })
    },
  }
}
