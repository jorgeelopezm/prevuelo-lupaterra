import { test } from 'node:test'
import assert from 'node:assert/strict'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

import { ResponseCache } from './cache.js'
import { createMockWeatherProvider } from './provider/mock.js'
import type {
  MetarResult,
  NotamResult,
  SigmetResult,
  TafResult,
  WeatherProvider,
} from './provider/types.js'
import { RateLimiter } from './rate-limit.js'
import { registerWeatherTools } from './tools/registry.js'
import { WeatherToolService } from './tools/service.js'

const TOOL_NAMES = ['get_metar', 'get_taf', 'get_notams', 'get_sigmet', 'decode_metar']

class CountingProvider implements WeatherProvider {
  readonly id = 'counting'
  metarCalls = 0
  metarDelayMs = 0

  constructor(private readonly delegate: WeatherProvider) {}

  getMetar(icaos: readonly string[]): Promise<MetarResult> {
    this.metarCalls += 1
    const work = () => this.delegate.getMetar(icaos)
    if (this.metarDelayMs > 0) {
      return new Promise((resolve, reject) => {
        setTimeout(() => void work().then(resolve, reject), this.metarDelayMs)
      })
    }
    return work()
  }

  getTaf(icaos: readonly string[]): Promise<TafResult> {
    return this.delegate.getTaf(icaos)
  }

  getNotams(icaos: readonly string[]): Promise<NotamResult> {
    return this.delegate.getNotams(icaos)
  }

  getSigmet(firs: readonly string[]): Promise<SigmetResult> {
    return this.delegate.getSigmet(firs)
  }
}

async function connect(
  provider: WeatherProvider,
  opts: Partial<{ ttlMs: number; maxPerMinute: number; timeoutMs: number }> = {},
): Promise<{ client: Client; server: McpServer; provider: CountingProvider }> {
  const counting = new CountingProvider(provider)
  const service = new WeatherToolService({
    provider: counting,
    cache: new ResponseCache(opts.ttlMs ?? 60_000),
    rateLimiter: new RateLimiter(opts.maxPerMinute ?? 1000),
    timeoutMs: opts.timeoutMs ?? 5000,
  })
  const server = new McpServer(
    { name: 'ga-aviation-weather', version: '0.0.1-test' },
    { capabilities: { tools: {} } },
  )
  registerWeatherTools(server, { service })

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  const client = new Client({ name: 'test-client', version: '0.0.1' }, { capabilities: {} })
  await client.connect(clientTransport)
  return { client, server, provider: counting }
}

function toolText(result: unknown): string {
  if (!result || typeof result !== 'object') return ''
  const content = (result as { content?: Array<{ type?: string; text?: string }> }).content
  const first = content?.[0]
  return first && first.type === 'text' ? (first.text ?? '') : ''
}

test('handshake succeeds and tool discovery returns names, descriptions, and input schemas', async () => {
  const { client, server } = await connect(createMockWeatherProvider())
  try {
    const tools = await client.listTools()
    const names = tools.tools.map((t) => t.name).sort()
    assert.deepEqual(names, [...TOOL_NAMES].sort())
    for (const tool of tools.tools) {
      assert.ok(tool.description?.length, `${tool.name} has a description`)
      assert.ok(tool.inputSchema, `${tool.name} declares an input schema`)
      assert.ok('properties' in tool.inputSchema, `${tool.name} input schema carries properties`)
    }
  } finally {
    await client.close()
    await server.close()
  }
})

