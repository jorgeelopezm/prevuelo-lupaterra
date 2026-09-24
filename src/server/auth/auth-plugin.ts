import fp from 'fastify-plugin'
import fastifyCookie from '@fastify/cookie'
import fastifyFormbody from '@fastify/formbody'
import type { FastifyPluginCallback, FastifyReply, FastifyRequest } from 'fastify'

import { createTranslator } from '../../platform/i18n/catalog.js'
import {
  firstPathSegment,
  isSupportedLocale,
  resolveLocale,
  SUPPORTED_LOCALES,
} from '../../platform/i18n/locale.js'
import type { SupportedLocale } from '../../platform/i18n/locale.js'
import { createCsrfToken, verifyCsrfToken } from '../../platform/identity/csrf.js'
import {
  destroySession,
  openSession,
  registerPilot,
  resolveSessionToken,
  signInPilot,
} from '../../platform/identity/identity-service.js'
import { SlidingWindowRateLimiter } from '../../platform/identity/rate-limit.js'
import { createOpaqueToken } from '../../platform/identity/tokens.js'
import type { IdentityStores, PilotRecord } from '../../platform/identity/types.js'

declare module 'fastify' {
  interface FastifyRequest {
    /** Resolved from the session cookie; `null` when anonymous. */
    pilot: PilotRecord | null
    sessionToken: string | null
    isAuthenticated: boolean
    /** CSRF token bound to the current session (or anonymous nonce). */
    csrfToken: string
  }

  interface FastifyContextConfig {
    /**
     * Marks a route reachable without a session. Every route without it sits
     * behind the wall (identity-access: "Route protection").
     */
    public?: boolean
  }

  interface FastifyInstance {
    /** Every registered route with its public flag, recorded as routes are
     * added. The deny-by-default eval enumerates it. */
    routeInventory: RouteInventoryEntry[]
  }
}

export interface RouteInventoryEntry {
  method: string
  url: string
  public: boolean
}

export const SESSION_COOKIE = 'ga_session'
export const CSRF_NONCE_COOKIE = 'ga_csrf_nonce'

/** Route options for a route reachable without a session. */
export const PUBLIC_ROUTE = { config: { public: true } }

export interface AuthPluginOptions {
  stores: IdentityStores
  secret: string
  sessionTtlHours: number
  /** `Secure` flag for cookies when served over HTTPS. */
  cookieSecure: boolean
  rateLimit: { limit: number; windowMs: number }
  /** Public self-registration switch (`REGISTRATION_ENABLED`). While off, the
   * registration routes stay wired but create no account. */
  registrationEnabled: boolean
}

function cookieAttributes(secure: boolean, maxAgeSeconds?: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure,
    path: '/',
    ...(maxAgeSeconds ? { maxAge: maxAgeSeconds } : {}),
  }
}

/** Only same-origin, single-slash relative paths survive as redirect targets. */
export function safeReturnPath(next: unknown): string | null {
  if (typeof next !== 'string' || next.length === 0) return null
  if (!next.startsWith('/') || next.startsWith('//')) return null
  return next
}

/**
 * The request's locale for auth redirects. The wall runs before the locale
 * routing plugin sets `req.locale`, so it applies the same rule here: the first
 * path segment when it is a supported locale, otherwise the negotiated one.
 */
function requestLocale(req: FastifyRequest): SupportedLocale {
  const segment = firstPathSegment(req.url)
  return isSupportedLocale(segment)
    ? (segment as SupportedLocale)
    : resolveLocale({ acceptLanguage: req.headers['accept-language'] as string | undefined })
}

/** Sign-in URL in the request's locale, carrying the requested path and query
 * as the return target. */
export function signInUrlFor(req: FastifyRequest): string {
  return `/${requestLocale(req)}/auth/sign-in?next=${encodeURIComponent(req.url)}`
}

/**
 * Route-protection hook: redirects anonymous visitors to sign-in preserving the
 * requested path; fragment requests get an htmx `HX-Redirect` instruction.
 */
