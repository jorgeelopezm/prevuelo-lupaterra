import { loadMcpConfig, type McpConfig } from '../../../src/platform/config/schema.js'

export { ConfigError, resolveNotamProvider } from '../../../src/platform/config/schema.js'
export type { McpConfig } from '../../../src/platform/config/schema.js'

/**
 * MCP server configuration is loaded through the shared validated schema
 * (`src/platform/config/schema.ts`), so the standalone server applies the same
 * field constraints and provider credential rules as the web application.
 *
 * One MCP-only addition on top of `loadMcpConfig`: a platform runtime service
 * (antel-infra's `RuntimeServiceDropIn`, D71) injects the process's assigned
 * loopback port as `PORT`, not this server's own `MCP_PORT`. When `MCP_PORT`
 * is not set explicitly, `PORT` is used in its place before validation, so
 * this server can be deployed as a platform runtime service — routed or, as
 * task 5.12a does, unrouted and loopback-only — with no extra configuration
 * on the platform side. An explicit `MCP_PORT` always wins.
 */
export function loadConfig(env: Record<string, string | undefined> = process.env): McpConfig {
  const merged =
    env.MCP_PORT === undefined && env.PORT !== undefined ? { ...env, MCP_PORT: env.PORT } : env
  return loadMcpConfig(merged)
}
