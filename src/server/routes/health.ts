import type { FastifyPluginAsync } from 'fastify'

import { PUBLIC_ROUTE } from '../auth/auth-plugin.js'

export interface HealthOptions {
  /** Resolves `true` when the database is reachable, `false` otherwise. */
  checkDatabase: () => Promise<boolean>
}

/**
 * Liveness and readiness endpoints. Liveness reports process health; readiness
 * reports dependency health and returns 503 naming the failing dependency when
 * the database is unreachable. Both are public: probes carry no session.
 */
export const healthPlugin: FastifyPluginAsync<HealthOptions> = async (app, opts) => {
  const checkDatabase = opts?.checkDatabase ?? (async () => true)

  app.get('/health/live', PUBLIC_ROUTE, async () => {
    return { status: 'ok' }
  })

  app.get('/health/ready', PUBLIC_ROUTE, async (_req, reply) => {
    const databaseUp = await runProbe(checkDatabase)
    const status = databaseUp ? 'ok' : 'error'
    void reply.code(databaseUp ? 200 : 503).send({
      status,
      checks: { database: databaseUp ? 'up' : 'down' },
    })
  })
}

async function runProbe(probe: () => Promise<boolean>): Promise<boolean> {
  try {
    return await probe()
  } catch {
    return false
  }
}
