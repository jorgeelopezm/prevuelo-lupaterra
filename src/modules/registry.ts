import type { FastifyInstance } from 'fastify'

import { checklistsModule } from './checklists/index.js'
import { dashboardModule } from './dashboard/index.js'
import { documentsModule } from './documents/index.js'
import { fleetModule } from './fleet/index.js'
import { riskModule } from './risk/index.js'
import { weatherModule } from './weather/index.js'
import type { FeatureModule, ModuleContext } from './types.js'

/**
 * The module registry. The bootstrap composes the application solely by
 * invoking these registrations; the shell navigation renders from the same
 * list, so a destination appears if and only if its module is registered.
 */
export const ALL_MODULES: readonly FeatureModule[] = [
  dashboardModule,
  weatherModule,
  checklistsModule,
  riskModule,
  fleetModule,
  documentsModule,
].sort((a, b) => a.order - b.order)

export async function registerModules(
  app: FastifyInstance,
  context: ModuleContext,
  modules: readonly FeatureModule[] = ALL_MODULES,
): Promise<void> {
  for (const module of modules) {
    await app.register(module.register, context)
  }
}
