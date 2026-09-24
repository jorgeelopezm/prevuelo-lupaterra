import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { LATEST_PROTOCOL_VERSION } from '@modelcontextprotocol/sdk/types.js'

import { createLogger } from '../../../src/server/logger.js'
import type { Logger } from 'pino'

import { loadConfig } from './config.js'
import { buildWeatherServer } from './server.js'
import { serveHttp } from './transports.js'

const MCP_DIR = fileURLToPath(new URL('..', import.meta.url))

interface JsonRpcMessage {
  id?: number
  jsonrpc: string
  method?: string
  result?: unknown
  error?: { code: number; message: string }
}

function startStdioServer(): {
  child: ChildProcessWithoutNullStreams
  lines: string[]
  waitFor(predicate: (line: string) => boolean, timeoutMs?: number): Promise<JsonRpcMessage>
} {
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
    cwd: MCP_DIR,
    env: {
      ...process.env,
      MCP_TRANSPORT: 'stdio',
      WEATHER_PROVIDER: 'mock',
      LOG_LEVEL: 'silent',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  const lines: string[] = []
  let buffer = ''
  child.stdout.on('data', (chunk: Buffer) => {
    buffer += chunk.toString('utf8')
    const parts = buffer.split('\n')
    buffer = parts.pop() ?? ''
    for (const part of parts) {
      if (part.trim() !== '') lines.push(part)
    }
  })

  const waitFor = (
    predicate: (line: string) => boolean,
    timeoutMs = 4000,
  ): Promise<JsonRpcMessage> => {
    return new Promise((resolve, reject) => {
      const deadline = Date.now() + timeoutMs
      const check = () => {
        const match = lines.find(predicate)
        if (match) {
          resolve(JSON.parse(match) as JsonRpcMessage)
          return
        }
        if (child.exitCode !== null) {
          reject(new Error(`server exited early with code ${child.exitCode}`))
          return
        }
        if (Date.now() > deadline) {
          reject(new Error(`timed out; stdout so far: ${lines.join(' | ')}`))
          return
        }
        setTimeout(check, 20)
      }
      check()
    })
  }

  return { child, lines, waitFor }
}

async function stop(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null) return
  child.kill()
  await new Promise((resolve) => child.once('exit', resolve))
}

function toolText(result: unknown): string {
  if (!result || typeof result !== 'object') return ''
  const content = (result as { content?: Array<{ type?: string; text?: string }> }).content
  const first = content?.[0]
  return first && first.type === 'text' ? (first.text ?? '') : ''
}

function stubLogger(): Logger {
  return createLogger({ level: 'silent' })
}

test('stdio transport completes the handshake, advertises tools, and serves a tool call with protocol-only stdout', async () => {
  const { child, lines, waitFor } = startStdioServer()
  try {
    child.stdin.write(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: LATEST_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: 'stdio-test', version: '0.0.1' },
        },
      }) + '\n',
    )
    const init = await waitFor((line) => JSON.parse(line).id === 1 && 'result' in JSON.parse(line))
    assert.ok(init.result, 'initialize completes')
    const serverInfo = init.result as { serverInfo: { name: string }; protocolVersion: string }
    assert.equal(serverInfo.serverInfo.name, 'ga-aviation-weather')

    child.stdin.write(
      JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n',
    )
    child.stdin.write(
      JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }) + '\n',
    )
    const list = await waitFor((line) => JSON.parse(line).id === 2)
    const tools = (list.result as { tools: Array<{ name: string }> }).tools
    assert.deepEqual(tools.map((t) => t.name).sort(), [
      'decode_metar',
      'get_metar',
      'get_notams',
      'get_sigmet',
      'get_taf',
    ])

    child.stdin.write(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'get_metar', arguments: { icao: ['LEMD'] } },
      }) + '\n',
    )
    const call = await waitFor((line) => JSON.parse(line).id === 3)
    const content = (call.result as { content: Array<{ text: string }> }).content
    assert.match(content[0]?.text ?? '', /"provider": "mock"/)

    // Every stdout line is protocol JSON; nothing plain-text leaked.
    assert.ok(lines.length >= 3, 'at least the three protocol responses')
    for (const line of lines) {
      const parsed = JSON.parse(line) as JsonRpcMessage
      assert.equal(parsed.jsonrpc, '2.0', 'every stdout line is a JSON-RPC message')
    }
  } finally {
    await stop(child)
  }
})

