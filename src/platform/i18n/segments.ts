import { loadCatalogs } from './catalog.js'
import { SUPPORTED_LOCALES, type SupportedLocale } from './locale.js'

/**
 * Per-locale path segments for the six feature domains, sourced from the
 * catalogs (`nav.segment.<id>` keys) so that adding a locale touches only the
 * catalogs. The segment values themselves are localized (/es/meteorologia vs
 * /en/weather); the locale segment is always the ISO code.
 */
export type ModuleId = 'dashboard' | 'weather' | 'checklists' | 'risk' | 'fleet' | 'documents'

export const MODULE_IDS: readonly ModuleId[] = [
  'dashboard',
  'weather',
  'checklists',
  'risk',
  'fleet',
  'documents',
]

export function pathSegment(id: ModuleId, locale: SupportedLocale): string {
  const value = loadCatalogs()[locale][`nav.segment.${id}`]
  return typeof value === 'string' ? value : ''
}

const SEGMENT_TO_MODULE: Record<string, ModuleId> = {}
for (const locale of SUPPORTED_LOCALES) {
  for (const id of MODULE_IDS) {
    const segment = pathSegment(id, locale)
    if (segment) SEGMENT_TO_MODULE[segment] = id
  }
}

/** Reverse lookup: which feature destination does a path segment name? */
export function moduleForSegment(segment: string): ModuleId | undefined {
  return SEGMENT_TO_MODULE[segment]
}

/**
 * The locale-scoped URL for a module. The dashboard module is the locale root
 * (`/es`) — the target of the root redirect — while the other modules use their
 * localized path segment (`/es/meteorologia`, `/en/weather`).
 */
export function destinationPath(id: ModuleId, locale: SupportedLocale): string {
  if (id === 'dashboard') return `/${locale}`
  return `/${locale}/${pathSegment(id, locale)}`
}
