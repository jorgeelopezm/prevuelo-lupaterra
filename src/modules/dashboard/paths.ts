import { loadCatalogs } from '../../platform/i18n/catalog.js'
import { destinationPath } from '../../platform/i18n/segments.js'
import type { SupportedLocale } from '../../platform/i18n/locale.js'

/**
 * The one sub-path under the dashboard module's own locale root (the locale
 * root itself, `destinationPath('dashboard', locale)`): the weather + NOTAM
 * fragment (design.md decision 2), localized the same way the `risk`/`fleet`
 * modules' sub-segments are (`dash.segment.<name>` catalog keys).
 */
export type DashboardSubSegment = 'weather-summary'

function dashboardSegment(sub: DashboardSubSegment, locale: SupportedLocale): string {
  const value = loadCatalogs()[locale][`dash.segment.${sub}`]
  return typeof value === 'string' ? value : ''
}

/** Build a dashboard sub-path, e.g. `dashboardPath('weather-summary', 'es')`
 * → `/es/resumen-meteorologico`. */
export function dashboardPath(sub: DashboardSubSegment, locale: SupportedLocale): string {
  const root = destinationPath('dashboard', locale)
  return `${root}/${dashboardSegment(sub, locale)}`
}
