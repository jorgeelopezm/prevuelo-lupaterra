import type { FeatureModule } from '../types.js'
import { createTranslator } from '../../platform/i18n/catalog.js'
import { SUPPORTED_LOCALES, type SupportedLocale } from '../../platform/i18n/locale.js'
import { destinationPath } from '../../platform/i18n/segments.js'
import { createAircraftRepo } from '../../platform/fleet/aircraft-repo.js'
import { createFlightRepo } from '../../platform/fleet/flight-repo.js'
import { createMaintenanceRepo } from '../../platform/fleet/maintenance-repo.js'
import { createEngineDataRepo } from '../../platform/fleet/engine-data-repo.js'
import { createWbRepo } from '../../platform/fleet/wb-repo.js'
import { createFlightIntentRepo } from '../../platform/risk/flight-intent-repo.js'
import { createRiskAssessmentRepo } from '../../platform/risk/risk-assessment-repo.js'
import { createChecklistRepo } from '../../platform/checklists/checklist-repo.js'
import { createRunRepo } from '../../platform/checklists/run-repo.js'
import { fleetWbPath, riskAssessmentNewPath, riskFlightIntentNewPath } from './cross-links.js'
import { dashboardPath } from './paths.js'
import {
  buildHomeViewModel,
  buildHomeWeatherViewModel,
  selectNextIntent,
  type HomeLinks,
} from './service.js'

/** Dashboard module: the locale home screen — the pre-flight brief
 * (`home-dashboard` capability). Its route namespace is the locale root
 * (`/es`), the target of the root redirect. */
export const dashboardModule: FeatureModule = {
  id: 'dashboard',
  labelKey: 'nav.home',
  icon: 'home',
  order: 1,
  register: (app, context) => {
    const aircraftRepo = createAircraftRepo(context.pool)
    const flightRepo = createFlightRepo(context.pool)
    const maintenanceRepo = createMaintenanceRepo(context.pool)
    const engineDataRepo = createEngineDataRepo(context.pool)
    const wbRepo = createWbRepo(context.pool)
    const flightIntentRepo = createFlightIntentRepo(context.pool)
    const riskAssessmentRepo = createRiskAssessmentRepo(context.pool)
    const checklistRepo = createChecklistRepo(context.pool)
    const runRepo = createRunRepo(context.pool)

    function linksFor(loc: SupportedLocale): HomeLinks {
      return {
        weatherHref: destinationPath('weather', loc),
        weatherFragmentHref: dashboardPath('weather-summary', loc),
        riskHref: destinationPath('risk', loc),
        aircraftHref: destinationPath('fleet', loc),
        checklistsHref: destinationPath('checklists', loc),
        planFlightHref: riskFlightIntentNewPath(loc),
        wbHrefFor: (aircraftId) => fleetWbPath(loc, aircraftId),
        startAssessmentHref: (flightIntentId) => riskAssessmentNewPath(loc, flightIntentId),
      }
    }

    for (const locale of SUPPORTED_LOCALES) {
      // Locale root: the pre-flight brief. Protected by the global wall, so
      // anonymous visitors are redirected to sign-in before reaching it.
      app.get(destinationPath('dashboard', locale), async (req, reply) => {
        const t = createTranslator({ locale: req.locale })
        const links = linksFor(locale)

        // Behind the wall (identity-access: "Route protection"): a pilot is
        // always present here.
        if (!req.pilot) throw new Error('home route reached without a pilot')

        const activeAircraft = await aircraftRepo.getActiveAircraft(req.pilot.id)
        const viewModel = await buildHomeViewModel({
          pilotId: req.pilot.id,
          activeAircraft,
          repos: {
            flightIntentRepo,
            riskAssessmentRepo,
            flightRepo,
            maintenanceRepo,
            engineDataRepo,
            wbRepo,
            aircraftRepo,
            checklistRepo,
            runRepo,
          },
          links,
          locale,
          now: new Date(),
        })

        const html = context.views.render(req, {
          fragment: 'pages/home.njk',
          locals: {
            title: t.translate('nav.home'),
            activeNav: 'dashboard',
            icon: 'home',
            signedIn: true,
            viewModel,
          },
        })
        return reply.type('text/html; charset=utf-8').send(html)
      })

      // Weather + NOTAM fragment: loaded lazily by the home page via htmx
      // (design decision 2), directly requestable on its own too (design
      // decision 7 / task 3.4).
      app.get(dashboardPath('weather-summary', locale), async (req, reply) => {
        const links = linksFor(locale)
        let icao: string | null = null
        if (req.pilot) {
          const intents = await flightIntentRepo.listForPilot(req.pilot.id)
          icao = selectNextIntent(intents, new Date())?.departureIcao ?? null
        }

        const result = await buildHomeWeatherViewModel({
          weatherMcp: context.weatherMcp,
          icao,
          weatherHref: links.weatherHref,
          locale,
        })

        const html = context.views.render(req, {
          fragment: 'partials/home-weather.njk',
          locals: { activeNav: 'dashboard', result },
        })
        return reply.type('text/html; charset=utf-8').send(html)
      })
    }
  },
}
