import { randomUUID } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { Server } from 'node:http'

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'
import type { Logger } from 'pino'

/**
 * Serve over stdio. The transport owns process stdout for protocol messages;
 * every log line must therefore go to stderr, which the caller's logger does.
 */
export async function serveStdio(server: McpServer, logger: Logger): Promise<void> {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  logger.info('mcp server listening on stdio')
}

export interface HttpServerHandle {
  httpServer: Server
  close(): Promise<void>
}

export interface ServeHttpOptions {
  host: string
  port: number
  logger: Logger
}

function jsonRpcError(id: unknown, code: number, message: string): string {
  return JSON.stringify({ jsonrpc: '2.0', id: id ?? null, error: { code, message } })
}

/**
 * Serve over the MCP Streamable HTTP transport on a plain Node HTTP server
 * (no framework dependency), in JSON-response mode. Each session's transport
 * is registered the moment its session id is generated, so a client's
 * follow-up requests are routed to the same transport and never re-connect a
 * second transport to the same {@link McpServer}. A POST without a session id
 * may only be an initialize request — anything else is a 400. GET (SSE
 * streaming) is not supported in JSON-response mode and answers 405; DELETE
 * closes the session.
 */
export async function serveHttp(
  server: McpServer,
  opts: ServeHttpOptions,
): Promise<HttpServerHandle> {
  const sessions = new Map<string, StreamableHTTPServerTransport>()

  const httpServer = createServer((req, res) => {
    void handleRequest(req, res)
  })

  async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      if (req.method === 'GET') {
        // JSON-response mode opens no SSE stream for a GET to attach to.
        res.writeHead(405, { Allow: 'POST, DELETE', 'Content-Type': 'text/plain' })
        res.end('method not allowed: this server uses JSON responses and exposes no SSE stream')
        return
      }

      if (req.method === 'DELETE') {
        const sessionId = req.headers['mcp-session-id']
        if (typeof sessionId !== 'string') {
          res.writeHead(400, { 'Content-Type': 'text/plain' })
          res.end('missing mcp-session-id header')
          return
        }
        const transport = sessions.get(sessionId)
        if (!transport) {
          res.writeHead(404, { 'Content-Type': 'text/plain' })
          res.end('no session with that id')
          return
        }
        await transport.close()
        sessions.delete(sessionId)
        res.writeHead(200, { 'Content-Type': 'text/plain' })
        res.end()
        return
      }

      if (req.method !== 'POST') {
        res.writeHead(405, { Allow: 'POST, DELETE', 'Content-Type': 'text/plain' })
        res.end('method not allowed')
        return
      }

      const body = await readJsonBody(req)
      const sessionId = req.headers['mcp-session-id']
      const transport = typeof sessionId === 'string' ? sessions.get(sessionId) : undefined
      if (transport) {
        await transport.handleRequest(req, res, body)
        return
      }

      // No existing session. Only a fresh initialize request may open one; a
      // request carrying a dead session id (or none at all) is a bad request.
      if (typeof sessionId === 'string' || !isInitializeRequest(body)) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(jsonRpcError(null, -32000, 'Bad Request: No valid session ID provided'))
        return
      }

      const created = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        enableJsonResponse: true,
        onsessioninitialized: (createdId) => {
          // Register as soon as the id exists, so a follow-up request that
          // races the initialization response cannot open a second session.
          sessions.set(createdId, created)
        },
      })
      created.onclose = () => {
        if (created.sessionId) sessions.delete(created.sessionId)
      }
      await server.connect(created)
      await created.handleRequest(req, res, body)
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      opts.logger.error({ err: detail }, 'mcp http request failed')
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(jsonRpcError(null, -32603, 'Internal server error'))
      } else {
        res.destroy()
      }
    }
  }

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject)
    httpServer.listen(opts.port, opts.host, () => resolve())
  })
  const address = httpServer.address()
  opts.logger.info(
    {
      host: opts.host,
      port: typeof address === 'object' && address ? address.port : opts.port,
    },
    'mcp server listening on http',
  )

  return {
    httpServer,
    async close(): Promise<void> {
      for (const transport of sessions.values()) {
        await transport.close().catch(() => undefined)
      }
      sessions.clear()
      await new Promise<void>((resolve, reject) => {
        httpServer.close((error) => (error ? reject(error) : resolve()))
        // Idle keep-alive connections would otherwise keep the process alive.
        httpServer.closeIdleConnections()
      })
    },
  }
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(chunk as Buffer)
    if (chunks.reduce((total, c) => total + c.length, 0) > 10 * 1024 * 1024) {
      throw new Error('request body too large')
    }
  }
  const text = Buffer.concat(chunks).toString('utf8')
  if (text.trim() === '') return undefined
  try {
    return JSON.parse(text) as unknown
  } catch {
    return undefined
  }
}
