import type { ListCoverage } from './types.js'

/** A link to a state's official NOTAM briefing — a plain navigation, nothing is fetched. */
export interface OfficialBriefing {
  /** Catalog key for the localized link text. */
  labelKey: string
  href: string
}

/** ICAO prefix → the authority's public briefing entry page. */
const BRIEFINGS: ReadonlyArray<{ prefixes: readonly string[]; briefing: OfficialBriefing }> = [
  {
    prefixes: ['LE', 'GC'],
    briefing: {
      labelKey: 'weather.briefing_link_enaire',
      href: 'https://notampib.enaire.es/icaro',
    },
  },
  {
    prefixes: ['LP'],
    briefing: { labelKey: 'weather.briefing_link_nav_portugal', href: 'https://ais.nav.pt' },
  },
]

/** The official briefing for an aerodrome's state, or `null` for any other prefix. */
export function officialBriefingFor(icao: string): OfficialBriefing | null {
  const prefix = icao.trim().toUpperCase().slice(0, 2)
  return BRIEFINGS.find((b) => b.prefixes.includes(prefix))?.briefing ?? null
}

/**
 * The briefing to offer beside a NOTAM section: only when the list is not
 * confirmed complete — a confirmed list needs no pointer elsewhere.
 */
export function briefingForNotams(
  icao: string,
  coverage: ListCoverage | undefined,
): OfficialBriefing | null {
  return coverage === 'complete' ? null : officialBriefingFor(icao)
}
