export { ConfigError, loadMcpConfig as loadConfig } from '../../../src/platform/config/schema.js'
export type { McpConfig } from '../../../src/platform/config/schema.js'

/**
 * MCP server configuration is loaded through the shared validated schema
 * (`src/platform/config/schema.ts`), so the standalone server applies the same
 * field constraints and provider credential rules as the web application.
 * `loadConfig` is an alias of `loadMcpConfig`; `McpConfig` is its inferred
 * output type.
 */
