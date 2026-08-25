import Fastify, { LogController } from 'fastify'
import type { FastifyInstance, FastifyPluginAsync, FastifyRequest } from 'fastify'
import type { Logger } from 'pino'

import type { AppConfig } from './config.js'
import type { SupportedLocale } from '../platform/i18n/locale.js'
import type { PoolFacade } from '../platform/db/pool.js'
import { createPool } from '../platform/db/pool.js'
import { resolveLocaleFromUrl } from './locales.js'
import { createLogger, resolveCorrelationId } from './logger.js'
import { createDatabaseHealthProbe } from '../platform/dbHealth.js'
import { healthPlugin } from './routes/health.js'
import { localeRoutingPlugin } from './locale-routes.js'
import { authPlugin } from './auth/auth-plugin.js'
import { createSqlIdentityStores } from '../platform/identity/identity-service.js'
import { viewsPlugin } from './views/plugin.js'
import { createViewRenderer } from './views/views.js'
import { registerModules, ALL_MODULES } from '../modules/registry.js'
import type { FeatureModule } from '../modules/types.js'
import { createEmbeddingProvider } from '../platform/retrieval/embeddings.js'
import { staticAssetsPlugin } from './static.js'

export interface BuildAppOptions {
  config: AppConfig
  /**
   * Override the request logger. Tests inject a capturing pino instance here;
   * when omitted the app builds one from the configured log level with the
   * standard cookie/credential redaction applied.
   */
  logger?: Logger
  /**
   * Shared database pool. Tests inject a fake; when omitted the app creates a
   * real pool from DATABASE_URL and closes it on shutdown.
   */
  pool?: PoolFacade
  /** Override the database readiness probe (defaults to a real pg probe). */
  checkDatabase?: () => Promise<boolean>
  /** Resolve the authenticated pilot's stored locale preference; defaults to
   * reading the session pilot set by the auth plugin. */
  resolveStoredLocale?: (req: FastifyRequest) => Promise<SupportedLocale | null>
  /**
   * Feature modules to compose (defaults to all six). The shell navigation
   * derives from exactly this list, so a module left out has no routes and no
   * sidebar entry.
   */
  modules?: readonly FeatureModule[]
  /** Additional Fastify plugins to compose (test-only seams, extensions). */
  plugins?: FastifyPluginAsync[]
}

/**
 * Compose the Fastify application: a structured logger with redaction,
 * per-request correlation ids propagated and echoed, one log record per
 * request, session authentication + CSRF, locale-first routing, the view layer
 * with localized error pages, feature modules composed solely by invoking their
 * registrations, health endpoints, and any registered plugins.
 */
export async function buildApp(opts: BuildAppOptions): Promise<FastifyInstance> {
  const logger = opts.logger ?? createLogger({ level: opts.config.LOG_LEVEL })
  const pool = opts.pool ?? createPool(opts.config.DATABASE_URL)
  const modules = opts.modules ?? ALL_MODULES
  const views = createViewRenderer(modules)
  const stores = createSqlIdentityStores(pool)
  // Provider selection is part of startup: a non-mock provider without its
  // credential aborts here (config validation already guards earlier), and
  // only the mock provider is constructible in this change.
  const embeddings = createEmbeddingProvider({
    provider: opts.config.EMBEDDING_PROVIDER,
    dimensions: opts.config.EMBEDDING_DIMENSIONS,
    apiKey: opts.config.EMBEDDING_API_KEY,
  })
  logger.info({ embeddingProvider: opts.config.EMBEDDING_PROVIDER }, 'selected embedding provider')
  logger.info({ weatherProvider: opts.config.WEATHER_PROVIDER }, 'selected weather provider')

  const app = Fastify({
    loggerInstance: logger,
    genReqId: (req) => resolveCorrelationId(req.headers['x-correlation-id']),
    logController: new LogController({ disableRequestLogging: true }),
  }) as unknown as FastifyInstance

  // Echo the correlation id back to the caller on every response.
  app.addHook('onRequest', async (req, reply) => {
    reply.header('x-correlation-id', String(req.id))
  })

  // One structured record per request: method, route, status, duration, locale,
  // and correlation id. Emission is hand-picked so raw cookie/credential headers
  // can never be written to output (redaction is defense in depth).
  app.addHook('onResponse', async (req, reply) => {
    req.log.info({
      type: 'request',
      method: req.method,
      route: req.routeOptions?.url ?? req.url,
      status: reply.statusCode,
      durationMs: reply.elapsedTime,
      locale: resolveLocaleFromUrl(req.url),
      correlationId: req.id,
    })
  })

  await app.register(authPlugin, {
    stores,
    secret: opts.config.SESSION_SECRET,
    sessionTtlHours: opts.config.SESSION_TTL_HOURS,
    cookieSecure: opts.config.PUBLIC_URL.startsWith('https://'),
    rateLimit: {
      limit: opts.config.AUTH_MAX_FAILED_ATTEMPTS,
      windowMs: opts.config.AUTH_FAILURE_WINDOW_MINUTES * 60_000,
    },
  })

  await app.register(localeRoutingPlugin, {
    resolveStoredLocale:
      opts.resolveStoredLocale ??
      (async (req) => (req.pilot ? (req.pilot.locale as SupportedLocale) : null)),
  })

  await app.register(viewsPlugin, { environment: opts.config.NODE_ENV, views })
  await registerModules(app, { config: opts.config, pool, stores, views, embeddings }, modules)
  await app.register(staticAssetsPlugin)

  await app.register(healthPlugin, {
    checkDatabase: opts.checkDatabase ?? createDatabaseHealthProbe(opts.config.DATABASE_URL),
  })

  for (const plugin of opts.plugins ?? []) {
    await app.register(plugin)
  }

  app.addHook('onClose', async () => {
    if (!opts.pool) await pool.end()
  })

  return app
}
