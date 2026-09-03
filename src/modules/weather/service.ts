import type {
  DecodedMetar,
  MetarReport,
  NotamReport,
  SigmetReport,
  TafReport,
  WeatherLocale,
  WeatherMcpClient,
  WeatherMcpError,
  WeatherMcpResult,
  WeatherProvenance,
} from '../../platform/weather-mcp/types.js'

export interface ErrorView {
  kind: WeatherMcpError['kind']
  provider?: string
  retryAfterSeconds?: number
}

export type Section<T> = { status: 'ok'; provenance: WeatherProvenance; data: T } | { status: 'error'; error: ErrorView }

export interface AerodromeView {
  icao: string
  metar: Section<MetarReport>
  taf: Section<TafReport>
  notams: Section<NotamReport>
  /** Only present when the METAR section is `ok` and carries a report. */
  decoded: Section<DecodedMetar> | null
}

export interface FirView {
  fir: string
  sigmet: Section<SigmetReport>
}

export interface WeatherViewModel {
  aerodromes: AerodromeView[]
  firResult: FirView | null
}

function toErrorView(error: WeatherMcpError): ErrorView {
  return { kind: error.kind, provider: error.provider, retryAfterSeconds: error.retryAfterSeconds }
}

/**
 * Apply one batched tool result (entries keyed by `find`) to every requested
 * indicator's section. A batch call succeeds or fails as a whole — the MCP
 * tools accept multiple ICAOs per call — so a failure here becomes the same
 * error on every indicator's section for this tool, while an independent
 * tool call (a different data kind) is unaffected. A present-but-null report
 * inside a successful batch is rendered as its own "no data" section rather
 * than an error, per the MCP server's per-indicator no-data contract.
 */
function sectionsFor<E>(
  ids: readonly string[],
  result: WeatherMcpResult<{ entries: E[] } & WeatherProvenance>,
  find: (entries: E[], id: string) => E,
): Map<string, Section<E>> {
  const map = new Map<string, Section<E>>()
  if (!result.ok) {
    const error = toErrorView(result.error)
    for (const id of ids) map.set(id, { status: 'error', error })
    return map
  }
  const { entries, ...provenance } = result.data
  for (const id of ids) {
    map.set(id, { status: 'ok', provenance, data: find(entries, id) })
  }
  return map
}

export interface BuildWeatherViewModelOptions {
  weatherMcp: WeatherMcpClient
  icaos: readonly string[]
  fir?: string
  locale: WeatherLocale
}

export async function buildWeatherViewModel(
  opts: BuildWeatherViewModelOptions,
): Promise<WeatherViewModel> {
  const { weatherMcp, icaos, fir, locale } = opts

  const [metarResult, tafResult, notamsResult, sigmetResult] = await Promise.all([
    icaos.length ? weatherMcp.getMetar(icaos) : null,
    icaos.length ? weatherMcp.getTaf(icaos) : null,
    icaos.length ? weatherMcp.getNotams(icaos) : null,
    fir ? weatherMcp.getSigmet(fir) : null,
  ])

  const metarByIcao = metarResult
    ? sectionsFor(icaos, metarResult, (entries, icao) =>
        entries.find((e) => e.icao === icao) ?? { icao, report: null, observationTime: null },
      )
    : new Map<string, Section<MetarReport>>()
  const tafByIcao = tafResult
    ? sectionsFor(icaos, tafResult, (entries, icao) =>
        entries.find((e) => e.icao === icao) ?? { icao, report: null, issueTime: null },
      )
    : new Map<string, Section<TafReport>>()
  const notamsByIcao = notamsResult
    ? sectionsFor(icaos, notamsResult, (entries, icao) =>
        entries.find((e) => e.icao === icao) ?? { icao, notams: [] },
      )
    : new Map<string, Section<NotamReport>>()

  const decodedByIcao = new Map<string, Section<DecodedMetar>>()
  await Promise.all(
    icaos.map(async (icao) => {
      const metar = metarByIcao.get(icao)
      if (!metar || metar.status !== 'ok' || !metar.data.report) return
      const decoded = await weatherMcp.decodeMetar(metar.data.report, locale)
      decodedByIcao.set(
        icao,
        decoded.ok
          ? { status: 'ok', provenance: metar.provenance, data: decoded.data }
          : { status: 'error', error: toErrorView(decoded.error) },
      )
    }),
  )

  const aerodromes: AerodromeView[] = icaos.map((icao) => ({
    icao,
    metar: metarByIcao.get(icao) ?? { status: 'error', error: { kind: 'provider_error' } },
    taf: tafByIcao.get(icao) ?? { status: 'error', error: { kind: 'provider_error' } },
    notams: notamsByIcao.get(icao) ?? { status: 'error', error: { kind: 'provider_error' } },
    decoded: decodedByIcao.get(icao) ?? null,
  }))

  let firResult: FirView | null = null
  if (fir && sigmetResult) {
    const section = sectionsFor([fir], sigmetResult, (entries, f) =>
      entries.find((e) => e.fir === f) ?? { fir: f, sigmets: [] },
    ).get(fir)
    firResult = section ? { fir, sigmet: section } : null
  }

  return { aerodromes, firResult }
}
