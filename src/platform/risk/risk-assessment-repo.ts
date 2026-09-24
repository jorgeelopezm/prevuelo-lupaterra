import type { PoolFacade } from '../db/pool.js'
import type {
  AircraftSnapshot,
  CreateRiskAssessmentInput,
  DomainScore,
  RiskAnswer,
  RiskAssessmentRecord,
  RiskAssessmentWriteResult,
  RiskVerdict,
} from './types.js'

interface RiskAssessmentRow {
  id: string
  pilot_id: string
  flight_intent_id: string
  answers: RiskAnswer[]
  domain_scores: DomainScore[]
  overall_score: number
  verdict: string
  aircraft_snapshot: AircraftSnapshot
  submitted_at: Date
}

function mapAssessment(row: RiskAssessmentRow): RiskAssessmentRecord {
  return {
    id: row.id,
    pilotId: row.pilot_id,
    flightIntentId: row.flight_intent_id,
    answers: row.answers,
    domainScores: row.domain_scores,
    overallScore: row.overall_score,
    verdict: row.verdict as RiskVerdict,
    aircraftSnapshot: row.aircraft_snapshot,
    submittedAt: row.submitted_at,
  }
}

const ASSESSMENT_COLUMNS =
  'id, pilot_id, flight_intent_id, answers, domain_scores, overall_score, verdict, aircraft_snapshot, submitted_at'

/** Immutable, insert-only records: a risk assessment is a point-in-time
 * judgment (preflight-risk-assessment spec: "Every completed evaluation is
 * persisted as an immutable record") — there is no update method. */
export interface RiskAssessmentRepo {
  create(pilotId: string, input: CreateRiskAssessmentInput): Promise<RiskAssessmentWriteResult>
  findById(pilotId: string, id: string): Promise<RiskAssessmentRecord | null>
  listForFlightIntent(pilotId: string, flightIntentId: string): Promise<RiskAssessmentRecord[]>
  listForPilot(pilotId: string): Promise<RiskAssessmentRecord[]>
}

export function createRiskAssessmentRepo(pool: PoolFacade): RiskAssessmentRepo {
  return {
    async create(pilotId, input) {
      try {
        const inserted = await pool.query<{ id: string }>(
          `INSERT INTO risk_assessments (
             pilot_id, flight_intent_id, answers, domain_scores, overall_score, verdict, aircraft_snapshot
           ) VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id`,
          [
            pilotId,
            input.flightIntentId,
            JSON.stringify(input.answers),
            JSON.stringify(input.domainScores),
            input.overallScore,
            input.verdict,
            JSON.stringify(input.aircraftSnapshot),
          ],
        )
        const id = inserted.rows[0]?.id
        if (!id) throw new Error('risk_assessments insert returned no id')
        const assessment = await findByPilotAndId(pool, pilotId, id)
        return { ok: true, assessment: assessment as RiskAssessmentRecord }
      } catch (error) {
        if (isFkViolation(error)) return { ok: false, reason: 'flight_intent_not_owned' }
        throw error
      }
    },

    async findById(pilotId, id) {
      return findByPilotAndId(pool, pilotId, id)
    },

    async listForFlightIntent(pilotId, flightIntentId) {
      const result = await pool.query<RiskAssessmentRow>(
        `SELECT ${ASSESSMENT_COLUMNS} FROM risk_assessments
         WHERE pilot_id = $1 AND flight_intent_id = $2
         ORDER BY submitted_at DESC`,
        [pilotId, flightIntentId],
      )
      return result.rows.map(mapAssessment)
    },

    async listForPilot(pilotId) {
      const result = await pool.query<RiskAssessmentRow>(
        `SELECT ${ASSESSMENT_COLUMNS} FROM risk_assessments
         WHERE pilot_id = $1
         ORDER BY submitted_at DESC`,
        [pilotId],
      )
      return result.rows.map(mapAssessment)
    },
  }
}

async function findByPilotAndId(
  pool: PoolFacade,
  pilotId: string,
  id: string,
): Promise<RiskAssessmentRecord | null> {
  const result = await pool.query<RiskAssessmentRow>(
    `SELECT ${ASSESSMENT_COLUMNS} FROM risk_assessments WHERE id = $1 AND pilot_id = $2 LIMIT 1`,
    [id, pilotId],
  )
  const row = result.rows[0]
  return row ? mapAssessment(row) : null
}

function isFkViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: string }).code === '23503'
  )
}