export function createRequireAuthHook(buildSignInUrl: (req: FastifyRequest) => string) {
  return async (req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply | void> => {
    if (req.isAuthenticated) return
    const target = buildSignInUrl(req)
    if (req.headers['hx-request'] === 'true') {
      return reply.code(401).header('HX-Redirect', target).send()
    }
    return reply.redirect(target, 302)
  }
}

interface AuthScreenInput {
  error?: string
  values?: { email?: string; displayName?: string }
}

export const authPlugin: FastifyPluginCallback<AuthPluginOptions> = fp<AuthPluginOptions>(
  async (app, opts) => {
    await app.register(fastifyCookie)
    await app.register(fastifyFormbody)

    app.decorateRequest('pilot', null)
    app.decorateRequest('sessionToken', null)
    app.decorateRequest('isAuthenticated', false)
    app.decorateRequest('csrfToken', '')

    // Route inventory: registered first so every later route is recorded,
    // including the auth routes below and routes from other plugins.
    // `public` is read when the entry is read, not when the route is added.
    // An encapsulated scope's own onRoute hook (the static assets) runs after
    // this root hook and marks its routes public then.
    const routeInventory: RouteInventoryEntry[] = []
    app.decorate('routeInventory', routeInventory)
    app.addHook('onRoute', (route) => {
      const methods = Array.isArray(route.method) ? route.method : [route.method]
      for (const method of methods) {
        routeInventory.push({
          method,
          url: route.url,
          get public() {
            return route.config?.public === true
          },
        })
      }
    })

    // Resolve the session cookie into the request and set the per-request CSRF
    // identity (session token for authenticated visitors, a nonce cookie for
    // anonymous ones).
    app.addHook('onRequest', async (req, reply) => {
      const cookieToken = req.cookies[SESSION_COOKIE]
      if (cookieToken) {
        const resolved = await resolveSessionToken(opts.stores, cookieToken)
        if (resolved) {
          req.sessionToken = cookieToken
          req.pilot = resolved.pilot
          req.isAuthenticated = true
        } else {
          reply.clearCookie(SESSION_COOKIE, cookieAttributes(opts.cookieSecure))
        }
      }

      const nonce = req.cookies[CSRF_NONCE_COOKIE] ?? createOpaqueToken()
      req.csrfToken = createCsrfToken(opts.secret, req.sessionToken ?? nonce)
      if (!req.cookies[CSRF_NONCE_COOKIE]) {
        reply.setCookie(
          CSRF_NONCE_COOKIE,
          nonce,
          cookieAttributes(opts.cookieSecure, 60 * 60 * 24 * 30),
        )
      }
    })

    // The wall is deny-by-default. Every matched route needs a session unless
    // it declares `config.public`. Unmatched paths fall through to the 404
    // handler, which reveals nothing. This hook comes after session resolution,
    // so `req.isAuthenticated` is settled. It also runs before body parsing and
    // CSRF, so an anonymous POST is redirected rather than refused.
    const requireAuth = createRequireAuthHook(signInUrlFor)
    app.addHook('onRequest', async (req, reply) => {
      if (req.routeOptions.url === undefined) return
      if (req.routeOptions.config?.public === true) return
      return requireAuth(req, reply)
    })

    // Every state-changing request must carry a CSRF token bound to the current
    // session; absence, malformation, or a token from another session → 403 with
    // no state change. Runs at `preValidation`: the body has been parsed by then.
    // Multipart requests (the engine-data file upload) are not body-parsed at
    // this stage — parsing a multipart body is stream-based and only happens
    // once the route handler reads it — so that one route verifies its own
    // `csrfToken` field after parsing, using the same `verifyCsrfToken`.
    app.addHook('preValidation', async (req, reply) => {
      if (req.method !== 'POST') return
      const contentType = req.headers['content-type'] ?? ''
      if (contentType.startsWith('multipart/')) return
      const body = (req.body ?? {}) as Record<string, unknown>
      const token = typeof body.csrfToken === 'string' ? body.csrfToken : ''
      const identity = req.sessionToken ?? req.cookies[CSRF_NONCE_COOKIE] ?? ''
      if (!verifyCsrfToken(opts.secret, identity, token)) {
        return reply.code(403).send({ statusCode: 403, message: 'csrf token missing or invalid' })
      }
    })

    const limiter = new SlidingWindowRateLimiter({
      limit: opts.rateLimit.limit,
      windowMs: opts.rateLimit.windowMs,
    })

    const localeOf = (req: FastifyRequest): SupportedLocale => {
      const segment = (req.params as { locale?: string }).locale
      return isSupportedLocale(segment ?? '') ? (segment as SupportedLocale) : 'es'
    }

    const signInPath = (locale: SupportedLocale) => `/${locale}/auth/sign-in`
    const registerPath = (locale: SupportedLocale) => `/${locale}/auth/register`
    const withNext = (path: string, next: string | null) =>
      next ? `${path}?next=${encodeURIComponent(next)}` : path

    /** Locale links for an auth screen: the same screen in each locale, with
     * the return target kept. */
    const authSwitcherLinks = (
      locale: SupportedLocale,
      pathFor: (l: SupportedLocale) => string,
      next: string | null,
    ) =>
      SUPPORTED_LOCALES.map((code) => ({
        code,
        href: withNext(pathFor(code), next),
        active: code === locale,
      }))

    const sendSignIn = (
      req: FastifyRequest,
      reply: FastifyReply,
      statusCode: number,
      next: string | null,
      input: AuthScreenInput = {},
    ) => {
      const locale = localeOf(req)
      const t = createTranslator({ locale })
      const html = app.views.render(req, {
        layout: 'auth',
        fragment: 'pages/auth-sign-in.njk',
        locals: {
          title: t.translate('auth.sign_in_title'),
          next: next ?? '',
          error: input.error ?? null,
          values: { email: input.values?.email ?? '' },
          action: signInPath(locale),
          registerHref: opts.registrationEnabled ? withNext(registerPath(locale), next) : null,
          authSwitcherLinks: authSwitcherLinks(locale, signInPath, next),
        },
      })
      return reply.code(statusCode).type('text/html; charset=utf-8').send(html)
    }

    const sendRegister = (
      req: FastifyRequest,
      reply: FastifyReply,
      statusCode: number,
      next: string | null,
      input: AuthScreenInput = {},
    ) => {
      const locale = localeOf(req)
      const t = createTranslator({ locale })
      const titleKey = opts.registrationEnabled
        ? 'auth.register_title'
        : 'auth.registration_unavailable_title'
      const html = app.views.render(req, {
        layout: 'auth',
        fragment: 'pages/auth-register.njk',
        locals: {
          title: t.translate(titleKey),
          registrationEnabled: opts.registrationEnabled,
          next: next ?? '',
          error: input.error ?? null,
          values: {
            email: input.values?.email ?? '',
            displayName: input.values?.displayName ?? '',
          },
          action: registerPath(locale),
          signInHref: withNext(signInPath(locale), next),
          authSwitcherLinks: authSwitcherLinks(locale, registerPath, next),
        },
      })
      return reply.code(statusCode).type('text/html; charset=utf-8').send(html)
    }

    app.get('/:locale/auth/sign-in', PUBLIC_ROUTE, async (req, reply) => {
      const locale = localeOf(req)
      if (req.isAuthenticated) return reply.redirect(`/${locale}`, 302)
      const next = safeReturnPath((req.query as { next?: string }).next)
      return sendSignIn(req, reply, 200, next)
    })

    app.post('/:locale/auth/sign-in', PUBLIC_ROUTE, async (req, reply) => {
      const locale = localeOf(req)
      const t = createTranslator({ locale })
      const body = (req.body ?? {}) as Record<string, string>
      const email = (body.email ?? '').trim()
      const password = body.password ?? ''
      const next = safeReturnPath(body.next)

      const renderError = (message: string, statusCode: number) =>
        sendSignIn(req, reply, statusCode, next, { error: message, values: { email } })

      if (!email || !password) {
        return renderError(t.translate('auth.invalid_credentials'), 400)
      }

      const emailKey = email.toLowerCase()
      if (!limiter.tryAcquire(`login:${emailKey}`) || !limiter.tryAcquire(`login:ip:${req.ip}`)) {
        return renderError(t.translate('auth.rate_limited'), 429)
      }

      const result = await signInPilot(opts.stores, email, password)
      if (!result.ok) {
        return renderError(t.translate('auth.invalid_credentials'), 401)
      }

      // Session rotation: the prior session is destroyed so fixation cannot occur.
      if (req.sessionToken) await destroySession(opts.stores, req.sessionToken)
      const { token } = await openSession(opts.stores, result.pilot, opts.sessionTtlHours)
      reply.setCookie(
        SESSION_COOKIE,
        token,
        cookieAttributes(opts.cookieSecure, opts.sessionTtlHours * 3600),
      )
      limiter.reset(`login:${emailKey}`)
      return reply.redirect(next ?? `/${locale}`, 302)
    })

    // Registration stays wired behind `registrationEnabled`. While it is off,
    // the screen says sign-up is unavailable, and a submission is refused
    // before any account work.
    app.get('/:locale/auth/register', PUBLIC_ROUTE, async (req, reply) => {
      const locale = localeOf(req)
      if (req.isAuthenticated) return reply.redirect(`/${locale}`, 302)
      const next = safeReturnPath((req.query as { next?: string }).next)
      return sendRegister(req, reply, 200, next)
    })

    app.post('/:locale/auth/register', PUBLIC_ROUTE, async (req, reply) => {
      const locale = localeOf(req)
      const t = createTranslator({ locale })
      const body = (req.body ?? {}) as Record<string, string>
      const next = safeReturnPath(body.next)

      if (!opts.registrationEnabled) {
        return sendRegister(req, reply, 403, next)
      }

      const email = (body.email ?? '').trim()
      const displayName = (body.displayName ?? '').trim()
      const password = body.password ?? ''

      if (!email || !displayName || password.length < 8) {
        return sendRegister(req, reply, 400, next, {
          error: t.translate('auth.invalid_credentials'),
          values: { email, displayName },
        })
      }

      const result = await registerPilot(opts.stores, {
        email,
        displayName,
        locale,
        password,
      })
      if (!result.ok) {
        return sendRegister(req, reply, 409, next, {
          error: t.translate('auth.duplicate_email'),
          values: { email, displayName },
        })
      }

      const { token } = await openSession(opts.stores, result.pilot, opts.sessionTtlHours)
      reply.setCookie(
        SESSION_COOKIE,
        token,
        cookieAttributes(opts.cookieSecure, opts.sessionTtlHours * 3600),
      )
      return reply.redirect(next ?? `/${locale}`, 302)
    })

    // Public so an expired session can still post it. It lands on sign-in.
    app.post('/:locale/auth/sign-out', PUBLIC_ROUTE, async (req, reply) => {
      const locale = localeOf(req)
      if (req.sessionToken) {
        await destroySession(opts.stores, req.sessionToken)
        reply.clearCookie(SESSION_COOKIE, cookieAttributes(opts.cookieSecure))
      }
      return reply.redirect(signInPath(locale), 302)
    })
  },
)
