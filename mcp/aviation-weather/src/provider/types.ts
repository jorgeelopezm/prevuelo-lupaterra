/**
 * Weather provider interface and result types. Provenance — provider identity,
 * the issue or observation time, the retrieval time, and the cached flag — is a
 * required field on every data result, so a consumer cannot render a report
 * without having provenance in hand.
 */

export type WeatherLocale = 'es' | 'pt' | 'en'

/** Provenance required on every data-returning result. */
export interface WeatherProvenance {
  /** Provider identifier, e.g. `mock`, `aemet`, `ipma`, `ead`. */
  provider: string
  /**
   * ISO 8601 issue (TAF/NOTAM/SIGMET) or observation (METAR) time; for a
   * batched result, the latest across its reports. `null` when no report in
   * the result carries a time — never substituted with the retrieval time.
   */
  issuedAt: string | null
  /** ISO 8601 time the data was retrieved from the provider (or its cache). */
  retrievedAt: string
  /** Whether this result was served from the response cache. */
  cached: boolean
  /** Age in seconds when served from cache; `0` for fresh results. */
  cacheAgeSeconds: number
  /** True when the data is mock sample data, not suitable for operations. */
  sample: boolean
  /** Explicit caveat appended to sample data. */
  caveat: string
}

export interface MetarReport {
  icao: string
  /** Raw METAR report text; `null` when the provider has no data. */
  report: string | null
  /** ISO 8601 observation time; `null` alongside a `null` report. */
  observationTime: string | null
}

export interface MetarResult extends WeatherProvenance {
  /** One entry per requested indicator, in request order. */
  entries: MetarReport[]
}

export interface TafReport {
  icao: string
  /** Raw TAF report text; `null` when the provider has no data. */
  report: string | null
  /** ISO 8601 issue time; `null` alongside a `null` report. */
  issueTime: string | null
}

export interface TafResult extends WeatherProvenance {
  entries: TafReport[]
}

/**
 * Whether a NOTAM/SIGMET list is asserted to be the full set in force.
 * `complete`: the provider vouches for completeness, so an empty list means
 * none are in force. `unknown`: it cannot (best-effort match, region it does
 * not authoritatively cover) — an empty list only means "none returned".
 * Providers default to `unknown` and opt in to `complete`.
 */
export type ListCoverage = 'complete' | 'unknown'

export interface NotamEntry {
  /** NOTAM identifier, e.g. `A1234/26`. */
  id: string
  /** Free-text NOTAM body. */
  text: string
  /** ISO 8601 start of validity; `null` when the provider does not state it — never substituted. */
  startAt: string | null
  /** ISO 8601 end of validity; `null` when the provider does not state it — never substituted. */
  endAt: string | null
}

export interface NotamReport {
  icao: string
  /** Empty when the provider returned no NOTAMs for the aerodrome. */
  notams: NotamEntry[]
  /** Whether an empty list means "none in force" (see `ListCoverage`). */
  coverage: ListCoverage
}

export interface NotamResult extends WeatherProvenance {
  entries: NotamReport[]
}

export interface SigmetEntry {
  /** SIGMET identifier, e.g. `LECB SIGMET 2 VALID 060600/061200`. */
  header: string
  /** Free-text SIGMET body. */
  text: string
  /** ISO 8601 start of validity; `null` when the provider does not state it — never substituted. */
  startAt: string | null
  /** ISO 8601 end of validity; `null` when the provider does not state it — never substituted. */
  endAt: string | null
}

export interface SigmetReport {
  fir: string
  /** Empty when the provider returned no SIGMETs for the FIR. */
  sigmets: SigmetEntry[]
  /** Whether an empty list means "none in force" (see `ListCoverage`). */
  coverage: ListCoverage
}

export interface SigmetResult extends WeatherProvenance {
  entries: SigmetReport[]
}

/**
 * One internal provider interface through which every data tool obtains its
 * results. The mock provider is the default when no credential is configured.
 */
export interface WeatherProvider {
  readonly id: string
  getMetar(icaos: readonly string[]): Promise<MetarResult>
  getTaf(icaos: readonly string[]): Promise<TafResult>
  getNotams(icaos: readonly string[]): Promise<NotamResult>
  getSigmet(firs: readonly string[]): Promise<SigmetResult>
}
