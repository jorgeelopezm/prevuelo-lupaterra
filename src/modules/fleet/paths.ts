import { loadCatalogs } from '../../platform/i18n/catalog.js'
import { destinationPath } from '../../platform/i18n/segments.js'
import type { SupportedLocale } from '../../platform/i18n/locale.js'

/**
 * Sub-segments under the fleet module's own locale-scoped root
 * (`destinationPath('fleet', locale)`), localized the same way the top-level
 * module segments are: sourced from the catalogs (`fleet.segment.<name>`) so
 * adding a locale only touches the catalogs (design decision 12).
 */
export type FleetSubSegment =
  | 'aircraft'
  | 'logbook'
  | 'maintenance'
  | 'documents'
  | 'engine-data'
  | 'new'
  | 'edit'
  | 'delete'
  | 'activate'
  | 'wb'
  | 'complete'
  | 'upload'

const FLEET_SUB_SEGMENTS: readonly FleetSubSegment[] = [
  'aircraft',
  'logbook',
  'maintenance',
  'documents',
  'engine-data',
  'new',
  'edit',
  'delete',
  'activate',
  'wb',
  'complete',
  'upload',
]

function fleetSegment(sub: FleetSubSegment, locale: SupportedLocale): string {
  const value = loadCatalogs()[locale][`fleet.segment.${sub}`]
  return typeof value === 'string' ? value : ''
}

/**
 * Build a fleet sub-path under the localized `/aeronave` root, e.g.
 * `fleetPath('aircraft', 'es', ['abc123', 'edit'])` →
 * `/es/aeronave/aviones/abc123/editar`. Path parameters are appended verbatim
 * (already-encoded identifiers), each additional segment localized the same
 * way when it names a known sub-segment, or appended raw otherwise (an id).
 */
export function fleetPath(
  sub: FleetSubSegment,
  locale: SupportedLocale,
  params: ReadonlyArray<string | FleetSubSegment> = [],
): string {
  const root = destinationPath('fleet', locale)
  const parts = [fleetSegment(sub, locale)]
  for (const part of params) {
    parts.push(
      (FLEET_SUB_SEGMENTS as readonly string[]).includes(part)
        ? fleetSegment(part as FleetSubSegment, locale)
        : part,
    )
  }
  return `${root}/${parts.join('/')}`
}

export { FLEET_SUB_SEGMENTS }
