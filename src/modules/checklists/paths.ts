import { loadCatalogs } from '../../platform/i18n/catalog.js'
import { destinationPath } from '../../platform/i18n/segments.js'
import type { SupportedLocale } from '../../platform/i18n/locale.js'

/**
 * Sub-segments under the checklists module's own locale-scoped root
 * (`destinationPath('checklists', locale)`), localized the same way the
 * fleet and risk modules' sub-segments are (design decision 10). The three
 * browse levels (fleet list, per-aircraft selector, per-checklist items) are
 * plain identifier paths off the root with no sub-segment word, mirroring
 * how the fleet module's own browse screen bypasses `fleetPath` entirely;
 * `run` names that level's role for readers of this module without being a
 * literal path segment.
 */
export type ChecklistSubSegment =
  | 'run'
  | 'history'
  | 'new'
  | 'edit'
  | 'delete'
  | 'items'
  | 'reset'
  | 'toggle'
  | 'move-up'
  | 'move-down'
  | 'preflight'

const CHECKLIST_SUB_SEGMENTS: readonly ChecklistSubSegment[] = [
  'run',
  'history',
  'new',
  'edit',
  'delete',
  'items',
  'reset',
  'toggle',
  'move-up',
  'move-down',
  'preflight',
]

function checklistSegment(sub: ChecklistSubSegment, locale: SupportedLocale): string {
  const value = loadCatalogs()[locale][`checklist.segment.${sub}`]
  return typeof value === 'string' ? value : ''
}

/**
 * Build a checklists sub-path under the localized `/listas` root, e.g.
 * `checklistPath('toggle', 'es', [aircraftId, checklistId, runItemId])` →
 * `/es/listas/alternar/<aircraftId>/<checklistId>/<runItemId>`. Path
 * parameters are appended verbatim (already-encoded identifiers), each
 * additional segment localized the same way when it names a known
 * sub-segment, or appended raw otherwise (an id).
 */
export function checklistPath(
  sub: ChecklistSubSegment,
  locale: SupportedLocale,
  params: ReadonlyArray<string | ChecklistSubSegment> = [],
): string {
  const root = destinationPath('checklists', locale)
  const parts = [checklistSegment(sub, locale)]
  for (const part of params) {
    parts.push(
      (CHECKLIST_SUB_SEGMENTS as readonly string[]).includes(part)
        ? checklistSegment(part as ChecklistSubSegment, locale)
        : part,
    )
  }
  return `${root}/${parts.join('/')}`
}

/** The per-aircraft checklist selector (browse level 1): a plain identifier
 * path off the root, e.g. `/es/listas/<aircraftId>`. */
export function checklistSelectorPath(locale: SupportedLocale, aircraftId: string): string {
  return `${destinationPath('checklists', locale)}/${aircraftId}`
}

/** The per-checklist item/run screen (browse level 2): e.g.
 * `/es/listas/<aircraftId>/<checklistId>`. */
export function checklistItemsPath(
  locale: SupportedLocale,
  aircraftId: string,
  checklistId: string,
): string {
  return `${checklistSelectorPath(locale, aircraftId)}/${checklistId}`
}

export { CHECKLIST_SUB_SEGMENTS }
