/**
 * Parsing and validation for the weather screen's lookup query: one or more
 * ICAO location indicators (comma/space separated in a single field so the
 * form works with a plain HTML input, no JavaScript required) and an
 * optional FIR designator. Both share the MCP tools' four-letter pattern
 * (`mcp/aviation-weather/src/tools/schemas.ts`), validated here so an
 * obviously malformed value is rejected before any tool call is made.
 */

const ICAO_PATTERN = /^[A-Z]{4}$/

export interface WeatherQuery {
  /** Well-formed ICAO indicators, in the order submitted, de-duplicated. */
  icaos: string[]
  /** Submitted values that are not a four-letter ICAO indicator. */
  invalidIcaos: string[]
  /** The FIR designator, when submitted and well-formed. */
  fir?: string
  /** The FIR value as submitted, when it fails the ICAO/FIR pattern. */
  invalidFir?: string
  /** Raw text as typed, for re-populating the form. */
  icaoInput: string
  firInput: string
}

function firstQueryValue(value: unknown): string {
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : ''
  return typeof value === 'string' ? value : ''
}

export function parseWeatherQuery(query: Record<string, unknown>): WeatherQuery {
  const icaoInput = firstQueryValue(query.icao)
  const firInput = firstQueryValue(query.fir)

  const seen = new Set<string>()
  const icaos: string[] = []
  const invalidIcaos: string[] = []
  for (const raw of icaoInput.split(/[\s,]+/).map((v) => v.trim().toUpperCase()).filter(Boolean)) {
    if (!ICAO_PATTERN.test(raw)) {
      invalidIcaos.push(raw)
      continue
    }
    if (!seen.has(raw)) {
      seen.add(raw)
      icaos.push(raw)
    }
  }

  const trimmedFir = firInput.trim().toUpperCase()
  let fir: string | undefined
  let invalidFir: string | undefined
  if (trimmedFir) {
    if (ICAO_PATTERN.test(trimmedFir)) fir = trimmedFir
    else invalidFir = trimmedFir
  }

  return { icaos, invalidIcaos, fir, invalidFir, icaoInput, firInput }
}
