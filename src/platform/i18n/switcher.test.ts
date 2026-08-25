import { test } from 'node:test'
import assert from 'node:assert/strict'

import { switchLocale, switchLocalePath, NOOP_STORE } from './switcher.js'

test('switches a bare locale route', () => {
  assert.equal(switchLocalePath({ from: 'es', to: 'pt', currentPath: '/es' }), '/pt')
  assert.equal(switchLocalePath({ from: 'es', to: 'en', currentPath: '/' }), '/en')
})

test('switches a feature route, translating the feature segment', () => {
  assert.equal(
    switchLocalePath({ from: 'es', to: 'pt', currentPath: '/es/meteorologia' }),
    '/pt/meteorologia',
  )
  assert.equal(switchLocalePath({ from: 'es', to: 'en', currentPath: '/es/riesgo' }), '/en/risk')
})

test('preserves trailing route parameters verbatim', () => {
  assert.equal(
    switchLocalePath({ from: 'pt', to: 'es', currentPath: '/pt/aeronave/N4521G' }),
    '/es/aeronave/N4521G',
  )
  assert.equal(
    switchLocalePath({ from: 'es', to: 'en', currentPath: '/es/meteorologia', tail: ['LEMD'] }),
    '/en/weather/LEMD',
  )
})

test('anonymous switch performs no database write and returns the path', async () => {
  let wrote = 0
  const store = {
    ...NOOP_STORE,
    set: async () => {
      wrote += 1
    },
  }
  const result = await switchLocale({
    from: 'es',
    to: 'pt',
    currentPath: '/es',
    store,
  })
  assert.equal(result.targetPath, '/pt')
  assert.equal(result.persisted, false)
  assert.equal(wrote, 0, 'anonymous switch must not write to the database')
})

test('authenticated switch persists the preference', async () => {
  const writes: Array<[string, string]> = []
  const store = {
    ...NOOP_STORE,
    set: async (pilotId: string, locale: string) => {
      writes.push([pilotId, locale])
    },
  }
  const result = await switchLocale({
    from: 'en',
    to: 'pt',
    currentPath: '/en/weather',
    store,
    pilotId: 'pilot-1',
  })
  assert.equal(result.targetPath, '/pt/meteorologia')
  assert.equal(result.persisted, true)
  assert.deepEqual(writes, [['pilot-1', 'pt']])
})
