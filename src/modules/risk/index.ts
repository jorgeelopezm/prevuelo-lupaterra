import type { FastifyRequest } from 'fastify'

import type { FeatureModule } from '../types.js'
import { createTranslator } from '../../platform/i18n/catalog.js'
import { SUPPORTED_LOCALES, type SupportedLocale } from '../../platform/i18n/locale.js'
import { destinationPath } from '../../platform/i18n/segments.js'
import { createRequireAuthHook } from '../../server/auth/auth-plugin.js'
import { createAircraftRepo } from '../../platform/fleet/aircraft-repo.js'
import { createFlightRepo } from '../../platform/fleet/flight-repo.js'
import { createMaintenanceRepo } from '../../platform/fleet/maintenance-repo.js'
import { createEngineDataRepo } from '../../platform/fleet/engine-data-repo.js'
import { createWbRepo } from '../../platform/fleet/wb-repo.js'
import { createFlightIntentRepo } from '../../platform/risk/flight-intent-repo.js'
import { createRiskAssessmentRepo } from '../../platform/risk/risk-assessment-repo.js'
import { readAircraftSnapshot } from '../../platform/risk/aircraft-snapshot.js'
import {
  ENVIRONMENT_ITEM_KEYS,
  EXTERNAL_ITEM_KEYS,
  PILOT_ITEM_KEYS,
  overallScore,
  scoreAllDomains,
  topContributingFactors,
  verdictForScore,
} from '../../platform/risk/scoring.js'
import type {
  DomainScore,
  FlightIntentRecord,
  RiskAssessmentRecord,
} from '../../platform/risk/types.js'
import {
  validateFlightIntentForm,
  validateQuestionnaireForm,
  type RiskFormErrors,
} from './forms.js'
import { riskPath } from './paths.js'

function makeSignInUrlBuilder(locale: SupportedLocale): (req: FastifyRequest) => string {
  return (req) => `/${locale}/auth/sign-in?next=${encodeURIComponent(req.url)}`
}

function flightIntentView(intent: FlightIntentRecord, locale: SupportedLocale) {
  return {
    id: intent.id,
    aircraftId: intent.aircraftId,
    plannedDate: intent.plannedDate,
    departureIcao: intent.departureIcao,
    destinationIcao: intent.destinationIcao,
    startAssessmentHref: riskPath('assessment', locale, [intent.id, 'new']),
  }
}

/** Presentation shape for one domain's breakdown on the result/history
 * screens — pre-resolves each item's translation key so the template never
 * has to branch on `autoScored`/`notAvailable`. */
const DOMAIN_TITLE_KEY: Record<DomainScore['domain'], string> = {
  pilot: 'risk.d_pilot',
  aircraft: 'risk.d_aircraft',
  environment: 'risk.d_env',
  external: 'risk.d_ext',
}

function domainView(domain: DomainScore) {
  return {
    domain: domain.domain,
    titleKey: DOMAIN_TITLE_KEY[domain.domain],
    score: domain.score,
    items: domain.items.map((item) => ({
      itemKey: item.itemKey,
      points: item.points,
      autoScored: item.autoScored,
      notAvailable: item.notAvailable,
    })),
  }
}

function assessmentView(assessment: RiskAssessmentRecord, locale: SupportedLocale) {
  return {
    id: assessment.id,
    flightIntentId: assessment.flightIntentId,
    overallScore: assessment.overallScore,
    verdict: assessment.verdict,
    submittedAt: assessment.submittedAt,
    domains: assessment.domainScores.map(domainView),
    topFactors: topContributingFactors(assessment.domainScores),
    resultHref: riskPath('result', locale, [assessment.id]),
  }
}

/** Pre-flight risk assessment & flight-intent module (`preflight-risk-
 * assessment` / `flight-intent` capabilities). */
