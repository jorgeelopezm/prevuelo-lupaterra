import type {
  MetarReport,
  MetarResult,
  NotamResult,
  SigmetEntry,
  SigmetReport,
  SigmetResult,
  TafReport,
  TafResult,
  WeatherProvenance,
  WeatherProvider,
} from './types.js'

const BASE_URL = 'https://aviationweather.gov/api/data'
const DEFAULT_TIMEOUT_MS = 10_000
/** AWC asks clients to identify themselves so automated filtering does not block valid traffic. */
export const AWC_USER_AGENT = 'ga-core-mcp-aviation-weather/0.1.0'

export interface AwcProviderOptions {
  /** Per-request abort timeout; the tool service's own timeout is authoritative — this is a hygiene backstop. */
  timeoutMs?: number
}

/** Fields read from `/api/data/metar?format=json` (see design.md — Context). */
interface AwcMetar {
  icaoId?: string
  rawOb?: string
  obsTime?: number | string | null
}

/** Fields read from `/api/data/taf?format=json`. */
interface AwcTaf {
  icaoId?: string
  rawTAF?: string
  issueTime?: number | string | null
}

/** Fields read from `/api/data/isigmet?format=json`. */
interface AwcIsigmet {
  firId?: string
  rawSigmet?: string
  validTimeFrom?: number | string | null
  validTimeTo?: number | string | null
}

/** AWC results are real (not sample) data; the tool service's cache layer marks `cached`. */
function provenance(issuedAt: string | null): WeatherProvenance {
  return {
    provider: 'awc',
    issuedAt,
    retrievedAt: new Date().toISOString(),
    cached: false,
    cacheAgeSeconds: 0,
    sample: false,
    caveat: '',
  }
}

/**
 * An AWC time as ISO 8601: Unix seconds (`obsTime`, `validTime*`) or an ISO
 * string (`issueTime` is not pinned by the schema). Missing or unparseable is
 * `null` — never the current time.
 */
export function toIso(value: number | string | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null
  const ms = typeof value === 'number' ? value * 1000 : Date.parse(value)
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null
}

/** The latest of the given times, or `null` when none is stated. */
function latest(times: ReadonlyArray<string | null>): string | null {
  let result: string | null = null
  for (const t of times) {
    if (t && (result === null || Date.parse(t) > Date.parse(result))) result = t
  }
  return result
}

/**
 * Weather provider backed by the aviationweather.gov Data API (NOAA Aviation
 * Weather Center): keyless, worldwide METAR/TAF and international SIGMETs.
 * METAR/TAF are one batched request per tool call (`ids=` comma list);
 * HTTP 204 or an empty array is "no data" for every indicator. International
 * SIGMETs come as one global list matched by exact `firId`, marked `unknown`
 * coverage — an aggregator feed does not vouch that every issuing office's
 * SIGMET is present. Any other non-2xx response throws, and the tool
 * service's wrapping turns it into a structured, no-fabrication error.
 *
 * AWC supplies no NOTAMs: `get_notams` is routed to the separately
 * configured NOTAM provider and never reaches this class.
 */
export class AwcWeatherProvider implements WeatherProvider {
  readonly id = 'awc'
  private readonly timeoutMs: number

  constructor(opts: AwcProviderOptions = {}) {
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  }

  async getMetar(icaos: readonly string[]): Promise<MetarResult> {
    const rows = await this.fetchList<AwcMetar>(`/metar?ids=${icaos.join(',')}&format=json`)
    const entries: MetarReport[] = icaos.map((icao) => {
      const row = newestFor(rows, icao, (r) => toIso(r.obsTime))
      return row?.rawOb
        ? { icao, report: row.rawOb, observationTime: toIso(row.obsTime) }
        : { icao, report: null, observationTime: null }
    })
    return { ...provenance(latest(entries.map((e) => e.observationTime))), entries }
  }

  async getTaf(icaos: readonly string[]): Promise<TafResult> {
    const rows = await this.fetchList<AwcTaf>(`/taf?ids=${icaos.join(',')}&format=json`)
    const entries: TafReport[] = icaos.map((icao) => {
      const row = newestFor(rows, icao, (r) => toIso(r.issueTime))
      return row?.rawTAF
        ? { icao, report: row.rawTAF, issueTime: toIso(row.issueTime) }
        : { icao, report: null, issueTime: null }
    })
    return { ...provenance(latest(entries.map((e) => e.issueTime))), entries }
  }

  getNotams(): Promise<NotamResult> {
    // A routing bug, not an upstream condition: fail loudly rather than
    // return an empty list that could read as "no NOTAMs".
    return Promise.reject(
      new Error('awc supplies no NOTAMs; get_notams must be routed to NOTAM_PROVIDER'),
    )
  }

  async getSigmet(firs: readonly string[]): Promise<SigmetResult> {
    const rows = await this.fetchList<AwcIsigmet>('/isigmet?format=json')
    const entries: SigmetReport[] = firs.map((fir) => {
      const sigmets: SigmetEntry[] = rows
        .filter((r) => r.firId?.toUpperCase() === fir && r.rawSigmet)
        .map((r) => ({
          header: (r.rawSigmet as string).split('\n')[0] ?? (r.rawSigmet as string),
          text: r.rawSigmet as string,
          startAt: toIso(r.validTimeFrom),
          endAt: toIso(r.validTimeTo),
        }))
      return { fir, sigmets, coverage: 'unknown' as const }
    })
    // The isigmet schema has no issue time: `receiptTime` is when AWC received
    // it and a validity start is not an issue time, so neither stands in.
    return { ...provenance(null), entries }
  }

  /** GET a JSON array; 204 or an empty body is an empty list. Other non-2xx throws. */
  private async fetchList<T>(path: string): Promise<T[]> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const response = await fetch(`${BASE_URL}${path}`, {
        headers: { 'User-Agent': AWC_USER_AGENT, Accept: 'application/json' },
        signal: controller.signal,
      })
      if (response.status === 204) return []
      if (!response.ok) {
        throw new Error(`AWC request failed: ${response.status} ${response.statusText} (${path})`)
      }
      const text = await response.text()
      if (text.trim() === '') return []
      const body = JSON.parse(text) as unknown
      return Array.isArray(body) ? (body as T[]) : []
    } finally {
      clearTimeout(timer)
    }
  }
}

/** The newest row for an indicator (AWC may return more than one per station). */
function newestFor<T extends { icaoId?: string }>(
  rows: readonly T[],
  icao: string,
  timeOf: (row: T) => string | null,
): T | undefined {
  let best: T | undefined
  let bestMs = -Infinity
  for (const row of rows) {
    if (row.icaoId?.toUpperCase() !== icao) continue
    const t = timeOf(row)
    const ms = t ? Date.parse(t) : -Infinity
    if (best === undefined || ms > bestMs) {
      best = row
      bestMs = ms
    }
  }
  return best
}
