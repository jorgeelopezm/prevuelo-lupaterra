import type { FeatureModule } from '../types.js'
import { createTranslator } from '../../platform/i18n/catalog.js'
import { SUPPORTED_LOCALES } from '../../platform/i18n/locale.js'
import { destinationPath } from '../../platform/i18n/segments.js'
import { parseWeatherQuery } from './query.js'
import { buildWeatherViewModel } from './service.js'

/** Weather & NOTAMs module: METAR/TAF/NOTAM/SIGMET lookup via the aviation-weather MCP server. */
export const weatherModule: FeatureModule = {
  id: 'weather',
  labelKey: 'nav.weather',
  icon: 'cloud',
  order: 2,
  register: (app, context) => {
    for (const locale of SUPPORTED_LOCALES) {
      app.get(destinationPath('weather', locale), async (req, reply) => {
        const t = createTranslator({ locale: req.locale })
        const query = parseWeatherQuery(req.query as Record<string, unknown>)
        const hasValidInput = query.icaos.length > 0 || !!query.fir

        const viewModel = hasValidInput
          ? await buildWeatherViewModel({
              weatherMcp: context.weatherMcp,
              icaos: query.icaos,
              fir: query.fir,
              locale: req.locale,
            })
          : null

        const html = context.views.render(req, {
          fragment: 'pages/weather.njk',
          locals: {
            title: t.translate('weather.title'),
            subtitle: t.translate('weather.subtitle'),
            activeNav: 'weather',
            icon: 'cloud',
            query,
            viewModel,
          },
        })
        return reply.type('text/html; charset=utf-8').send(html)
      })
    }
  },
}
