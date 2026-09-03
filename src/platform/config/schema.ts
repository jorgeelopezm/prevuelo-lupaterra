import { z } from 'zod'

/**
 * Shared validated configuration schema. Every runtime that boots from
 * environment variables — the web application and the standalone MCP server —
 * validates through this single schema so field constraints and provider
 * credential rules cannot drift apart. Field definitions are exported so the
 * web schema (`configSchema`) and the MCP subset (`mcpConfigSchema`) compose
 * from the same pieces.
 */

export const APP_ENVIRONMENTS = ['development', 'test', 'production'] as const

// Runtime environment and server binding.
const nodeEnvField = z.enum(['development', 'test', 'production']).default('development')
const hostField = z.string().default('0.0.0.0')
const portField = z.coerce.number().int().min(1).max(65535).default(3000)
const publicUrlField = z.string().url().default('http://localhost:3000')

// Data and identity (web application only).
const databaseUrlField = z.string().min(1, 'DATABASE_URL must not be empty')
const sessionSecretField = z.string().min(32, 'SESSION_SECRET must be at least 32 characters')
const sessionTtlHoursField = z.coerce.number().int().positive().default(168)
const authMaxFailedAttemptsField = z.coerce.number().int().positive().default(5)
const authFailureWindowMinutesField = z.coerce.number().int().positive().default(15)

// Embedding provider (retrieval seam).
const embeddingProviderField = z.enum(['mock', 'openai', 'local']).default('mock')
const embeddingDimensionsField = z.coerce.number().int().positive().default(768)
const embeddingApiKeyField = z.string().optional()

// Weather provider (MCP / weather seam).
const weatherProviderField = z.enum(['mock', 'aemet', 'ipma', 'ead', 'avwx']).default('mock')
const aemetOpenDataApiKeyField = z.string().optional()
const ipmaApiKeyField = z.string().optional()
const eadApiKeyField = z.string().optional()
/** AVWX bearer token (https://account.avwx.rest) — the only real provider implemented so far. */
const avwxApiTokenField = z.string().optional()

// MCP server transport and behavior.
const mcpTransportField = z.enum(['stdio', 'http']).default('stdio')
const mcpPortField = z.coerce.number().int().min(1).max(65535).default(3001)
const mcpCacheTtlSecondsField = z.coerce.number().int().nonnegative().default(60)
const mcpRateLimitPerMinuteField = z.coerce.number().int().positive().default(30)
const mcpProviderTimeoutMsField = z.coerce.number().int().positive().default(5000)

// Web application's MCP *client* connection to the aviation-weather server
// (distinct from MCP_TRANSPORT/MCP_PORT above, which configure the server).
const weatherMcpTransportField = z.enum(['stdio', 'http']).default('stdio')
const weatherMcpUrlField = z.string().url().optional()
const weatherMcpTimeoutMsField = z.coerce.number().int().positive().default(8000)

// Logging.
const logLevelField = z
  .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
  .default('info')

/** A non-mock embedding provider must carry its credential. */
export function embeddingProviderRefine(data: Record<string, unknown>, ctx: z.RefinementCtx): void {
  if (data.EMBEDDING_PROVIDER !== 'mock' && !data.EMBEDDING_API_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['EMBEDDING_PROVIDER'],
      message: `EMBEDDING_PROVIDER '${String(data.EMBEDDING_PROVIDER)}' requires EMBEDDING_API_KEY to be set`,
    })
  }
}

/** Credential variable each non-mock weather provider requires. */
const WEATHER_PROVIDER_CREDENTIAL: Record<string, string> = {
  aemet: 'AEMET_OPENDATA_API_KEY',
  ipma: 'IPMA_API_KEY',
  ead: 'EAD_API_KEY',
  avwx: 'AVWX_API_TOKEN',
}

/** A non-mock weather provider must carry its own credential — not another provider's. */
export function weatherProviderRefine(data: Record<string, unknown>, ctx: z.RefinementCtx): void {
  const provider = String(data.WEATHER_PROVIDER)
  const credentialVar = WEATHER_PROVIDER_CREDENTIAL[provider]
  if (credentialVar && !data[credentialVar]) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['WEATHER_PROVIDER'],
      message: `WEATHER_PROVIDER '${provider}' requires ${credentialVar} to be set`,
    })
  }
}

/** The `http` weather MCP client transport must carry the server's URL. */
export function weatherMcpTransportRefine(
  data: Record<string, unknown>,
  ctx: z.RefinementCtx,
): void {
  if (data.WEATHER_MCP_TRANSPORT === 'http' && !data.WEATHER_MCP_URL) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['WEATHER_MCP_URL'],
      message: "WEATHER_MCP_TRANSPORT 'http' requires WEATHER_MCP_URL to be set",
    })
  }
}

