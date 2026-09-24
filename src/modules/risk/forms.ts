import { z } from 'zod'

import { ALL_PILOT_ANSWERED_ITEM_KEYS } from '../../platform/risk/scoring.js'
import type { CreateFlightIntentInput, RiskAnswer } from '../../platform/risk/types.js'

/**
 * Field-level validation errors keyed by form field name, resolved to catalog
 * keys (never English text) so the route handler only has to translate them.
 */
export type RiskFormErrors = Record<string, string>

export type RiskFormResult<T> = { ok: true; data: T } | { ok: false; errors: RiskFormErrors }

const ICAO_LOCATION_PATTERN = /^[A-Za-z]{4}$/

const flightIntentFormSchema = z
  .object({
    aircraftId: z.string().trim().min(1, 'flight_intent.error.aircraft_required'),
    plannedDate: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'flight_intent.error.date_invalid'),
    departureIcao: z
      .string()
      .trim()
      .regex(ICAO_LOCATION_PATTERN, 'flight_intent.error.aerodrome_invalid'),
    destinationIcao: z
      .string()
      .trim()
      .regex(ICAO_LOCATION_PATTERN, 'flight_intent.error.aerodrome_invalid'),
  })
  .superRefine((data, ctx) => {
    const today = new Date().toISOString().slice(0, 10)
    if (data.plannedDate < today) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['plannedDate'],
        message: 'flight_intent.error.date_past',
      })
    }
  })

/**
 * Validate a submitted flight-intent form. Aircraft ownership (that
 * `aircraftId` names one of the pilot's own non-retired aircraft) is checked
 * by the repository, not here — the route handler surfaces its
 * `aircraft_not_owned` reason as a form error.
 */
export function validateFlightIntentForm(
  body: Record<string, unknown>,
): RiskFormResult<CreateFlightIntentInput> {
  const parsed = flightIntentFormSchema.safeParse(body)
  if (!parsed.success) {
    const errors: RiskFormErrors = {}
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] ? String(issue.path[0]) : 'general'
      if (!errors[field]) errors[field] = issue.message
    }
    return { ok: false, errors }
  }
  const data = parsed.data
  return {
    ok: true,
    data: {
      aircraftId: data.aircraftId,
      plannedDate: data.plannedDate,
      departureIcao: data.departureIcao.toUpperCase(),
      destinationIcao: data.destinationIcao.toUpperCase(),
    },
  }
}

export interface QuestionnaireFormResult {
  ok: boolean
  answers: RiskAnswer[]
  /** Item keys with no selected option (preflight-risk-assessment spec:
   * "Incomplete questionnaire cannot be submitted"). */
  unanswered: string[]
}

/**
 * Validate a submitted questionnaire body: every pilot-answered item
 * (Pilot/IMSAFE, enVironment, External domains) must carry a selected option
 * index. The Aircraft domain's auto-scored items are never submitted by the
 * pilot, so they are not checked here.
 */
export function validateQuestionnaireForm(body: Record<string, unknown>): QuestionnaireFormResult {
  const answers: RiskAnswer[] = []
  const unanswered: string[] = []

  for (const itemKey of ALL_PILOT_ANSWERED_ITEM_KEYS) {
    const raw = body[itemKey]
    const optionIndex = typeof raw === 'string' && raw.trim().length > 0 ? Number(raw) : NaN
    if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex > 2) {
      unanswered.push(itemKey)
      continue
    }
    answers.push({ itemKey, optionIndex })
  }

  return { ok: unanswered.length === 0, answers, unanswered }
}
