import type {
  MetarResult,
  MetarReport,
  NotamResult,
  NotamReport,
  SigmetEntry,
  SigmetReport,
  SigmetResult,
  TafReport,
  TafResult,
  WeatherProvenance,
  WeatherProvider,
} from './types.js'

/**
 * Sample data marker. Every mock result carries this caveat verbatim so no
 * consumer can mistake scaffolding for a briefing.
 */
export const SAMPLE_CAVEAT = 'Sample data — not for operational use.'

/** Fixed issue/observation times keep mock results deterministic. */
const MOCK_OBSERVED_AT = '2026-08-25T06:00:00Z'

const METAR_BY_ICAO: Record<string, string> = {
  LEMD: 'LEMD 250600Z 27012KT 9999 SCT025 18/11 Q1016 NOSIG',
  LEBL: 'LEBL 250600Z 20010KT 8000 -RA SCT020 BKN040 17/14 Q1015 TEMPO 3000 SHRA',
  LPPT: 'LPPT 250600Z 30015G25KT CAVOK 19/12 Q1017 NOSIG',
  LPPR: 'LPPR 250600Z 32008KT 6000 BR SCT012 15/13 Q1018 BECMG 9999 NSW',
}

const TAF_BY_ICAO: Record<string, string> = {
  LEMD: 'TAF LEMD 250500Z 2506/2518 28012KT 9999 SCT030 TX24/2514Z TN14/2506Z',
  LEBL: 'TAF LEBL 250500Z 2506/2518 20010KT 9999 SCT025 TEMPO 2508/2512 3000 SHRA BKN014',
  LPPT: 'TAF LPPT 250500Z 2506/2518 30015G25KT CAVOK',
  LPPR: 'TAF LPPR 250500Z 2506/2518 32008KT 9999 SCT020 BECMG 2512/2514 03015KT',
}

const NOTAMS_BY_ICAO: Record<
  string,
  Array<{ id: string; text: string; startAt: string; endAt: string }>
> = {
  LEMD: [
    {
      id: 'A1234/26',
      text: 'RWY 14R/32L CLOSED DUE WIP DAILY 0600-1400.',
      startAt: '2026-08-25T06:00:00Z',
      endAt: '2026-08-28T14:00:00Z',
    },
    {
      id: 'A1235/26',
      text: 'TWY B2 CLOSED EXC ACFT BASED LEMD.',
      startAt: '2026-08-25T06:00:00Z',
      endAt: '2026-09-01T06:00:00Z',
    },
  ],
  LEBL: [
    {
      id: 'B0456/26',
      text: 'BIRDS ACTIVE IN VICINITY OF RWY 25L.',
      startAt: '2026-08-25T06:00:00Z',
      endAt: '2026-08-30T18:00:00Z',
    },
  ],
  LPPT: [],
  LPPR: [],
}

const SIGMETS_BY_FIR: Record<string, SigmetEntry[]> = {
  LECM: [
    {
      header: 'LECM SIGMET 3 VALID 250600/251200',
      text: 'LECM MADRID FIR EMBD TS OBS AT 0520Z N OF 4000N FL250 MOV E SLW NC.',
      startAt: '2026-08-25T06:00:00Z',
      endAt: '2026-08-25T12:00:00Z',
    },
  ],
  LECB: [
    {
      header: 'LECB SIGMET 2 VALID 250600/251200',
      text: 'LECB BARCELONA FIR SEV TURB OBS AT 0530Z S OF 4100N FL310 MOV NE NC.',
      startAt: '2026-08-25T06:00:00Z',
      endAt: '2026-08-25T12:00:00Z',
    },
  ],
  LPPC: [
    {
      header: 'LPPC SIGMET 4 VALID 250600/251200',
      text: 'LPPC LISBOA FIR SEV ICE OBS AT 0540Z N OF 3900N FL240 MOV E SLW NC.',
      startAt: '2026-08-25T06:00:00Z',
      endAt: '2026-08-25T12:00:00Z',
    },
  ],
}

function nowIso(): string {
  return new Date().toISOString()
}

function provenance(cached: boolean): WeatherProvenance {
  return {
    provider: 'mock',
    issuedAt: MOCK_OBSERVED_AT,
    retrievedAt: nowIso(),
    cached,
    cacheAgeSeconds: 0,
    sample: true,
    caveat: SAMPLE_CAVEAT,
  }
}

/**
 * Deterministic mock provider seeded with representative Iberian sample data:
 * METAR/TAF/NOTAM for LEMD, LEBL, LPPT, LPPR and SIGMET for the LECM, LECB,
 * and LPPC FIRs. Every result is explicitly marked as sample data unsuitable
 * for operational use. Unknown indicators yield a no-data entry rather than
 * failing the call.
 */
export function createMockWeatherProvider(): WeatherProvider {
  return {
    id: 'mock',

    async getMetar(icaos: readonly string[]): Promise<MetarResult> {
      const entries: MetarReport[] = icaos.map((icao) => {
        const report = METAR_BY_ICAO[icao] ?? null
        return { icao, report, observationTime: report ? MOCK_OBSERVED_AT : null }
      })
      return { ...provenance(false), entries }
    },

    async getTaf(icaos: readonly string[]): Promise<TafResult> {
      const entries: TafReport[] = icaos.map((icao) => {
        const report = TAF_BY_ICAO[icao] ?? null
        return { icao, report, issueTime: report ? MOCK_OBSERVED_AT : null }
      })
      return { ...provenance(false), entries }
    },

    async getNotams(icaos: readonly string[]): Promise<NotamResult> {
      const entries: NotamReport[] = icaos.map((icao) => {
        // A seeded aerodrome's fixture list is the whole (sample) set, so an
        // empty one (LPPT, LPPR) is a confirmed "none in force"; an unseeded
        // one is only "none returned".
        const seeded = Object.hasOwn(NOTAMS_BY_ICAO, icao)
        return {
          icao,
          notams: NOTAMS_BY_ICAO[icao] ?? [],
          coverage: seeded ? ('complete' as const) : ('unknown' as const),
        }
      })
      return { ...provenance(false), entries }
    },

    async getSigmet(firs: readonly string[]): Promise<SigmetResult> {
      const entries: SigmetReport[] = firs.map((fir) => {
        const seeded = Object.hasOwn(SIGMETS_BY_FIR, fir)
        return {
          fir,
          sigmets: SIGMETS_BY_FIR[fir] ?? [],
          coverage: seeded ? ('complete' as const) : ('unknown' as const),
        }
      })
      return { ...provenance(false), entries }
    },
  }
}