/** Full web application schema: every variable the bootstrap consumes. */
export const configSchema = z
  .object({
    NODE_ENV: nodeEnvField,
    HOST: hostField,
    PORT: portField,
    PUBLIC_URL: publicUrlField,
    DATABASE_URL: databaseUrlField,
    SESSION_SECRET: sessionSecretField,
    SESSION_TTL_HOURS: sessionTtlHoursField,
    AUTH_MAX_FAILED_ATTEMPTS: authMaxFailedAttemptsField,
    AUTH_FAILURE_WINDOW_MINUTES: authFailureWindowMinutesField,
    EMBEDDING_PROVIDER: embeddingProviderField,
    EMBEDDING_DIMENSIONS: embeddingDimensionsField,
    EMBEDDING_API_KEY: embeddingApiKeyField,
    WEATHER_PROVIDER: weatherProviderField,
    AEMET_OPENDATA_API_KEY: aemetOpenDataApiKeyField,
    IPMA_API_KEY: ipmaApiKeyField,
    EAD_API_KEY: eadApiKeyField,
    AVWX_API_TOKEN: avwxApiTokenField,
    MCP_TRANSPORT: mcpTransportField,
    MCP_PORT: mcpPortField,
    MCP_CACHE_TTL_SECONDS: mcpCacheTtlSecondsField,
    MCP_RATE_LIMIT_PER_MINUTE: mcpRateLimitPerMinuteField,
    MCP_PROVIDER_TIMEOUT_MS: mcpProviderTimeoutMsField,
    WEATHER_MCP_TRANSPORT: weatherMcpTransportField,
    WEATHER_MCP_URL: weatherMcpUrlField,
    WEATHER_MCP_TIMEOUT_MS: weatherMcpTimeoutMsField,
    LOG_LEVEL: logLevelField,
  })
  .superRefine(embeddingProviderRefine)
  .superRefine(weatherProviderRefine)
  .superRefine(weatherMcpTransportRefine)

export type AppConfig = z.infer<typeof configSchema>

/**
 * MCP server subset of the shared schema: the standalone server validates
 * through the same field definitions as the web application, but does not
 * require the web-only variables (`DATABASE_URL`, `SESSION_SECRET`, …).
 */
export const mcpConfigSchema = z
  .object({
    NODE_ENV: nodeEnvField,
    HOST: hostField,
    WEATHER_PROVIDER: weatherProviderField,
    AEMET_OPENDATA_API_KEY: aemetOpenDataApiKeyField,
    IPMA_API_KEY: ipmaApiKeyField,
    EAD_API_KEY: eadApiKeyField,
    AVWX_API_TOKEN: avwxApiTokenField,
    MCP_TRANSPORT: mcpTransportField,
    MCP_PORT: mcpPortField,
    MCP_CACHE_TTL_SECONDS: mcpCacheTtlSecondsField,
    MCP_RATE_LIMIT_PER_MINUTE: mcpRateLimitPerMinuteField,
    MCP_PROVIDER_TIMEOUT_MS: mcpProviderTimeoutMsField,
    LOG_LEVEL: logLevelField,
  })
  .superRefine(weatherProviderRefine)

export type McpConfig = z.infer<typeof mcpConfigSchema>

/**
 * Error thrown when configuration fails to validate. Carries a human-readable,
 * secret-free summary that names the offending variable(s) and the constraint
 * they violated. The offending value is never echoed.
 */
export class ConfigError extends Error {
  readonly issues: readonly z.ZodIssue[]

  constructor(issues: readonly z.ZodIssue[]) {
    const detail = issues.map((issue) => `- ${issue.path.join('.')}: ${issue.message}`).join('\n')
    super(`Invalid configuration:\n${detail}`)
    this.name = 'ConfigError'
    this.issues = issues
  }
}

/**
 * Load and validate the full web application configuration from an environment
 * object (defaults to `process.env`). Throws {@link ConfigError} on any missing
 * or malformed value.
 */
export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const result = configSchema.safeParse(env)
  if (!result.success) {
    throw new ConfigError(result.error.issues)
  }
  return result.data
}

/**
 * Load and validate the MCP server configuration from an environment object
 * (defaults to `process.env`) through the shared validated schema. Throws
 * {@link ConfigError} on any missing or malformed value.
 */
export function loadMcpConfig(env: Record<string, string | undefined> = process.env): McpConfig {
  const result = mcpConfigSchema.safeParse(env)
  if (!result.success) {
    throw new ConfigError(result.error.issues)
  }
  return result.data
}
