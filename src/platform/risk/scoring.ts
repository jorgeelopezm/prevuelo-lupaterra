import type {
  AircraftSnapshot,
  DomainScore,
  RiskAnswer,
  RiskDomain,
  RiskVerdict,
  ScoredItem,
} from './types.js'

/** Fixed per-option point weights, shared by every 3-option pilot-answered
 * item (design.md: "per-item weighted points... following the AOPA ASI FRAT
 * convention") — option 0 is always the favorable answer. */
const OPTION_POINTS: readonly number[] = [0, 3, 6]

/** The IMSAFE items making up the Pilot domain — keys match the `risk.q_*` /
 * `risk.l_*` catalog entries already shipped. */
export const PILOT_ITEM_KEYS = [
  'illness',
  'medication',
  'stress',
  'alcohol',
  'fatigue',
  'emotion',
] as const

/** The enVironment domain's PAVE items. */
export const ENVIRONMENT_ITEM_KEYS = ['weather', 'terrain'] as const

/** The External-pressures domain's PAVE items. */
export const EXTERNAL_ITEM_KEYS = ['pressure', 'night'] as const

/** The Aircraft domain's auto-scored fields — no pilot-answered items, per
 * the shipped prototype copy (`risk.ac_telemetry`, `risk.max_cht`, …). */
export const AIRCRAFT_AUTO_ITEM_KEYS = [
  'engine_exceedance',
  'fuel_status',
  'hours_to_maintenance',
] as const

export type PilotItemKey = (typeof PILOT_ITEM_KEYS)[number]
export type EnvironmentItemKey = (typeof ENVIRONMENT_ITEM_KEYS)[number]
export type ExternalItemKey = (typeof EXTERNAL_ITEM_KEYS)[number]

/** Every pilot-answered item key across all three pilot-facing domains — the
 * complete set a submitted questionnaire must answer. */
export const ALL_PILOT_ANSWERED_ITEM_KEYS: readonly string[] = [
  ...PILOT_ITEM_KEYS,
  ...ENVIRONMENT_ITEM_KEYS,
  ...EXTERNAL_ITEM_KEYS,
]

const DOMAIN_FOR_ITEM: Record<string, RiskDomain> = {}
for (const key of PILOT_ITEM_KEYS) DOMAIN_FOR_ITEM[key] = 'pilot'
for (const key of ENVIRONMENT_ITEM_KEYS) DOMAIN_FOR_ITEM[key] = 'environment'
for (const key of EXTERNAL_ITEM_KEYS) DOMAIN_FOR_ITEM[key] = 'external'

/** Two fixed thresholds mapping the overall score to Low/Medium/High
 * (design.md: "Two fixed thresholds map the overall score to Low/Medium/High").
 * Max possible: pilot 6*6=36, environment 2*6=12, external 2*6=12,
 * aircraft 3*6=18 — overall max 78. */
export const LOW_MEDIUM_THRESHOLD = 20
export const MEDIUM_HIGH_THRESHOLD = 40

/** Score the pilot-answered items of one domain from the submitted answers. */
export function scoreAnsweredDomain(
  domain: RiskDomain,
  answers: readonly RiskAnswer[],
): DomainScore {
  const keys =
    domain === 'pilot'
      ? PILOT_ITEM_KEYS
      : domain === 'environment'
        ? ENVIRONMENT_ITEM_KEYS
        : EXTERNAL_ITEM_KEYS
  const byKey = new Map(answers.map((a) => [a.itemKey, a.optionIndex]))
  const items: ScoredItem[] = keys.map((itemKey) => {
    const optionIndex = byKey.get(itemKey) ?? 0
    const points = OPTION_POINTS[optionIndex] ?? 0
    return { itemKey, points, autoScored: false, notAvailable: false }
  })
  return { domain, score: items.reduce((sum, i) => sum + i.points, 0), items }
}

/** Score the Aircraft domain from its auto-scored fleet-data snapshot
 * (preflight-risk-assessment spec: "The Aircraft domain is enriched with
 * auto-scored aircraft data"). An item with no derivable value contributes
 * zero points and is flagged `notAvailable` rather than scored favorably. */
export function scoreAircraftDomain(snapshot: AircraftSnapshot): DomainScore {
  const items: ScoredItem[] = [
    {
      itemKey: 'engine_exceedance',
      points: snapshot.engineExceedance === true ? 6 : 0,
      autoScored: true,
      notAvailable: snapshot.engineExceedance === null,
    },
    {
      itemKey: 'fuel_status',
      points: snapshot.fuelStatus === 'low' ? 6 : 0,
      autoScored: true,
      notAvailable: snapshot.fuelStatus === null,
    },
    {
      itemKey: 'hours_to_maintenance',
      points:
        snapshot.hoursToNextMaintenance !== null && snapshot.hoursToNextMaintenance < 10 ? 6 : 0,
      autoScored: true,
      notAvailable: snapshot.hoursToNextMaintenance === null,
    },
  ]
  return { domain: 'aircraft', score: items.reduce((sum, i) => sum + i.points, 0), items }
}

/** Build all four domain scores from the submitted answers and the aircraft
 * auto-score snapshot. */
export function scoreAllDomains(
  answers: readonly RiskAnswer[],
  aircraftSnapshot: AircraftSnapshot,
): DomainScore[] {
  return [
    scoreAnsweredDomain('pilot', answers),
    scoreAircraftDomain(aircraftSnapshot),
    scoreAnsweredDomain('environment', answers),
    scoreAnsweredDomain('external', answers),
  ]
}

/** Sum domain scores into the overall score. */
export function overallScore(domainScores: readonly DomainScore[]): number {
  return domainScores.reduce((sum, d) => sum + d.score, 0)
}

/** Map an overall score to its Low/Medium/High verdict via the two fixed
 * thresholds. */
export function verdictForScore(score: number): RiskVerdict {
  if (score >= MEDIUM_HIGH_THRESHOLD) return 'high'
  if (score >= LOW_MEDIUM_THRESHOLD) return 'medium'
  return 'low'
}

export interface ContributingFactor {
  itemKey: string
  domain: RiskDomain
  points: number
}

/** The highest-scoring items across every domain, descending, ties broken by
 * declaration order — the "top contributing factors" shown with the result
 * (preflight-risk-assessment spec: "the highest-scoring items are listed as
 * contributing factors"). Zero-point items are never contributing factors. */
export function topContributingFactors(
  domainScores: readonly DomainScore[],
  limit = 3,
): ContributingFactor[] {
  const factors: ContributingFactor[] = []
  for (const domain of domainScores) {
    for (const item of domain.items) {
      if (item.points > 0)
        factors.push({ itemKey: item.itemKey, domain: domain.domain, points: item.points })
    }
  }
  return factors.sort((a, b) => b.points - a.points).slice(0, limit)
}

/** Which domain a pilot-answered item key belongs to (aircraft's auto-scored
 * keys are not included — they're never submitted by the pilot). */
export function domainForAnsweredItem(itemKey: string): RiskDomain | undefined {
  return DOMAIN_FOR_ITEM[itemKey]
}
