import type {
  MetarReport,
  MetarResult,
  NotamEntry,
  NotamReport,
  NotamResult,
  SigmetEntry,
  SigmetReport,
  SigmetResult,
  TafReport,
  TafResult,
  WeatherProvenance,
  WeatherProvider,
} from './types.js'

const BASE_URL = 'https://avwx.rest/api'
const DEFAULT_TIMEOUT_MS = 10_000

export interface AvwxProviderOptions {
  /** Bearer token from https://account.avwx.rest. */
  apiToken: string
  /** Per-request abort timeout; the tool service's own timeout is authoritative — this is a hygiene backstop so a hung request doesn't leak indefinitely. */
  timeoutMs?: number
}

interface AvwxTimeValue {
  repr: string
  dt: string
}

interface AvwxReport {
  raw: string
  station: string
  time: AvwxTimeValue
}

interface AvwxNotam {
  raw: string
  body: string | null
  number: string
  start_time: AvwxTimeValue | null
  end_time: AvwxTimeValue | null
}

interface AvwxNotamResponse {
  data: AvwxNotam[]
}

interface AvwxAirSigmet {
  raw: string
  time: AvwxTimeValue | null
  start_time: AvwxTimeValue | null
  end_time: AvwxTimeValue | null
}

interface AvwxAirSigmetResponse {
  reports: AvwxAirSigmet[]
}

/** AVWX results are real (not sample) data and carry no cache state of their own — `WeatherToolService`'s cache layer is what marks `cached`. */
function provenance(issuedAt: string): WeatherProvenance {
  return {
    provider: 'avwx',
    issuedAt,
    retrievedAt: new Date().toISOString(),
    cached: false,
    cacheAgeSeconds: 0,
    sample: false,
    caveat: '',
  }
}

/**
 * Weather provider backed by the AVWX REST API (https://avwx.rest/api):
 * real METAR/TAF/NOTAM data for any ICAO station worldwide, plus a
 * best-effort FIR match over AVWX's global AIR/SIGMET list (AVWX has no
 * native FIR filter — see `getSigmet`). Every request passes `onfail=error`
 * so an AVWX-side upstream hiccup surfaces as a real error instead of
 * silently-stale cached data. A non-2xx response, a malformed body, or a
 * request that exceeds its abort timeout throws a plain `Error`; the tool
 * service's existing timeout/error wrapping (`WeatherToolService.withTimeout`)
 * turns that into the structured, no-fabrication result every tool already
 * returns on failure.
 *
 * METAR/TAF are fetched one station at a time (`/metar/{icao}`, `/taf/{icao}`)
 * rather than through AVWX's batched `/multi/{report}/{icaos}` endpoint:
 * verified live against a real free-tier token, `/multi` returns 403 ("must
 * be [a higher] plan") while the single-station endpoints return 200 on the
 * free tier. NOTAM and AIR/SIGMET are gated behind AVWX's enterprise and
 * pro/enterprise plans respectively (also verified live) — on a free-tier
 * token those calls fail honestly with AVWX's own explanation surfaced in
 * the thrown error, never fabricated data.
 */
export class AvwxWeatherProvider implements WeatherProvider {
  readonly id = 'avwx'
  private readonly apiToken: string
  private readonly timeoutMs: number

  constructor(opts: AvwxProviderOptions) {
    this.apiToken = opts.apiToken
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  }

  async getMetar(icaos: readonly string[]): Promise<MetarResult> {
    const reports = await Promise.all(icaos.map((icao) => this.fetchStation('metar', icao)))
    const entries: MetarReport[] = icaos.map((icao, i) => {
      const report = reports[i]
      return report
        ? { icao, report: report.raw, observationTime: report.time.dt }
        : { icao, report: null, observationTime: null }
    })
    return { ...provenance(latestIssuedAt(reports)), entries }
  }

  async getTaf(icaos: readonly string[]): Promise<TafResult> {
    const reports = await Promise.all(icaos.map((icao) => this.fetchStation('taf', icao)))
    const entries: TafReport[] = icaos.map((icao, i) => {
      const report = reports[i]
      return report
        ? { icao, report: report.raw, issueTime: report.time.dt }
        : { icao, report: null, issueTime: null }
    })
    return { ...provenance(latestIssuedAt(reports)), entries }
  }

