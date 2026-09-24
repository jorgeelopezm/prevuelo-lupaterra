/**
 * Generates the SQL backfill that seeds every existing non-retired aircraft
 * with the generic checklist template (migration 011's task 1.4 mitigation):
 * the migration and `src/platform/checklists/template.ts` must never drift
 * apart, so the backfill is generated from the template rather than
 * hand-written.
 *
 * `renderBackfillSql()` is imported directly by the drift test
 * (`src/platform/db/schema.test.ts`), which re-generates this text and
 * asserts it matches the block recorded in `db/migrations/011_checklists.sql`
 * between the `-- BEGIN GENERATED BACKFILL --` / `-- END GENERATED
 * BACKFILL --` markers.
 *
 * Run directly (`tsx scripts/generate-checklist-seed.mts`) to print the
 * block to stdout for pasting into the migration after a template change.
 */
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

import { GENERIC_GA_TEMPLATE, TEMPLATE_VERSION, type TemplateLocaleText } from '../src/platform/checklists/template.js'

const LOCALES = ['es', 'en', 'pt'] as const
type Locale = (typeof LOCALES)[number]

function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

/** Every pilot's aircraft is backfilled exactly once, bucketed by the
 * pilot's stored locale; any locale other than 'en'/'pt' falls back to the
 * 'es' bucket (the schema's own default), so every aircraft is covered. */
function localeFilter(locale: Locale): string {
  if (locale === 'en') return "p.locale = 'en'"
  if (locale === 'pt') return "p.locale = 'pt'"
  return "p.locale NOT IN ('en', 'pt')"
}

function nameFor(text: TemplateLocaleText, locale: Locale): string {
  return sqlLiteral(text[locale])
}

export function renderBackfillSql(): string {
  const parts: string[] = []
  for (const locale of LOCALES) {
    for (const checklist of GENERIC_GA_TEMPLATE) {
      const roleLiteral = checklist.role ? sqlLiteral(checklist.role) : 'NULL'
      const nameLiteral = nameFor(checklist.name, locale)
      parts.push(
        [
          `INSERT INTO checklists (pilot_id, aircraft_id, name, kind, role, source, template_version, position)`,
          `SELECT a.pilot_id, a.id, ${nameLiteral}, ${sqlLiteral(checklist.kind)}, ${roleLiteral}, 'template', ${TEMPLATE_VERSION}, ${checklist.position}`,
          `FROM aircraft a JOIN pilots p ON p.id = a.pilot_id`,
          `WHERE a.retired_at IS NULL AND ${localeFilter(locale)};`,
        ].join('\n'),
      )

      const values = checklist.items
        .map((item) => `(${item.position}, ${nameFor(item.text, locale)})`)
        .join(', ')
      parts.push(
        [
          `INSERT INTO checklist_items (pilot_id, checklist_id, text, position)`,
          `SELECT c.pilot_id, c.id, v.text, v.position`,
          `FROM checklists c`,
          `JOIN aircraft a ON a.id = c.aircraft_id`,
          `JOIN pilots p ON p.id = a.pilot_id`,
          `CROSS JOIN (VALUES ${values}) AS v (position, text)`,
          `WHERE a.retired_at IS NULL AND ${localeFilter(locale)}`,
          `  AND c.name = ${nameLiteral} AND c.kind = ${sqlLiteral(checklist.kind)} AND c.template_version = ${TEMPLATE_VERSION};`,
        ].join('\n'),
      )
    }
  }
  return parts.join('\n\n')
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  process.stdout.write(renderBackfillSql() + '\n')
}
