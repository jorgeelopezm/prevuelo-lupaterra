/**
 * Types for the weather MCP client seam. These mirror the JSON shapes the
 * `aviation-weather` MCP server's tools return (see `mcp/aviation-weather/src/provider/types.ts`
 * and `decode.ts`) rather than importing them: the MCP server is a separately
 * deployable process reached over a wire protocol, so the web app depends on
 * its published tool contract, not its internal TypeScript types.
 */

export type WeatherLocale = 'es' | 'pt' | 'en'

export interface WeatherProvenance {
  provider: string
  /** `null` when no report in the result carries a time. */
  issuedAt: string | null
  retrievedAt: string
  cached: boolean
  cacheAgeSeconds: number
  sample: boolean
  caveat: string
}

export interface MetarReport {
  icao: string
  report: string | null
  observationTime: string | null
}

export interface MetarResult extends WeatherProvenance {
  entries: MetarReport[]
}

export interface TafReport {
  icao: string
  report: string | null
  issueTime: string | null
}

export interface TafResult extends WeatherProvenance {
  entries: TafReport[]
}

/**
 * Whether a NOTAM/SIGMET list is the full set in force (`complete`) or only
 * what the provider returned (`unknown`). Optional on the wire: an older MCP
 * build or a pre-deploy cached result omits it, and absence means `unknown`.
 */
export type ListCoverage = 'complete' | 'unknown'

export interface NotamEntry {
  id: string
  text: string
  /** `null` when the provider does not state it. */
  startAt: string | null
  /** `null` when the provider does not state it. */
  endAt: string | null
}

export interface NotamReport {
  icao: string
  notams: NotamEntry[]
  coverage?: ListCoverage
}

export interface NotamResult extends WeatherProvenance {
  entries: NotamReport[]
}

export interface SigmetEntry {
  header: string
  text: string
  /** `null` when the provider does not state it. */
  startAt: string | null
  /** `null` when the provider does not state it. */
  endAt: string | null
}

export interface SigmetReport {
  fir: string
  sigmets: SigmetEntry[]
  coverage?: ListCoverage
}

export interface SigmetResult extends WeatherProvenance {
  entries: SigmetReport[]
}

export interface DecodedSegment {
  token: string
  note: string
}

export interface DecodedMetar {
  raw: string
  locale: WeatherLocale
  explanation: string
  sections: DecodedSegment[]
  decoded: boolean
}

/** Failure kinds the client distinguishes when mapping a failed tool call. */
export type WeatherMcpErrorKind = 'timeout' | 'rate_limit' | 'validation' | 'provider_error'

export interface WeatherMcpError {
  kind: WeatherMcpErrorKind
  /** Provider identifier when known (absent for a connection-level failure). */
  provider?: string
  /** Seconds to wait before retrying, present only for `rate_limit`. */
  retryAfterSeconds?: number
  /** Raw message from the MCP tool result, for logging — never rendered verbatim as report content. */
  message: string
}

export type WeatherMcpResult<T> = { ok: true; data: T } | { ok: false; error: WeatherMcpError }

export interface WeatherMcpClient {
  getMetar(icaos: readonly string[]): Promise<WeatherMcpResult<MetarResult>>
  getTaf(icaos: readonly string[]): Promise<WeatherMcpResult<TafResult>>
  getNotams(icaos: readonly string[]): Promise<WeatherMcpResult<NotamResult>>
  getSigmet(fir: string): Promise<WeatherMcpResult<SigmetResult>>
  decodeMetar(raw: string, locale: WeatherLocale): Promise<WeatherMcpResult<DecodedMetar>>
  close(): Promise<void>
}
