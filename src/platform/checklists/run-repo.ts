import type { PoolFacade, Queryable } from '../db/pool.js'
import type { ChecklistRunItem, ChecklistRunWithItems, PreflightProgress } from './types.js'

interface ChecklistRunRow {
  id: string
  pilot_id: string
  checklist_id: string | null
  checklist_name: string
  flight_intent_id: string
  aircraft_id: string
  started_at: Date
  completed_at: Date | null
}

interface ChecklistRunItemRow {
  id: string
  pilot_id: string
  run_id: string
  checklist_item_id: string | null
  text: string
  position: number
  checked_at: Date | null
}

const RUN_COLUMNS =
  'id, pilot_id, checklist_id, checklist_name, flight_intent_id, aircraft_id, started_at, completed_at'
const RUN_ITEM_COLUMNS = 'id, pilot_id, run_id, checklist_item_id, text, position, checked_at'

function mapRun(row: ChecklistRunRow): Omit<ChecklistRunWithItems, 'items'> {
  return {
    id: row.id,
    pilotId: row.pilot_id,
    checklistId: row.checklist_id,
    checklistName: row.checklist_name,
    flightIntentId: row.flight_intent_id,
    aircraftId: row.aircraft_id,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  }
}

function mapRunItem(row: ChecklistRunItemRow): ChecklistRunItem {
  return {
    id: row.id,
    pilotId: row.pilot_id,
    runId: row.run_id,
    checklistItemId: row.checklist_item_id,
    text: row.text,
    position: row.position,
    checkedAt: row.checked_at,
  }
}

async function loadRunRow(
  db: Queryable,
  pilotId: string,
  runId: string,
): Promise<ChecklistRunRow | null> {
  const result = await db.query<ChecklistRunRow>(
    `SELECT ${RUN_COLUMNS} FROM checklist_runs WHERE id = $1 AND pilot_id = $2 LIMIT 1`,
    [runId, pilotId],
  )
  return result.rows[0] ?? null
}

async function loadRunItemRows(
  db: Queryable,
  pilotId: string,
  runId: string,
): Promise<ChecklistRunItemRow[]> {
  const result = await db.query<ChecklistRunItemRow>(
    `SELECT ${RUN_ITEM_COLUMNS} FROM checklist_run_items WHERE run_id = $1 AND pilot_id = $2 ORDER BY position ASC`,
    [runId, pilotId],
  )
  return result.rows
}

async function loadRunWithItems(
  db: Queryable,
  pilotId: string,
  runId: string,
): Promise<ChecklistRunWithItems | null> {
  const row = await loadRunRow(db, pilotId, runId)
  if (!row) return null
  const items = await loadRunItemRows(db, pilotId, runId)
  return { ...mapRun(row), items: items.map(mapRunItem) }
}

/** `pg`'s unique_violation error code. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505'
  )
}

export type OpenOrStartResult =
  | { ok: true; run: ChecklistRunWithItems }
  | { ok: false; reason: 'checklist_not_found' | 'checklist_is_emergency' }

export type ToggleItemResult =
  { ok: true; run: ChecklistRunWithItems } | { ok: false; reason: 'not_found' | 'completed' }

export type ResetRunResult =
  { ok: true; run: ChecklistRunWithItems } | { ok: false; reason: 'not_found' | 'completed' }

export interface RunRepo {
  /** Resumes the pilot's open run for `(flightIntentId, checklistId)`, or
   * starts one by snapshotting the checklist's current items (design
   * decision 1/6). Rejects an emergency checklist (design decision 5) —
   * defense in depth; the route never calls this for one. */
  openOrStart(
    pilotId: string,
    checklistId: string,
    flightIntentId: string,
  ): Promise<OpenOrStartResult>
  findById(pilotId: string, id: string): Promise<ChecklistRunWithItems | null>
  toggleItem(pilotId: string, runId: string, runItemId: string): Promise<ToggleItemResult>
  reset(pilotId: string, runId: string): Promise<ResetRunResult>
  listCompletedForAircraft(pilotId: string, aircraftId: string): Promise<ChecklistRunWithItems[]>
  preflightProgressForIntent(
    pilotId: string,
    flightIntentId: string,
    aircraftId: string,
  ): Promise<PreflightProgress | null>
}

