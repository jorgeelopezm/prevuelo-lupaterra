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
  issuedAt: string
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

export interface NotamEntry {
  id: string
  text: string
  startAt: string
  endAt: string
}

export interface NotamReport {
  icao: string
  notams: NotamEntry[]
}

export interface NotamResult extends WeatherProvenance {
  entries: NotamReport[]
}

export interface SigmetEntry {
  header: string
  text: string
  startAt: string
  endAt: string
}

export interface SigmetReport {
  fir: string
  sigmets: SigmetEntry[]
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
