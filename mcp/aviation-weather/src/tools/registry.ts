import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

import { decodeSchema, firSchema, locationIndicatorsSchema } from './schemas.js'
import type { WeatherToolService } from './service.js'

export interface RegisterToolOptions {
  service: WeatherToolService
}

function textResult(value: unknown): {
  content: Array<{ type: 'text'; text: string }>
} {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] }
}

/**
 * Register the five aeronautical data tools on an MCP server. Every handler
 * obtains its data through the shared tool service, which applies the provider
 * rate ceiling, response cache, and timeout on the way to the provider.
 */
export function registerWeatherTools(server: McpServer, opts: RegisterToolOptions): void {
  const { service } = opts

  server.registerTool(
    'get_metar',
    {
      title: 'Get METAR',
      description:
        'Retrieve current METAR reports for one or more ICAO aerodromes. Returns one entry per requested indicator, each with its raw report, observation time, and source; unknown aerodromes report no data rather than failing the call.',
      inputSchema: locationIndicatorsSchema,
    },
    async ({ icao }) => textResult(await service.getMetar(icao)),
  )

  server.registerTool(
    'get_taf',
    {
      title: 'Get TAF',
      description:
        'Retrieve terminal aerodrome forecasts (TAF) for one or more ICAO aerodromes. Returns one entry per requested indicator with its raw report and issue time.',
      inputSchema: locationIndicatorsSchema,
    },
    async ({ icao }) => textResult(await service.getTaf(icao)),
  )

  server.registerTool(
    'get_notams',
    {
      title: 'Get NOTAMs',
      description:
        'Retrieve NOTAMs for one or more ICAO aerodromes. Returns one entry per requested indicator, each listing its active NOTAMs.',
      inputSchema: locationIndicatorsSchema,
    },
    async ({ icao }) => textResult(await service.getNotams(icao)),
  )

  server.registerTool(
    'get_sigmet',
    {
      title: 'Get SIGMET',
      description:
        'Retrieve SIGMETs for a FIR designator (e.g. LECM, LECB, LPPC). Returns the active SIGMETs for the FIR, or an empty list when none are in force.',
      inputSchema: firSchema,
    },
    async ({ fir }) => textResult(await service.getSigmet([fir])),
  )

  server.registerTool(
    'decode_metar',
    {
      title: 'Decode METAR',
      description:
        'Decode a raw METAR report into locale-appropriate explanatory text in es, pt, or en. The raw report is echoed back unchanged. No provider is consulted.',
      inputSchema: decodeSchema,
    },
    async ({ raw, locale }) => textResult(service.decode(raw, locale)),
  )
}
