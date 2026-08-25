/**
 * Web application configuration. The validated schema itself — field
 * definitions, provider credential refinements, `ConfigError`, and the loader —
 * lives in `src/platform/config/schema.ts` so the standalone MCP server
 * validates through the same schema. This module re-exports the web-facing
 * surface unchanged.
 */
export {
  APP_ENVIRONMENTS,
  ConfigError,
  configSchema,
  loadConfig,
} from '../platform/config/schema.js'
export type { AppConfig } from '../platform/config/schema.js'
