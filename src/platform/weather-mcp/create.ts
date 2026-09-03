import { McpWeatherClient } from './client.js'
import type { WeatherMcpClient } from './types.js'

export interface WeatherMcpConfig {
  transport: 'stdio' | 'http'
  url?: string
  timeoutMs: number
}

/**
 * Construct the weather MCP client from configuration. Mirrors
 * `createEmbeddingProvider`'s shape: a single factory feature modules never
 * call directly, invoked once at app bootstrap. Unlike the embedding
 * provider, this client's connection is lazy (see `McpWeatherClient`), so
 * construction itself never spawns a process or opens a socket.
 */
export function createWeatherMcpClient(config: WeatherMcpConfig): WeatherMcpClient {
  if (config.transport === 'http' && !config.url) {
    throw new Error('WEATHER_MCP_URL is required when WEATHER_MCP_TRANSPORT is "http"')
  }
  return new McpWeatherClient(config)
}