export const riskModule: FeatureModule = {
  id: 'risk',
  labelKey: 'nav.risk',
  icon: 'shield',
  order: 4,
  register: (app, context) => {
    const aircraftRepo = createAircraftRepo(context.pool)
    const flightRepo = createFlightRepo(context.pool)
    const maintenanceRepo = createMaintenanceRepo(context.pool)
    const engineDataRepo = createEngineDataRepo(context.pool)
    const wbRepo = createWbRepo(context.pool)
    const flightIntentRepo = createFlightIntentRepo(context.pool)
    const riskAssessmentRepo = createRiskAssessmentRepo(context.pool)

    for (const locale of SUPPORTED_LOCALES) {
      const requireAuth = { onRequest: createRequireAuthHook(makeSignInUrlBuilder(locale)) }

      // Main screen: the pilot's flight plans (flight intents) plus entry
      // points to start a new assessment or view history.
      app.get(destinationPath('risk', locale), requireAuth, async (req, reply) => {
        const t = createTranslator({ locale })
        const pilotId = (req.pilot as NonNullable<typeof req.pilot>).id
        const [flightIntents, recentAssessments] = await Promise.all([
          flightIntentRepo.listForPilot(pilotId),
          riskAssessmentRepo.listForPilot(pilotId),
        ])

        const html = context.views.render(req, {
          fragment: 'pages/risk.njk',
          locals: {
            title: t.translate('risk.title'),
            activeNav: 'risk',
            icon: 'shield',
            flightIntents: flightIntents.map((i) => flightIntentView(i, locale)),
            newFlightIntentHref: riskPath('flight-intent', locale, ['new']),
            historyHref: riskPath('history', locale, []),
            recentCount: recentAssessments.length,
          },
        })
        return reply.type('text/html; charset=utf-8').send(html)
      })

      // Flight-intent inline creation (flight-intent spec).
      app.get(riskPath('flight-intent', locale, ['new']), requireAuth, async (req, reply) => {
        const t = createTranslator({ locale })
        const pilotId = (req.pilot as NonNullable<typeof req.pilot>).id
        const aircraftList = await aircraftRepo.listActive(pilotId)

        const html = context.views.render(req, {
          fragment: 'pages/risk-flight-intent-form.njk',
          locals: {
            title: t.translate('flight_intent.title'),
            activeNav: 'risk',
            icon: 'shield',
            action: riskPath('flight-intent', locale, ['new']),
            aircraftOptions: aircraftList.map((a) => ({ id: a.id, registration: a.registration })),
            values: { plannedDate: new Date().toISOString().slice(0, 10) },
            errors: {},
            cancelHref: destinationPath('risk', locale),
          },
        })
        return reply.type('text/html; charset=utf-8').send(html)
      })

      app.post(riskPath('flight-intent', locale, ['new']), requireAuth, async (req, reply) => {
        const t = createTranslator({ locale })
        const pilotId = (req.pilot as NonNullable<typeof req.pilot>).id
        const body = (req.body ?? {}) as Record<string, unknown>
        const result = validateFlightIntentForm(body)

        const renderError = async (errors: RiskFormErrors) => {
          const translatedErrors: Record<string, string> = {}
          for (const [field, key] of Object.entries(errors))
            translatedErrors[field] = t.translate(key)
          const aircraftList = await aircraftRepo.listActive(pilotId)
          const html = context.views.render(req, {
            fragment: 'pages/risk-flight-intent-form.njk',
            locals: {
              title: t.translate('flight_intent.title'),
              activeNav: 'risk',
              icon: 'shield',
              action: riskPath('flight-intent', locale, ['new']),
              aircraftOptions: aircraftList.map((a) => ({
                id: a.id,
                registration: a.registration,
              })),
              values: body,
              errors: translatedErrors,
              cancelHref: destinationPath('risk', locale),
            },
          })
          return reply.code(422).type('text/html; charset=utf-8').send(html)
        }

        if (!result.ok) return renderError(result.errors)

        const created = await flightIntentRepo.create(pilotId, result.data)
        if (!created.ok) {
          return renderError({ aircraftId: 'flight_intent.error.aircraft_not_owned' })
        }

        return reply.redirect(riskPath('assessment', locale, [created.flightIntent.id, 'new']), 303)
      })

      // Start / submit a risk assessment against a flight intent
      // (preflight-risk-assessment spec).
      app.get(
        riskPath('assessment', locale, [':flightIntentId', 'new']),
        requireAuth,
        async (req, reply) => {
          const t = createTranslator({ locale })
          const pilotId = (req.pilot as NonNullable<typeof req.pilot>).id
          const { flightIntentId } = req.params as { flightIntentId: string }
          const flightIntent = await flightIntentRepo.findById(pilotId, flightIntentId)
          if (!flightIntent) return reply.callNotFound()

          const aircraftSnapshot = await readAircraftSnapshot(pilotId, flightIntent.aircraftId, {
            flightRepo,
            maintenanceRepo,
            engineDataRepo,
            wbRepo,
          })

          const html = context.views.render(req, {
            fragment: 'pages/risk-questionnaire.njk',
            locals: {
              title: t.translate('risk.title'),
              subtitle: t.translate('risk.subtitle'),
              activeNav: 'risk',
              icon: 'shield',
              action: riskPath('assessment', locale, [flightIntentId, 'new']),
              flightIntent: flightIntentView(flightIntent, locale),
              pilotItemKeys: PILOT_ITEM_KEYS,
              environmentItemKeys: ENVIRONMENT_ITEM_KEYS,
              externalItemKeys: EXTERNAL_ITEM_KEYS,
              aircraftSnapshot,
              values: {},
              unanswered: [],
              cancelHref: destinationPath('risk', locale),
            },
          })
          return reply.type('text/html; charset=utf-8').send(html)
        },
      )

      app.post(
        riskPath('assessment', locale, [':flightIntentId', 'new']),
        requireAuth,
        async (req, reply) => {
          const t = createTranslator({ locale })
          const pilotId = (req.pilot as NonNullable<typeof req.pilot>).id
          const { flightIntentId } = req.params as { flightIntentId: string }
          const flightIntent = await flightIntentRepo.findById(pilotId, flightIntentId)
          if (!flightIntent) return reply.callNotFound()

          const body = (req.body ?? {}) as Record<string, unknown>
          const parsed = validateQuestionnaireForm(body)

          const aircraftSnapshot = await readAircraftSnapshot(pilotId, flightIntent.aircraftId, {
            flightRepo,
            maintenanceRepo,
            engineDataRepo,
            wbRepo,
          })

          if (!parsed.ok) {
            const html = context.views.render(req, {
              fragment: 'pages/risk-questionnaire.njk',
              locals: {
                title: t.translate('risk.title'),
                subtitle: t.translate('risk.subtitle'),
                activeNav: 'risk',
                icon: 'shield',
                action: riskPath('assessment', locale, [flightIntentId, 'new']),
                flightIntent: flightIntentView(flightIntent, locale),
                pilotItemKeys: PILOT_ITEM_KEYS,
                environmentItemKeys: ENVIRONMENT_ITEM_KEYS,
                externalItemKeys: EXTERNAL_ITEM_KEYS,
                aircraftSnapshot,
                values: body,
                unanswered: parsed.unanswered,
                error: t.translate('risk.submit_incomplete'),
                cancelHref: destinationPath('risk', locale),
              },
            })
            return reply.code(422).type('text/html; charset=utf-8').send(html)
          }

          const domainScores = scoreAllDomains(parsed.answers, aircraftSnapshot)
          const score = overallScore(domainScores)
          const verdict = verdictForScore(score)

          const created = await riskAssessmentRepo.create(pilotId, {
            flightIntentId,
            answers: parsed.answers,
            domainScores,
            overallScore: score,
            verdict,
            aircraftSnapshot,
          })
          if (!created.ok) return reply.callNotFound()

          return reply.redirect(riskPath('result', locale, [created.assessment.id]), 303)
        },
      )

      // Result view (preflight-risk-assessment spec: "Responses are
      // aggregated into a Low/Medium/High verdict").
      app.get(riskPath('result', locale, [':id']), requireAuth, async (req, reply) => {
        const t = createTranslator({ locale })
        const pilotId = (req.pilot as NonNullable<typeof req.pilot>).id
        const { id } = req.params as { id: string }
        const assessment = await riskAssessmentRepo.findById(pilotId, id)
        if (!assessment) return reply.callNotFound()
        const flightIntent = await flightIntentRepo.findById(pilotId, assessment.flightIntentId)

        const html = context.views.render(req, {
          fragment: 'pages/risk-result.njk',
          locals: {
            title: t.translate('risk.result_title'),
            activeNav: 'risk',
            icon: 'shield',
            assessment: assessmentView(assessment, locale),
            flightIntent: flightIntent ? flightIntentView(flightIntent, locale) : null,
            backHref: destinationPath('risk', locale),
          },
        })
        return reply.type('text/html; charset=utf-8').send(html)
      })

      // Read-only history: every risk assessment the pilot has recorded
      // (preflight-risk-assessment spec: "Records are not editable").
      app.get(riskPath('history', locale, []), requireAuth, async (req, reply) => {
        const t = createTranslator({ locale })
        const pilotId = (req.pilot as NonNullable<typeof req.pilot>).id
        const assessments = await riskAssessmentRepo.listForPilot(pilotId)
        const flightIntents = await flightIntentRepo.listForPilot(pilotId)
        const flightIntentById = new Map(flightIntents.map((i) => [i.id, i]))

        const html = context.views.render(req, {
          fragment: 'pages/risk-history.njk',
          locals: {
            title: t.translate('risk.history_title'),
            activeNav: 'risk',
            icon: 'shield',
            assessments: assessments.map((a) => ({
              ...assessmentView(a, locale),
              flightIntent: flightIntentById.has(a.flightIntentId)
                ? flightIntentView(
                    flightIntentById.get(a.flightIntentId) as FlightIntentRecord,
                    locale,
                  )
                : null,
            })),
            backHref: destinationPath('risk', locale),
          },
        })
        return reply.type('text/html; charset=utf-8').send(html)
      })
    }
  },
}
