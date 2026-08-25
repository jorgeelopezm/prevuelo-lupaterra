import type { FastifyPluginAsync } from 'fastify'

export interface HealthOptions {
  /** Resolves `true` when the database is reachable, `false` otherwise. */
  checkDatabase: () => Promise<boolean>
}

/**
 * Liveness and readiness endpoints. Liveness reports process health; readiness
 * reports dependency health and returns 503 naming the failing dependency when
 * the database is unreachable.
 */
export const healthPlugin: FastifyPluginAsync<HealthOptions> = async (app, opts) => {
  const checkDatabase = opts?.checkDatabase ?? (async () => true)

  app.get('/health/live', async () => {
    return { status: 'ok' }
  })

  app.get('/health/ready', async (_req, reply) => {
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
