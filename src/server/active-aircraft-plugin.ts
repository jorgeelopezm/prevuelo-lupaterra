import fp from 'fastify-plugin'
import type { FastifyPluginCallback } from 'fastify'

import { createAircraftRepo, type AircraftRepo } from '../platform/fleet/aircraft-repo.js'
import type { PoolFacade } from '../platform/db/pool.js'

declare module 'fastify' {
  interface FastifyRequest {
    /** The signed-in pilot's active-aircraft registration, or `null` when
     * unauthenticated or when the pilot has designated none (feature-
     * scaffolding: "Shell header presents the pilot's active aircraft").
     * Resolved once per request so every module and the shell header read
     * the same value without each fetching it independently. */
    activeAircraftRegistration: string | null
  }
}

export interface ActiveAircraftPluginOptions {
  pool: PoolFacade
  /** Override for tests; defaults to a repo over the given pool. */
  aircraftRepo?: AircraftRepo
}

/**
 * Resolves the signed-in pilot's active-aircraft registration once per
 * request, after the auth plugin has resolved `req.pilot`. Registered as its
 * own plugin (rather than inline in `buildApp`) so the fleet capability's
 * cross-cutting shell requirement stays in one reviewable place.
 */
export const activeAircraftPlugin: FastifyPluginCallback<ActiveAircraftPluginOptions> =
  fp<ActiveAircraftPluginOptions>(async (app, opts) => {
    const repo = opts.aircraftRepo ?? createAircraftRepo(opts.pool)

    app.decorateRequest('activeAircraftRegistration', null)

    app.addHook('preHandler', async (req) => {
      if (!req.pilot) {
        req.activeAircraftRegistration = null
        return
      }
      const active = await repo.getActiveAircraft(req.pilot.id)
      req.activeAircraftRegistration = active?.registration ?? null
    })
  })
