import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

import { ResponseCache } from './cache.js'
import type { McpConfig } from './config.js'
import { createWeatherProvider } from './provider/create.js'
import type { WeatherProvider } from './provider/types.js'
import { RateLimiter } from './rate-limit.js'
import { registerWeatherTools } from './tools/registry.js'
import { WeatherToolService } from './tools/service.js'

export interface BuiltWeatherServer {
  server: McpServer
  provider: WeatherProvider
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
  const provider = createWeatherProvider({
    provider: config.WEATHER_PROVIDER,
    aemetApiKey: config.AEMET_OPENDATA_API_KEY,
    avwxApiToken: config.AVWX_API_TOKEN,
  })
  const cache = new ResponseCache(config.MCP_CACHE_TTL_SECONDS * 1000)
  const rateLimiter = new RateLimiter(config.MCP_RATE_LIMIT_PER_MINUTE)
  const service = new WeatherToolService({
    provider,
    cache,
    rateLimiter,
    timeoutMs: config.MCP_PROVIDER_TIMEOUT_MS,
  })
  const server = new McpServer(
    { name: 'ga-aviation-weather', version: '0.1.0' },
    { capabilities: { tools: {} } },
  )
  registerWeatherTools(server, { service })
  return { server, provider, service, cache, rateLimiter }
}
