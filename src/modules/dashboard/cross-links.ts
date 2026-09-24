import { loadCatalogs } from '../../platform/i18n/catalog.js'
import { destinationPath } from '../../platform/i18n/segments.js'
import type { SupportedLocale } from '../../platform/i18n/locale.js'

/**
 * Builds URLs into the `risk` and `fleet` modules' own route namespaces
 * without importing their `paths.ts` helpers: `module-boundary/no-cross-
 * module-import` forbids one feature module importing another's internals
 * (see `eslint/rules/module-boundary.mjs`), so this replicates the same
 * catalog-key path construction those helpers use — the same technique
 * `risk/index.test.ts`'s `aircraftNewPath` already applies for the reverse
 * direction (design.md task 2.4 named `riskPath`/`fleetPath` directly without
 * accounting for the boundary; see tasks.md 2.4 deviation note).
 */
function segment(key: string, locale: SupportedLocale): string {
  const value = loadCatalogs()[locale][key]
  return typeof value === 'string' ? value : ''
}

export function riskFlightIntentNewPath(locale: SupportedLocale): string {
  const root = destinationPath('risk', locale)
  return `${root}/${segment('risk.segment.flight-intent', locale)}/${segment('risk.segment.new', locale)}`
}

export function riskAssessmentNewPath(locale: SupportedLocale, flightIntentId: string): string {
  const root = destinationPath('risk', locale)
  return `${root}/${segment('risk.segment.assessment', locale)}/${flightIntentId}/${segment('risk.segment.new', locale)}`
}

export function fleetWbPath(locale: SupportedLocale, aircraftId: string): string {
  const root = destinationPath('fleet', locale)
  return `${root}/${segment('fleet.segment.aircraft', locale)}/${aircraftId}/${segment('fleet.segment.wb', locale)}`
}
