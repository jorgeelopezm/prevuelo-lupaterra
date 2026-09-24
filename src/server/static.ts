import fp from 'fastify-plugin'

import { existsSync } from 'node:fs'
import { join } from 'node:path'

import fastifyStatic from '@fastify/static'
import type { FastifyPluginAsync } from 'fastify'

// Resolved from process.cwd(), not import.meta.url: this file's own directory
// depth relative to dist/assets differs between dev (src/server/, via tsx)
// and production (dist/app/server/, compiled) — a single import.meta.url-
// relative string can only be correct for one of the two. Both npm run dev
// and the platform's own WorkingDirectory= (the release root) start the
// process from the project root, so dist/assets relative to cwd() is
// correct in both cases without depth arithmetic.
const ASSETS_DIR = join(process.cwd(), 'dist', 'assets')

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
  // Assets are public: the sign-in screen needs its stylesheet before any
  // session exists. The encapsulated scope marks only the static routes.
  await app.register(async (scope) => {
    scope.addHook('onRoute', (route) => {
      route.config = { ...route.config, public: true }
    })
    await scope.register(fastifyStatic, { root: ASSETS_DIR, prefix: '/assets/' })
  })
})
