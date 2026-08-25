import { randomUUID } from 'node:crypto'

import pino from 'pino'
import type { DestinationStream, Logger } from 'pino'

/**
 * Pino redaction paths: anything that could carry a session token or credential
 * is censored before it can reach output. The per-request log record emitted by
 * the request logger is hand-picked and never includes raw headers, but this
 * redaction is defense in depth against any stray log referencing these paths.
 */
export const LOG_REDACT_PATHS = [
  'req.headers.cookie',
  'req.headers.authorization',
  'req.headers.proxy-authorization',
  'res.headers["set-cookie"]',
] as const

export const LOG_CENSOR = '[REDACTED]'

export interface BaseLoggerOptions {
  level: string
}

export function buildLoggerOptions(level: string) {
  return {
    level,
    redact: {
      paths: [...LOG_REDACT_PATHS] as string[],
      censor: LOG_CENSOR,
    },
  }
}

export interface CreateLoggerOptions extends BaseLoggerOptions {
  /** Optional output stream (tests use this to capture records). */
  stream?: DestinationStream
}

/**
 * Build the application's structured logger: pino with cookie/credential
 * redaction applied. The web app and the MCP server share this so both redact
 * the same sensitive fields.
 */
export function createLogger(opts: CreateLoggerOptions): Logger {
  const base = buildLoggerOptions(opts.level)
  return opts.stream ? pino(base, opts.stream) : pino(base)
}

/**
 * Correlation id for a request: accept a non-empty inbound `x-correlation-id`
 * header so callers can trace through to their own systems, otherwise generate.
 */
export function resolveCorrelationId(inbound: string | string[] | undefined): string {
  const value = Array.isArray(inbound) ? inbound[0] : inbound
  if (typeof value === 'string' && value.trim().length > 0) return value.trim()
  return randomUUID()
}
