import { loadCatalogs } from '../../platform/i18n/catalog.js'
import { destinationPath } from '../../platform/i18n/segments.js'
import type { SupportedLocale } from '../../platform/i18n/locale.js'

/**
 * Sub-segments under the risk module's own locale-scoped root
 * (`destinationPath('risk', locale)`), localized the same way the fleet
 * module's sub-segments are (design.md decision 12 precedent).
 */
export type RiskSubSegment = 'flight-intent' | 'assessment' | 'result' | 'history' | 'new'

const RISK_SUB_SEGMENTS: readonly RiskSubSegment[] = [
  'flight-intent',
  'assessment',
  'result',
  'history',
  'new',
]

function riskSegment(sub: RiskSubSegment, locale: SupportedLocale): string {
  const value = loadCatalogs()[locale][`risk.segment.${sub}`]
  return typeof value === 'string' ? value : ''
}

/**
 * Build a risk sub-path under the localized `/riesgo` root, e.g.
 * `riskPath('assessment', 'es', [flightIntentId, 'new'])` →
 * `/es/riesgo/evaluacion/abc123/nuevo`. Path parameters are appended
 * verbatim (already-encoded identifiers), each additional segment localized
 * the same way when it names a known sub-segment, or appended raw otherwise.
 */
export function riskPath(
  sub: RiskSubSegment,
  locale: SupportedLocale,
  params: ReadonlyArray<string | RiskSubSegment> = [],
): string {
  const root = destinationPath('risk', locale)
  const parts = [riskSegment(sub, locale)]
  for (const part of params) {
    parts.push(
      (RISK_SUB_SEGMENTS as readonly string[]).includes(part)
        ? riskSegment(part as RiskSubSegment, locale)
        : part,
    )
  }
  return `${root}/${parts.join('/')}`
}

export { RISK_SUB_SEGMENTS }