  async getNotams(icaos: readonly string[]): Promise<NotamResult> {
    const entries: NotamReport[] = await Promise.all(
      icaos.map(async (icao) => {
        const res = await this.fetchJson<AvwxNotamResponse>(`/notam/${icao}?format=json`)
        const notams: NotamEntry[] = (res.data ?? []).map((n) => ({
          id: n.number,
          text: n.body ?? n.raw,
          startAt: n.start_time?.dt ?? new Date().toISOString(),
          endAt: n.end_time?.dt ?? new Date().toISOString(),
        }))
        return { icao, notams }
      }),
    )
    return { ...provenance(new Date().toISOString()), entries }
  }

  /**
   * AVWX's `/airsigmet` endpoint returns the full global AIRMET/SIGMET list
   * with no station or FIR query parameter. Real SIGMET messages
   * conventionally lead their raw text with the issuing FIR's ICAO code
   * (matching this project's own mock fixtures), so entries are filtered by
   * a word-boundary match of the requested FIR against each advisory's raw
   * text. This is a best-effort match, not a guaranteed-correct FIR lookup:
   * no match found renders identically to "genuinely none in force" — never
   * fabricated content either way.
   */
  async getSigmet(firs: readonly string[]): Promise<SigmetResult> {
    const res = await this.fetchJson<AvwxAirSigmetResponse>('/airsigmet?format=json&onfail=error')
    const reports = res.reports ?? []
    const entries: SigmetReport[] = firs.map((fir) => {
      const pattern = new RegExp(`\\b${fir}\\b`)
      const sigmets: SigmetEntry[] = reports
        .filter((r) => pattern.test(r.raw))
        .map((r) => ({
          header: r.raw.split('\n')[0] ?? r.raw,
          text: r.raw,
          startAt: r.start_time?.dt ?? r.time?.dt ?? new Date().toISOString(),
          endAt: r.end_time?.dt ?? new Date().toISOString(),
        }))
      return { fir, sigmets }
    })
    return { ...provenance(new Date().toISOString()), entries }
  }

  /**
   * Fetch a single station's METAR/TAF. AVWX returns 400 for a station code
   * it cannot resolve (e.g. not a real ICAO/IATA/GPS code) — treated as "no
   * data for this indicator" per the no-fabrication contract, not a failure.
   * Any other non-2xx status (auth, plan, rate limit, upstream failure) still
   * throws.
   */
  private async fetchStation(
    report: 'metar' | 'taf',
    icao: string,
  ): Promise<AvwxReport | null> {
    try {
      return await this.fetchJson<AvwxReport>(`/${report}/${icao}?format=json&onfail=error`)
    } catch (error) {
      if (error instanceof AvwxHttpError && (error.status === 400 || error.status === 404)) {
        return null
      }
      throw error
    }
  }

  private async fetchJson<T>(path: string): Promise<T> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const response = await fetch(`${BASE_URL}${path}`, {
        headers: { Authorization: `TOKEN ${this.apiToken}` },
        signal: controller.signal,
      })
      if (!response.ok) {
        throw new AvwxHttpError(response.status, await describeError(response, path))
      }
      return (await response.json()) as T
    } finally {
      clearTimeout(timer)
    }
  }
}

/** Carries the HTTP status so callers can distinguish "no data" (400/404) from a real failure. */
class AvwxHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'AvwxHttpError'
  }
}

/** Best-effort extraction of AVWX's own JSON error body, e.g. its plan-gating explanation. */
async function describeError(response: Response, path: string): Promise<string> {
  const fallback = `AVWX request failed: ${response.status} ${response.statusText} (${path})`
  try {
    const body = (await response.json()) as {
      error?: string
      meta?: { validation_error?: string }
    }
    const detail = body.error ?? body.meta?.validation_error
    return detail ? `${fallback} — ${detail}` : fallback
  } catch {
    return fallback
  }
}

function latestIssuedAt(reports: ReadonlyArray<AvwxReport | null>): string {
  return reports.find((r): r is AvwxReport => r !== null)?.time.dt ?? new Date().toISOString()
}
