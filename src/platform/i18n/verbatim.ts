/**
 * Verbatim rendering path for coded aeronautical content — raw METAR, TAF, and
 * NOTAM text, ICAO location indicators, aircraft type designators, and
 * regulatory citations. Content rendered through this path is passed through
 * character-identical in every locale; the template layer applies only
 * HTML-entity escaping (it is never translated, transliterated, reformatted,
 * or line-wrapped destructively).
 *
 * This module returns the source string unchanged and preserves its line
 * structure and significant leading whitespace. Later capabilities that display
 * coded content MUST use this path.
 */
export interface VerbatimResult {
  text: string
  verbatim: true
}

/**
 * Mark a coded string as verbatim for the view layer. The emitted text is
 * character-identical to the source (apart from HTML entity escaping applied
 * by the template engine), and whitespace/line structure is preserved.
 */
export function verbatim(text: string): VerbatimResult {
  return { text, verbatim: true }
}

/** True when a value was produced by {@link verbatim} (i.e. must not be translated). */
export function isVerbatim(value: unknown): value is VerbatimResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    'verbatim' in value &&
    (value as VerbatimResult).verbatim === true &&
    typeof (value as VerbatimResult).text === 'string'
  )
}

/** Render a verbatim source string (the plain identity under the contract). */
export function renderVerbatim(result: VerbatimResult | string): string {
  return typeof result === 'string' ? result : result.text
}
