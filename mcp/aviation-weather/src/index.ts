import { createLogger } from '../../../src/server/logger.js'

import { loadConfig } from './config.js'
import type { McpConfig } from './config.js'
import { buildWeatherServer } from './server.js'
import { serveHttp, serveStdio } from './transports.js'

interface CliFlags {
  /** Overrides the configured `MCP_TRANSPORT`. */
  transport?: 'stdio' | 'http'
}

function parseArgv(argv: readonly string[]): CliFlags {
  const flags: CliFlags = {}
  for (const arg of argv) {
    if (arg === '--transport=stdio' || arg === '--transport=http') {
      flags.transport = arg.endsWith('stdio') ? 'stdio' : 'http'
    }
  }
  return flags
}

/**
 * Aviation weather MCP server entry point. Loads configuration through the
 * shared validated schema, selects the weather provider (mock by default), and
 * serves the five tools over stdio or HTTP. Nothing is ever written to stdout
 * outside the protocol: the stdio transport owns it, and all logging goes to
 * stderr.
 */
export async function main(): Promise<void> {
  let config: McpConfig
  try {
    config = loadConfig()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
    return
  }

  const flags = parseArgv(process.argv.slice(2))
  const transport = flags.transport ?? config.MCP_TRANSPORT

  try {
    const { server, provider, notamProvider } = buildWeatherServer(config)
    // stderr on purpose: never a non-protocol line on stdout in stdio mode.
    const logger = createLogger({ level: config.LOG_LEVEL, stream: process.stderr })
    logger.info(
      { weatherProvider: provider.id, notamProvider: notamProvider.id },
      'selected weather provider',
    )

    if (transport === 'http') {
      await serveHttp(server, { host: config.HOST, port: config.MCP_PORT, logger })
    } else {
      await serveStdio(server, logger)
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

void main()