test('the selected provider is logged at startup on stderr', async () => {
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
    cwd: MCP_DIR,
    env: {
      ...process.env,
      MCP_TRANSPORT: 'stdio',
      WEATHER_PROVIDER: 'mock',
      LOG_LEVEL: 'debug',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  let stderr = ''
  child.stderr.on('data', (chunk: Buffer) => {
    stderr += chunk.toString('utf8')
  })
  try {
    await new Promise<void>((resolve, reject) => {
      const deadline = Date.now() + 4000
      const check = () => {
        if (/selected weather provider/.test(stderr)) {
          resolve()
          return
        }
        if (Date.now() > deadline) reject(new Error(`startup log not seen: ${stderr}`))
        else setTimeout(check, 20)
      }
      check()
    })
    assert.match(stderr, /selected weather provider/)
    assert.match(stderr, /"weatherProvider":"mock"/)
    assert.match(stderr, /"notamProvider":"mock"/, 'the NOTAM provider is stated too')
  } finally {
    await stop(child)
  }
})

test('awc weather with a separate NOTAM provider builds without a weather credential', () => {
  const config = loadConfig({ WEATHER_PROVIDER: 'awc', NOTAM_PROVIDER: 'mock' })
  const { provider, notamProvider } = buildWeatherServer(config)
  assert.equal(provider.id, 'awc')
  assert.equal(notamProvider.id, 'mock')
})

test('http transport serves an MCP client over the configured port', async () => {
  const config = loadConfig({ WEATHER_PROVIDER: 'mock' })
  const { server } = buildWeatherServer(config)
  // Port 0 asks the OS for an ephemeral port; the real entry point uses MCP_PORT.
  const handle = await serveHttp(server, { host: '127.0.0.1', port: 0, logger: stubLogger() })
  const address = handle.httpServer.address()
  const port = typeof address === 'object' && address ? address.port : 0
  assert.ok(port > 0, 'server bound to an ephemeral port')

  const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`))
  const client = new Client({ name: 'http-test', version: '0.0.1' }, { capabilities: {} })
  try {
    await client.connect(transport)
    const tools = await client.listTools()
    assert.ok(
      tools.tools.some((t) => t.name === 'get_sigmet'),
      'tools discoverable over HTTP',
    )

    const result = await client.callTool({ name: 'get_metar', arguments: { icao: ['LEBL'] } })
    const data = JSON.parse(toolText(result)) as {
      provider: string
      entries: Array<{ icao: string; report: string | null }>
    }
    assert.equal(data.provider, 'mock')
    assert.match(data.entries[0]?.report ?? '', /^LEBL /)
  } finally {
    await client.close()
    await transport.close()
    await handle.close()
  }
})

test('GET /health is a plain 2xx liveness probe, distinct from the MCP endpoint', async () => {
  const config = loadConfig({ WEATHER_PROVIDER: 'mock' })
  const { server } = buildWeatherServer(config)
  const handle = await serveHttp(server, { host: '127.0.0.1', port: 0, logger: stubLogger() })
  const address = handle.httpServer.address()
  const port = typeof address === 'object' && address ? address.port : 0
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`)
    assert.equal(response.status, 200)
    const body = (await response.json()) as { status: string }
    assert.equal(body.status, 'ok')
  } finally {
    await handle.close()
  }
})

test('GET on any other path is still 405, unaffected by the /health carve-out', async () => {
  const config = loadConfig({ WEATHER_PROVIDER: 'mock' })
  const { server } = buildWeatherServer(config)
  const handle = await serveHttp(server, { host: '127.0.0.1', port: 0, logger: stubLogger() })
  const address = handle.httpServer.address()
  const port = typeof address === 'object' && address ? address.port : 0
  try {
    const response = await fetch(`http://127.0.0.1:${port}/mcp`)
    assert.equal(response.status, 405)
    assert.equal(response.headers.get('allow'), 'POST, DELETE')
  } finally {
    await handle.close()
  }
})
