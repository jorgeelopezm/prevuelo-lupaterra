import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import type { FastifyInstance } from 'fastify'

import { buildApp } from './app.js'
import { ConfigError, loadConfig } from './config.js'
import type { AppConfig } from './config.js'

/**
 * Application entry point. Loads and validates configuration (aborting with a
 * descriptive, secret-free error on any violation), composes the server, listens
 * on the configured host/port, and installs signal handlers that drain
 * in-flight requests before shutting down.
 */
export async function main(): Promise<void> {
  let config: AppConfig
  try {
    config = loadConfig()
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(error.message)
    } else {
      console.error(error)
    }
    process.exitCode = 1
    return
  }

  const app: FastifyInstance = await buildApp({ config })
  await app.listen({ host: config.HOST, port: config.PORT })

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'shutting down; draining in-flight requests')
    await app.close()
    process.exit(0)
  }
  process.once('SIGINT', () => {
    void shutdown('SIGINT')
  })
  process.once('SIGTERM', () => {
    void shutdown('SIGTERM')
  })
}

const isMain =
  process.argv[1] != null && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (isMain) {
  void main()
}
