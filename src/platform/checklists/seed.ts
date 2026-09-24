import type { Queryable } from '../db/pool.js'
import type { SupportedLocale } from '../i18n/locale.js'
import { GENERIC_GA_TEMPLATE, TEMPLATE_VERSION } from './template.js'

export interface SeedChecklistsOptions {
  pilotId: string
  aircraftId: string
  locale: SupportedLocale
}

/**
 * Seeds one aircraft's checklist library from the built-in generic template
 * (aircraft-checklists: "Seeding on aircraft creation"), in the pilot's
 * locale at this moment. Runs against the passed `Queryable` so it joins the
 * caller's transaction (design decision 3) — a seeding failure must roll
 * back the aircraft insert alongside it, not leave a half-created aircraft.
 */
export async function seedChecklistsForAircraft(
  db: Queryable,
  { pilotId, aircraftId, locale }: SeedChecklistsOptions,
): Promise<void> {
  for (const checklist of GENERIC_GA_TEMPLATE) {
    const inserted = await db.query<{ id: string }>(
      `INSERT INTO checklists (pilot_id, aircraft_id, name, kind, role, source, template_version, position)
       VALUES ($1, $2, $3, $4, $5, 'template', $6, $7)
       RETURNING id`,
      [
        pilotId,
        aircraftId,
        checklist.name[locale],
        checklist.kind,
        checklist.role,
        TEMPLATE_VERSION,
        checklist.position,
      ],
    )
    const checklistId = inserted.rows[0]?.id
    if (!checklistId) throw new Error('checklists insert returned no id')

    for (const item of checklist.items) {
      await db.query(
        `INSERT INTO checklist_items (pilot_id, checklist_id, text, position) VALUES ($1, $2, $3, $4)`,
        [pilotId, checklistId, item.text[locale], item.position],
      )
    }
  }
}
