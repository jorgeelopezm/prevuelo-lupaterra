import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  DEFAULT_LOCALE,
  firstPathSegment,
  isSupportedLocale,
  negotiateLocale,
  resolveLocale,
} from './locale.js'
import { moduleForSegment, pathSegment } from './segments.js'

test('root path resolves the default locale when no signal exists', () => {
  assert.equal(resolveLocale(), DEFAULT_LOCALE)
  assert.equal(resolveLocale({ acceptLanguage: 'de-DE,de;q=0.9' }), DEFAULT_LOCALE)
})

test('stored pilot preference outranks Accept-Language', () => {
  const result = resolveLocale({
    storedLocale: 'pt',
    acceptLanguage: 'en-US,en;q=0.9',
  })
  assert.equal(result, 'pt')
})

test('anonymous visitor with a matching Accept-Language negotiates', () => {
  assert.equal(negotiateLocale('pt-BR,pt;q=0.9'), 'pt')
  assert.equal(negotiateLocale('es-ES,es;q=0.9,en;q=0.8'), 'es')
  assert.equal(negotiateLocale('en-US,en;q=0.9'), 'en')
})

test('q-values order negotiation', () => {
  assert.equal(negotiateLocale('en;q=0.5, es;q=0.9'), 'es')
  assert.equal(negotiateLocale('de;q=1, pt;q=0.8'), 'pt')
})

test('isSupportedLocale and path helpers', () => {
  assert.ok(isSupportedLocale('es'))
  assert.ok(isSupportedLocale('pt'))
  assert.ok(isSupportedLocale('en'))
  assert.ok(!isSupportedLocale('de'))
  assert.equal(firstPathSegment('/es/meteorologia'), 'es')
  assert.equal(firstPathSegment('/es/meteorologia?x=1'), 'es')
  assert.equal(firstPathSegment('/'), '')
})

test('path segment mapping is per-locale and reversible', () => {
  assert.equal(pathSegment('weather', 'es'), 'meteorologia')
  assert.equal(pathSegment('weather', 'en'), 'weather')
  assert.equal(moduleForSegment('meteorologia'), 'weather')
  assert.equal(moduleForSegment('weather'), 'weather')
  assert.equal(moduleForSegment('nonsense'), undefined)
  assert.equal(moduleForSegment('inicio'), 'dashboard')
  assert.equal(moduleForSegment('aeronave'), 'fleet')
})
