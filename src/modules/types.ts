import type { FastifyPluginCallback } from 'fastify'

import type { PoolFacade } from '../platform/db/pool.js'
import type { IdentityStores } from '../platform/identity/types.js'
import type { ModuleId } from '../platform/i18n/segments.js'
import type { EmbeddingProvider } from '../platform/retrieval/types.js'
import type { WeatherMcpClient } from '../platform/weather-mcp/types.js'
import type { AppConfig } from '../server/config.js'
import type { ViewRenderer } from '../server/views/views.js'

/**
 * Services every feature module receives when it is registered. Modules attach
 * their routes/views/services to the application from these plus the decorated
 * request context (`req.locale`, `req.pilot`, `app.views`, …).
 */
export interface ModuleContext {
  config: AppConfig
  pool: PoolFacade
  stores: IdentityStores
  views: ViewRenderer
  /** Embedding provider selected from configuration (mock by default). */
  embeddings: EmbeddingProvider
  /** Client for the aviation-weather MCP server (METAR/TAF/NOTAM/SIGMET/decode). */
  weatherMcp: WeatherMcpClient
}

/**
 * The module registration contract: one entry point per feature domain. The
 * registry composes the application solely by invoking these `register`
 * callbacks, and the shell navigation derives from the same registered list.
 */
export interface FeatureModule {
  id: ModuleId
  /** Catalog key for the localized navigation label. */
  labelKey: string
  /** Icon name from the shared icons partial. */
  icon: string
  /** Navigation order (ascending; dashboard first). */
  order: number
  /** Attach the module's routes, views, and services to the application. */
  register: FastifyPluginCallback<ModuleContext>
}
