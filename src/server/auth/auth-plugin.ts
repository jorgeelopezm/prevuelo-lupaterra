import fp from 'fastify-plugin'
import fastifyCookie from '@fastify/cookie'
import fastifyFormbody from '@fastify/formbody'
import type { FastifyPluginCallback, FastifyReply, FastifyRequest } from 'fastify'

import { createTranslator } from '../../platform/i18n/catalog.js'
import { isSupportedLocale } from '../../platform/i18n/locale.js'
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
import { renderRegisterPage, renderSignInPage } from './pages.js'

declare module 'fastify' {
  interface FastifyRequest {
    /** Resolved from the session cookie; `null` when anonymous. */
    pilot: PilotRecord | null
    sessionToken: string | null
    isAuthenticated: boolean
    /** CSRF token bound to the current session (or anonymous nonce). */
    csrfToken: string
  }
}

export const SESSION_COOKIE = 'ga_session'
export const CSRF_NONCE_COOKIE = 'ga_csrf_nonce'

export interface AuthPluginOptions {
  stores: IdentityStores
  secret: string
  sessionTtlHours: number
  /** `Secure` flag for cookies when served over HTTPS. */
  cookieSecure: boolean
  rateLimit: { limit: number; windowMs: number }
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

export const authPlugin: FastifyPluginCallback<AuthPluginOptions> = fp<AuthPluginOptions>(
  async (app, opts) => {
    await app.register(fastifyCookie)
    await app.register(fastifyFormbody)

    app.decorateRequest('pilot', null)
    app.decorateRequest('sessionToken', null)
    app.decorateRequest('isAuthenticated', false)
    app.decorateRequest('csrfToken', '')

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

    // Every state-changing request must carry a CSRF token bound to the current
    // session; absence, malformation, or a token from another session → 403 with
    // no state change. Runs at `preValidation`: the body has been parsed by then.
    app.addHook('preValidation', async (req, reply) => {
      if (req.method !== 'POST') return
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

    app.get('/:locale/auth/sign-in', async (req, reply) => {
      const locale = localeOf(req)
      const t = createTranslator({ locale })
      if (req.isAuthenticated) return reply.redirect(`/${locale}`, 302)
      const next = safeReturnPath((req.query as { next?: string }).next)
      return reply.type('text/html; charset=utf-8').send(
        renderSignInPage({
          t,
          csrfToken: req.csrfToken,
          next: next ?? undefined,
        }),
      )
    })

    app.post('/:locale/auth/sign-in', async (req, reply) => {
      const locale = localeOf(req)
      const t = createTranslator({ locale })
      const body = (req.body ?? {}) as Record<string, string>
      const email = (body.email ?? '').trim()
      const password = body.password ?? ''
      const next = safeReturnPath(body.next)

      const renderError = (message: string, statusCode: number) =>
        reply
          .code(statusCode)
          .type('text/html; charset=utf-8')
          .send(
            renderSignInPage({
              t,
              csrfToken: req.csrfToken,
              next: next ?? undefined,
              error: message,
              values: { email },
            }),
          )

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

    app.get('/:locale/auth/register', async (req, reply) => {
      const locale = localeOf(req)
      const t = createTranslator({ locale })
      if (req.isAuthenticated) return reply.redirect(`/${locale}`, 302)
      const next = safeReturnPath((req.query as { next?: string }).next)
      return reply.type('text/html; charset=utf-8').send(
        renderRegisterPage({
          t,
          csrfToken: req.csrfToken,
          next: next ?? undefined,
        }),
      )
    })

    app.post('/:locale/auth/register', async (req, reply) => {
      const locale = localeOf(req)
      const t = createTranslator({ locale })
      const body = (req.body ?? {}) as Record<string, string>
      const email = (body.email ?? '').trim()
      const displayName = (body.displayName ?? '').trim()
      const password = body.password ?? ''
      const next = safeReturnPath(body.next)

      if (!email || !displayName || password.length < 8) {
        return reply
          .code(400)
          .type('text/html; charset=utf-8')
          .send(
            renderRegisterPage({
              t,
              csrfToken: req.csrfToken,
              next: next ?? undefined,
              error: t.translate('auth.invalid_credentials'),
              values: { email, displayName },
            }),
          )
      }

      const result = await registerPilot(opts.stores, {
        email,
        displayName,
        locale,
        password,
      })
      if (!result.ok) {
        return reply
          .code(409)
          .type('text/html; charset=utf-8')
          .send(
            renderRegisterPage({
              t,
              csrfToken: req.csrfToken,
              next: next ?? undefined,
              error: t.translate('auth.duplicate_email'),
              values: { email, displayName },
            }),
          )
      }

      const { token } = await openSession(opts.stores, result.pilot, opts.sessionTtlHours)
      reply.setCookie(
        SESSION_COOKIE,
        token,
        cookieAttributes(opts.cookieSecure, opts.sessionTtlHours * 3600),
      )
      return reply.redirect(next ?? `/${locale}`, 302)
    })

    app.post('/:locale/auth/sign-out', async (req, reply) => {
      const locale = localeOf(req)
      if (req.sessionToken) {
        await destroySession(opts.stores, req.sessionToken)
        reply.clearCookie(SESSION_COOKIE, cookieAttributes(opts.cookieSecure))
      }
      return reply.redirect(`/${locale}`, 302)
    })
  },
)
