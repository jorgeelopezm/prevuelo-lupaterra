import fp from 'fastify-plugin'

import type { FastifyPluginCallback, FastifyRequest } from 'fastify'

import { PUBLIC_ROUTE } from './auth/auth-plugin.js'

import {
  firstPathSegment,
  isSupportedLocale,
  resolveLocale,
  type SupportedLocale,
} from '../platform/i18n/locale.js'

declare module 'fastify' {
  interface FastifyRequest {
    /** The effective locale for this request, resolved by the routing plugin. */
    locale: SupportedLocale
  }
}

export interface LocaleRoutingOptions {
  /** Look up the authenticated pilot's stored locale preference (the identity
   * plugin sets `req.pilot`); `null` for anonymous visitors. */
  resolveStoredLocale?: (req: FastifyRequest) => Promise<SupportedLocale | null>
}

/**
 * Locale-first routing:
 *  - `/` redirects to the resolved locale's home route,
 *  - the active locale is attached to every request for templates/logging,
 *  - the localized 404 page is provided by the views plugin (registered after).
 */
export const localeRoutingPlugin: FastifyPluginCallback<LocaleRoutingOptions> =
  fp<LocaleRoutingOptions>(async (app, opts) => {
    app.decorateRequest('locale', 'es' as SupportedLocale)

    app.addHook('onRequest', async (req) => {
      const segment = firstPathSegment(req.url)
      req.locale = isSupportedLocale(segment)
        ? (segment as SupportedLocale)
        : resolveLocale({
            acceptLanguage: req.headers['accept-language'] as string | undefined,
          })
    })

    // Public: it only redirects, and the locale root it targets is walled.
    app.get('/', PUBLIC_ROUTE, async (req, reply) => {
      const storedLocale = (await opts?.resolveStoredLocale?.(req)) ?? null
      const locale = resolveLocale({
        storedLocale,
        acceptLanguage: req.headers['accept-language'] as string | undefined,
      })
      return reply.redirect(`/${locale}`, 302)
    })
  })
