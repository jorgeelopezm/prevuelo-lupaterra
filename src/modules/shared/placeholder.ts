import type { FastifyInstance } from 'fastify'

import { createTranslator } from '../../platform/i18n/catalog.js'
import { SUPPORTED_LOCALES } from '../../platform/i18n/locale.js'
import { destinationPath, type ModuleId } from '../../platform/i18n/segments.js'
import type { ModuleContext } from '../types.js'

export interface PlaceholderScreenOptions {
  id: ModuleId
  labelKey: string
  icon: string
}

/**
 * Shared placeholder screen (task 7.4): every module renders the same localized
 * "not yet available" partial inside the shell, with its unavailability stated
 * in text and no operational-looking values. The partial doubles as the htmx
 * fragment target.
 */
export function registerPlaceholderScreen(
  app: FastifyInstance,
  options: PlaceholderScreenOptions,
  context: ModuleContext,
): void {
  const { id, labelKey, icon } = options
  for (const locale of SUPPORTED_LOCALES) {
    app.get(destinationPath(id, locale), async (req, reply) => {
      const t = createTranslator({ locale: req.locale })
      const html = context.views.render(req, {
        fragment: 'pages/placeholder.njk',
        locals: {
          title: t.translate(labelKey),
          subtitle: t.translate('shell.placeholder_title'),
          activeNav: id,
          icon,
          placeholderTitle: t.translate('shell.placeholder_title'),
          placeholderMessage: t.translate('shell.placeholder_message'),
        },
      })
      return reply.type('text/html; charset=utf-8').send(html)
    })
  }
}