export function createRunRepo(pool: PoolFacade): RunRepo {
  return {
    async openOrStart(pilotId, checklistId, flightIntentId) {
      const checklistResult = await pool.query<{
        id: string
        aircraft_id: string
        kind: string
        name: string
      }>(
        `SELECT id, aircraft_id, kind, name FROM checklists WHERE id = $1 AND pilot_id = $2 LIMIT 1`,
        [checklistId, pilotId],
      )
      const checklist = checklistResult.rows[0]
      if (!checklist) return { ok: false, reason: 'checklist_not_found' }
      if (checklist.kind === 'emergency') return { ok: false, reason: 'checklist_is_emergency' }

      return pool.withTransaction(async (tx) => {
        const findOpen = () =>
          tx.query<{ id: string }>(
            `SELECT id FROM checklist_runs
             WHERE pilot_id = $1 AND flight_intent_id = $2 AND checklist_id = $3 AND completed_at IS NULL
             LIMIT 1`,
            [pilotId, flightIntentId, checklistId],
          )

        const existing = await findOpen()
        if (existing.rows[0]) {
          const run = await loadRunWithItems(tx, pilotId, existing.rows[0].id)
          return { ok: true, run: run as ChecklistRunWithItems }
        }

        const items = await tx.query<{ id: string; text: string; position: number }>(
          `SELECT id, text, position FROM checklist_items WHERE checklist_id = $1 AND pilot_id = $2 ORDER BY position ASC`,
          [checklistId, pilotId],
        )

        try {
          const inserted = await tx.query<{ id: string }>(
            `INSERT INTO checklist_runs (pilot_id, checklist_id, checklist_name, flight_intent_id, aircraft_id)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id`,
            [pilotId, checklistId, checklist.name, flightIntentId, checklist.aircraft_id],
          )
          const runId = inserted.rows[0]?.id
          if (!runId) throw new Error('checklist_runs insert returned no id')
          for (const item of items.rows) {
            await tx.query(
              `INSERT INTO checklist_run_items (pilot_id, run_id, checklist_item_id, text, position)
               VALUES ($1, $2, $3, $4, $5)`,
              [pilotId, runId, item.id, item.text, item.position],
            )
          }
          const run = await loadRunWithItems(tx, pilotId, runId)
          return { ok: true, run: run as ChecklistRunWithItems }
        } catch (error) {
          // Two concurrent opens can both pass the read above and race the
          // partial unique index (checklist_runs_open_uniq / checklist-runs:
          // "No duplicate open runs") — the loser re-selects the winner's row
          // rather than surfacing the constraint violation.
          if (isUniqueViolation(error)) {
            const race = await findOpen()
            if (race.rows[0]) {
              const run = await loadRunWithItems(tx, pilotId, race.rows[0].id)
              return { ok: true, run: run as ChecklistRunWithItems }
            }
          }
          throw error
        }
      })
    },

    async findById(pilotId, id) {
      return loadRunWithItems(pool, pilotId, id)
    },

    async toggleItem(pilotId, runId, runItemId) {
      return pool.withTransaction(async (tx) => {
        const run = await loadRunRow(tx, pilotId, runId)
        if (!run) return { ok: false, reason: 'not_found' }
        if (run.completed_at) return { ok: false, reason: 'completed' }

        const itemResult = await tx.query<{ id: string; checked_at: Date | null }>(
          `SELECT id, checked_at FROM checklist_run_items WHERE id = $1 AND run_id = $2 AND pilot_id = $3 LIMIT 1`,
          [runItemId, runId, pilotId],
        )
        const item = itemResult.rows[0]
        if (!item) return { ok: false, reason: 'not_found' }

        const newCheckedAt = item.checked_at ? null : new Date()
        await tx.query(`UPDATE checklist_run_items SET checked_at = $1 WHERE id = $2`, [
          newCheckedAt,
          item.id,
        ])

        const counts = await tx.query<{ total: string; checked: string }>(
          `SELECT COUNT(*) AS total, COUNT(checked_at) AS checked FROM checklist_run_items WHERE run_id = $1`,
          [runId],
        )
        const total = Number(counts.rows[0]?.total ?? 0)
        const checked = Number(counts.rows[0]?.checked ?? 0)
        const completedAt = total > 0 && checked === total ? new Date() : null
        await tx.query(`UPDATE checklist_runs SET completed_at = $1 WHERE id = $2`, [
          completedAt,
          runId,
        ])

        const updated = await loadRunWithItems(tx, pilotId, runId)
        return { ok: true, run: updated as ChecklistRunWithItems }
      })
    },

    async reset(pilotId, runId) {
      return pool.withTransaction(async (tx) => {
        const run = await loadRunRow(tx, pilotId, runId)
        if (!run) return { ok: false, reason: 'not_found' }
        if (run.completed_at) return { ok: false, reason: 'completed' }

        await tx.query(`UPDATE checklist_run_items SET checked_at = NULL WHERE run_id = $1`, [
          runId,
        ])
        const updated = await loadRunWithItems(tx, pilotId, runId)
        return { ok: true, run: updated as ChecklistRunWithItems }
      })
    },

    async listCompletedForAircraft(pilotId, aircraftId) {
      const result = await pool.query<ChecklistRunRow>(
        `SELECT ${RUN_COLUMNS} FROM checklist_runs
         WHERE pilot_id = $1 AND aircraft_id = $2 AND completed_at IS NOT NULL
         ORDER BY completed_at DESC`,
        [pilotId, aircraftId],
      )
      const runs = await Promise.all(
        result.rows.map(async (row) => ({
          ...mapRun(row),
          items: (await loadRunItemRows(pool, pilotId, row.id)).map(mapRunItem),
        })),
      )
      return runs
    },

    async preflightProgressForIntent(pilotId, flightIntentId, aircraftId) {
      const checklistResult = await pool.query<{ id: string; name: string }>(
        `SELECT id, name FROM checklists WHERE aircraft_id = $1 AND pilot_id = $2 AND role = 'preflight' LIMIT 1`,
        [aircraftId, pilotId],
      )
      const checklist = checklistResult.rows[0]
      if (!checklist) return null

      const runResult = await pool.query<{ id: string }>(
        `SELECT id FROM checklist_runs
         WHERE pilot_id = $1 AND flight_intent_id = $2 AND checklist_id = $3
         ORDER BY started_at DESC
         LIMIT 1`,
        [pilotId, flightIntentId, checklist.id],
      )
      const run = runResult.rows[0]
      if (!run) return null

      const counts = await pool.query<{ total: string; checked: string }>(
        `SELECT COUNT(*) AS total, COUNT(checked_at) AS checked FROM checklist_run_items WHERE run_id = $1`,
        [run.id],
      )
      return {
        checklistName: checklist.name,
        checkedCount: Number(counts.rows[0]?.checked ?? 0),
        totalCount: Number(counts.rows[0]?.total ?? 0),
      }
    },
  }
}
