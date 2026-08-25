import { test } from 'node:test'
import assert from 'node:assert/strict'

import type { FastifyInstance } from 'fastify'

import { buildApp } from '../server/app.js'
import { loadConfig } from '../server/config.js'
import { ALL_MODULES } from './registry.js'
import { destinationPath } from '../platform/i18n/segments.js'
import { FakePoolFacade } from '../platform/db/fake-pool.js'
import type { FeatureModule } from './types.js'

function makeConfig() {
  return loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgres://localhost/ga',
    SESSION_SECRET: 's'.repeat(48),
  })
}

async function makeApp(modules?: readonly FeatureModule[]): Promise<FastifyInstance> {
  return buildApp({
    config: makeConfig(),
    pool: new FakePoolFacade(),
    checkDatabase: async () => true,
    ...(modules ? { modules } : {}),
  })
}

test('each registration entry point is invoked exactly once and its routes are reachable', async () => {
  const invoked: string[] = []
  const stubFor = (id: 'dashboard' | 'weather', order: number): FeatureModule => ({
    id,
    labelKey: 'nav.home',
    icon: 'home',
    order,
    register: (app, opts) => {
      invoked.push(id)
      app.get(`/:locale/__stub-${id}`, async () => ({ ok: true }))
      void opts
    },
  })
  const app = await makeApp([stubFor('dashboard', 1), stubFor('weather', 2)])

  assert.deepEqual(
    invoked,
    ['dashboard', 'weather'],
    'each entry point invoked exactly once, in order',
  )

  for (const id of ['dashboard', 'weather'] as const) {
    const res = await app.inject({ method: 'GET', url: `/es/__stub-${id}` })
    assert.equal(res.statusCode, 200, `route for ${id} is reachable`)
  }
  await app.close()
})

test('removing a module 404s its routes, leaves other modules intact, and drops its sidebar entry', async () => {
  const withoutWeather = ALL_MODULES.filter((m) => m.id !== 'weather')
  const app = await makeApp(withoutWeather)

  // The removed module's routes return 404 (no fallback).
  const gone = await app.inject({ method: 'GET', url: destinationPath('weather', 'es') })
  assert.equal(gone.statusCode, 404)

  // Other modules are unaffected.
  for (const mod of withoutWeather) {
    const res = await app.inject({ method: 'GET', url: destinationPath(mod.id, 'es') })
    assert.equal(res.statusCode, 200, `${destinationPath(mod.id, 'es')} still resolves`)
    assert.ok(res.body.includes('<!doctype html>'))
  }

  // The shell navigation derives from the registered list: weather is gone,
  // others remain.
  const home = await app.inject({ method: 'GET', url: '/es' })
  assert.ok(!home.body.includes(`href="${destinationPath('weather', 'es')}"`))
  assert.ok(home.body.includes(`href="${destinationPath('risk', 'es')}"`))
  await app.close()
})

test('the registry declares six unique modules in declared order', () => {
  assert.equal(ALL_MODULES.length, 6)
  const ids = ALL_MODULES.map((m) => m.id)
  assert.equal(new Set(ids).size, 6, 'module ids are unique')
  const orders = ALL_MODULES.map((m) => m.order)
  assert.deepEqual(
    [...orders].sort((a, b) => a - b),
    orders,
    'sorted by declared order',
  )
})
