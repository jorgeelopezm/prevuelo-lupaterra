import fp from 'fastify-plugin'
import type { FastifyPluginCallback } from 'fastify'

import { createTranslator } from '../../platform/i18n/catalog.js'
import type { ViewRenderer } from './views.js'

declare module 'fastify' {
  interface FastifyInstance {
    /**
     * The shared Nunjucks renderer. Route handlers call
     * `app.views.render(req, { fragment, locals })`; the renderer chooses a
     * bare partial for `HX-Request` fragments or the layout-wrapped page.
     */
    views: ViewRenderer
  }
}

export interface ViewsPluginOptions {
  environment: 'development' | 'test' | 'production'
  /** The renderer built from the registered module list. */
  views: ViewRenderer
}

/**
 * Composes the view layer: decorates the app with the renderer and installs the
 * localized 404 / 500 error pages. Registered after locale routing so the error
 * handlers can rely on `req.locale` being resolved.
 */
export const viewsPlugin: FastifyPluginCallback<ViewsPluginOptions> = fp<ViewsPluginOptions>(
  async (app, opts) => {
    app.decorate('views', opts.views)

    app.setNotFoundHandler(async (req, reply) => {
      const t = createTranslator({ locale: req.locale })
      const html = app.views.render(req, {
        fragment: 'error/404.njk',
        locals: {
          title: t.translate('error.not_found_title'),
          message: t.translate('error.not_found_message'),
          activeNav: null,
        },
      })
      return reply.code(404).type('text/html; charset=utf-8').send(html)
    })

    app.setErrorHandler(async (err, req, reply) => {
      req.log.error({ err }, 'unhandled request error')
      const t = createTranslator({ locale: req.locale })
      const status = reply.statusCode >= 400 ? reply.statusCode : 500
      // Outside production the message helps debugging; in production the body
      // carries only the generic text plus the correlation id — never a stack
      // trace, SQL, or an internal file path.
      const message =
        opts.environment === 'production'
          ? t.translate('error.server_message')
          : `${t.translate('error.server_message')} ${err instanceof Error ? err.message : ''}`
      const html = app.views.render(req, {
        fragment: 'error/500.njk',
        locals: {
          title: t.translate('error.server_title'),
          message,
          correlationId: String(req.id),
          activeNav: null,
        },
      })
      return reply.code(status).type('text/html; charset=utf-8').send(html)
    })
  },
)
