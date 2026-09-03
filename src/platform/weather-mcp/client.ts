import { fileURLToPath } from 'node:url'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js'

import type {
  DecodedMetar,
  MetarResult,
  NotamResult,
  SigmetResult,
  TafResult,
  WeatherLocale,
  WeatherMcpClient,
  WeatherMcpError,
  WeatherMcpResult,
} from './types.js'

const AVIATION_WEATHER_DIR = fileURLToPath(new URL('../../../mcp/aviation-weather/', import.meta.url))

export interface WeatherMcpClientConfig {
  transport: 'stdio' | 'http'
  /** Required when `transport` is `http`: the MCP server's Streamable HTTP endpoint. */
  url?: string
  /** Per-call request timeout, in milliseconds. */
  timeoutMs: number
}

interface ToolContentResult {
  isError?: boolean
  content?: Array<{ type?: string; text?: string }>
}

function textOf(result: ToolContentResult): string {
  const first = result.content?.[0]
  return first && first.type === 'text' ? (first.text ?? '') : ''
}

/**
 * Map a failed tool call's message text into a structured error kind. The MCP
 * server communicates failures as plain text (see `mcp/aviation-weather/src/tools/service.ts`
 * and `rate-limit.ts`), so this pattern-matches the messages those errors
 * produce rather than relying on a wire-level error code.
 */
export function mapToolErrorMessage(message: string): WeatherMcpError {
  const rateLimit = /Rate limit exceeded for provider '([^']+)'; retry after (\d+)s/.exec(message)
  if (rateLimit) {
    return {
      kind: 'rate_limit',
      provider: rateLimit[1],
      retryAfterSeconds: Number(rateLimit[2]),
      message,
    }
  }

  const timeout = /Provider '([^']+)' timed out after \d+ms/.exec(message)
  if (timeout) {
    return { kind: 'timeout', provider: timeout[1], message }
  }

  const providerError = /Provider '([^']+)' failed:/.exec(message)
  if (providerError) {
    return { kind: 'provider_error', provider: providerError[1], message }
  }

  if (/Invalid arguments for tool/.test(message)) {
    return { kind: 'validation', message }
  }

  return { kind: 'provider_error', message }
}

/** Environment passed to the spawned MCP server: the parent's env, string-only. */
function childEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') env[key] = value
  }
  env.MCP_TRANSPORT = 'stdio'
  return env
}

/**
 * MCP client for the `aviation-weather` server. Connects lazily on first use
 * (not eagerly at construction) so that constructing this client — e.g. once
 * per web app process at bootstrap — never itself spawns a process or opens a
 * socket; only an actual weather lookup does. The connection is memoized and
 * reused across calls.
 */
export class McpWeatherClient implements WeatherMcpClient {
  private client: Client | null = null
  private connecting: Promise<Client> | null = null

  constructor(private readonly config: WeatherMcpClientConfig) {}

  private buildTransport(): Transport {
    if (this.config.transport === 'http') {
      if (!this.config.url) {
        throw new Error('WEATHER_MCP_URL is required when WEATHER_MCP_TRANSPORT is "http"')
      }
      return new StreamableHTTPClientTransport(new URL(this.config.url))
    }
    return new StdioClientTransport({
      command: process.execPath,
      args: ['--import', 'tsx', 'src/index.ts'],
      cwd: AVIATION_WEATHER_DIR,
      env: childEnv(),
      stderr: 'inherit',
    })
  }

  private async connection(): Promise<Client> {
    if (this.client) return this.client
    this.connecting ??= (async () => {
      const transport = this.buildTransport()
      const client = new Client({ name: 'prevuelo-web', version: '0.1.0' }, { capabilities: {} })
      await client.connect(transport)
      this.client = client
      return client
    })()
    return this.connecting
  }

  private async call<T>(name: string, args: Record<string, unknown>): Promise<WeatherMcpResult<T>> {
    let client: Client
    try {
      client = await this.connection()
    } catch (error) {
      this.connecting = null
      return {
        ok: false,
        error: {
          kind: 'provider_error',
          message: error instanceof Error ? error.message : String(error),
        },
      }
    }

    try {
      const result = (await client.callTool({ name, arguments: args }, undefined, {
        timeout: this.config.timeoutMs,
      })) as ToolContentResult
      const text = textOf(result)
      if (result.isError) {
        return { ok: false, error: mapToolErrorMessage(text) }
      }
      return { ok: true, data: JSON.parse(text) as T }
    } catch (error) {
      const isProtocolTimeout = error instanceof McpError && error.code === ErrorCode.RequestTimeout
      return {
        ok: false,
        error: {
          kind: isProtocolTimeout ? 'timeout' : 'provider_error',
          message: error instanceof Error ? error.message : String(error),
        },
      }
    }
  }

  getMetar(icaos: readonly string[]): Promise<WeatherMcpResult<MetarResult>> {
    return this.call<MetarResult>('get_metar', { icao: [...icaos] })
  }

  getTaf(icaos: readonly string[]): Promise<WeatherMcpResult<TafResult>> {
    return this.call<TafResult>('get_taf', { icao: [...icaos] })
  }

  getNotams(icaos: readonly string[]): Promise<WeatherMcpResult<NotamResult>> {
    return this.call<NotamResult>('get_notams', { icao: [...icaos] })
  }

  getSigmet(fir: string): Promise<WeatherMcpResult<SigmetResult>> {
    return this.call<SigmetResult>('get_sigmet', { fir })
  }

  decodeMetar(raw: string, locale: WeatherLocale): Promise<WeatherMcpResult<DecodedMetar>> {
    return this.call<DecodedMetar>('decode_metar', { raw, locale })
  }

  async close(): Promise<void> {
    if (this.client) await this.client.close()
    this.client = null
    this.connecting = null
  }
}