test('each tool returns a well-formed result against the mock provider', async () => {
  const { client, server } = await connect(createMockWeatherProvider())
  try {
    const metar = await client.callTool({ name: 'get_metar', arguments: { icao: ['LEMD'] } })
    assert.ok(!((metar as { isError?: boolean }).isError === true))
    const metarData = JSON.parse(toolText(metar)) as {
      provider: string
      entries: Array<{ icao: string; report: string; observationTime: string }>
    }
    assert.equal(metarData.provider, 'mock')
    assert.equal(metarData.entries[0]?.icao, 'LEMD')
    assert.match(metarData.entries[0]?.report ?? '', /^LEMD /)

    const taf = await client.callTool({ name: 'get_taf', arguments: { icao: ['LEBL'] } })
    const tafData = JSON.parse(toolText(taf)) as { entries: Array<{ report: string }> }
    assert.ok(tafData.entries[0]?.report.startsWith('TAF LEBL') ?? false)

    const notams = await client.callTool({ name: 'get_notams', arguments: { icao: ['LEMD'] } })
    const notamsData = JSON.parse(toolText(notams)) as { entries: Array<{ notams: unknown[] }> }
    assert.ok((notamsData.entries[0]?.notams.length ?? 0) >= 1)

    const sigmet = await client.callTool({ name: 'get_sigmet', arguments: { fir: 'LECM' } })
    const sigmetData = JSON.parse(toolText(sigmet)) as { entries: Array<{ sigmets: unknown[] }> }
    assert.ok((sigmetData.entries[0]?.sigmets.length ?? 0) >= 1)

    const decoded = await client.callTool({
      name: 'decode_metar',
      arguments: { raw: 'LEMD 250600Z 27012KT 9999 SCT025 18/11 Q1016 NOSIG', locale: 'pt' },
    })
    const decodedData = JSON.parse(toolText(decoded)) as {
      raw: string
      explanation: string
      sections: unknown[]
    }
    assert.equal(decodedData.raw, 'LEMD 250600Z 27012KT 9999 SCT025 18/11 Q1016 NOSIG')
    assert.match(decodedData.explanation, /vento/i)
    assert.ok(decodedData.sections.length >= 1)
  } finally {
    await client.close()
    await server.close()
  }

  test('schema violations return a validation error naming the field and perform no fetch', async () => {
    const { client, server, provider } = await connect(createMockWeatherProvider())
    try {
      const result = await client.callTool({ name: 'get_metar', arguments: { icao: ['LEM'] } })
      assert.ok((result as { isError?: boolean }).isError === true, 'returns an error result')
      const message = toolText(result)
      assert.match(message, /Invalid arguments for tool get_metar/)
      assert.match(message, /icao/)
      assert.match(message, /four-character ICAO/)
      assert.equal(provider.metarCalls, 0, 'no provider fetch happened on a validation failure')
    } finally {
      await client.close()
      await server.close()
    }
  })

  test('a malformed ICAO code returns a validation error rather than querying a provider', async () => {
    const { client, server, provider } = await connect(createMockWeatherProvider())
    try {
      const result = await client.callTool({ name: 'get_taf', arguments: { icao: ['12AB'] } })
      assert.ok((result as { isError?: boolean }).isError === true, 'returns an error result')
      const message = toolText(result)
      assert.match(message, /icao/)
      assert.match(message, /four-character ICAO/)
      assert.equal(provider.metarCalls, 0)
    } finally {
      await client.close()
      await server.close()
    }
  })

  test('provenance fields are present on every data result and mock data is labeled', async () => {
    const { client, server } = await connect(createMockWeatherProvider())
    try {
      for (const [name, args] of [
        ['get_metar', { icao: ['LEMD'] }],
        ['get_taf', { icao: ['LEMD'] }],
        ['get_notams', { icao: ['LEMD'] }],
        ['get_sigmet', { fir: 'LECM' }],
      ] as const) {
        const result = await client.callTool({ name, arguments: args })
        const data = JSON.parse(toolText(result)) as {
          provider: string
          issuedAt: string
          retrievedAt: string
          cached: boolean
          sample: boolean
          caveat: string
        }
        assert.equal(data.provider, 'mock', `${name} carries the provider id`)
        assert.ok(!Number.isNaN(Date.parse(data.issuedAt)), `${name} carries an issue time`)
        assert.ok(!Number.isNaN(Date.parse(data.retrievedAt)), `${name} carries a retrieval time`)
        assert.equal(data.sample, true, `${name} mock result is labeled as sample data`)
        assert.match(data.caveat, /not for operational use/)
      }
    } finally {
      await client.close()
      await server.close()
    }
  })

  test('a cache hit within the TTL performs no second upstream request and is marked cached', async () => {
    const { client, server, provider } = await connect(createMockWeatherProvider())
    try {
      const first = await client.callTool({ name: 'get_metar', arguments: { icao: ['LEMD'] } })
      const firstData = JSON.parse(toolText(first)) as { cached: boolean }
      assert.equal(firstData.cached, false)
      assert.equal(provider.metarCalls, 1)

      const second = await client.callTool({ name: 'get_metar', arguments: { icao: ['LEMD'] } })
      const secondData = JSON.parse(toolText(second)) as {
        cached: boolean
        cacheAgeSeconds: number
      }
      assert.equal(secondData.cached, true, 'served from cache')
      assert.ok(secondData.cacheAgeSeconds >= 0, 'carries its age')
      assert.equal(provider.metarCalls, 1, 'no second upstream request')
    } finally {
      await client.close()
      await server.close()
    }
  })

  test('an upstream timeout returns a structured error carrying no report text', async () => {
    const { client, server, provider } = await connect(createMockWeatherProvider(), {
      ttlMs: 60_000,
      timeoutMs: 20,
    })
    provider.metarDelayMs = 200
    try {
      const result = await client.callTool({ name: 'get_metar', arguments: { icao: ['LEMD'] } })
      assert.ok((result as { isError?: boolean }).isError === true, 'result is marked as an error')
      const text = toolText(result)
      assert.match(text, /timed out after 20ms/)
      assert.match(text, /provider/i)
      assert.ok(!text.includes('LEMD 250600Z'), 'no report text is substituted on failure')
    } finally {
      await client.close()
      await server.close()
    }
  })
})
