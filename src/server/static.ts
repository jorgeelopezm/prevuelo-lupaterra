import fp from 'fastify-plugin'

import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import fastifyStatic from '@fastify/static'
import type { FastifyPluginAsync } from 'fastify'

const ASSETS_DIR = fileURLToPath(new URL('../../dist/assets/', import.meta.url))

/**
 * Serves the built CSS/JS from `dist/assets` at `/assets/*`. The plugin is
 * skipped (with a warning) when assets have not been built, so tests stay
 * hermetic and `npm run dev` after a fresh checkout fails loudly at the shell
 * rather than silently.
 */
export const staticAssetsPlugin: FastifyPluginAsync = fp(async (app) => {
  if (!existsSync(ASSETS_DIR)) {
    app.log.warn(`assets not built (${ASSETS_DIR}) — run npm run assets:build`)
    return
  }
  await app.register(fastifyStatic, { root: ASSETS_DIR, prefix: '/assets/' })
})
