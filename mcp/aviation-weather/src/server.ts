import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

import { ResponseCache } from './cache.js'
import { resolveNotamProvider, type McpConfig } from './config.js'
import { createProviders } from './provider/create.js'
import type { WeatherProvider } from './provider/types.js'
import { RateLimiter } from './rate-limit.js'
import { registerWeatherTools } from './tools/registry.js'
import { WeatherToolService } from './tools/service.js'

export interface BuiltWeatherServer {
  server: McpServer
  provider: WeatherProvider
  /** Serves NOTAMs; the same instance as `provider` unless NOTAM_PROVIDER names another. */
  notamProvider: WeatherProvider
  service: WeatherToolService
  cache: ResponseCache
  rateLimiter: RateLimiter
}

/**
 * Assemble the MCP server from validated configuration: provider selection,
 * response cache, per-provider rate limiter, the tool service, and the five
 * registered tools. Provider selection happens here, so a non-mock provider
 * without its credential aborts startup before any transport starts.
 */
export function buildWeatherServer(config: McpConfig): BuiltWeatherServer {
  const { weather: provider, notams: notamProvider } = createProviders({
    provider: config.WEATHER_PROVIDER,
    notamProvider: resolveNotamProvider(config),
    aemetApiKey: config.AEMET_OPENDATA_API_KEY,
    avwxApiToken: config.AVWX_API_TOKEN,
  })
  const cache = new ResponseCache(config.MCP_CACHE_TTL_SECONDS * 1000)
  const rateLimiter = new RateLimiter(config.MCP_RATE_LIMIT_PER_MINUTE)
  const service = new WeatherToolService({
    provider,
    notamProvider,
    cache,
    rateLimiter,
    timeoutMs: config.MCP_PROVIDER_TIMEOUT_MS,
  })
  const server = new McpServer(
    { name: 'ga-aviation-weather', version: '0.1.0' },
    { capabilities: { tools: {} } },
  )
  registerWeatherTools(server, { service })
  return { server, provider, notamProvider, service, cache, rateLimiter }
}
