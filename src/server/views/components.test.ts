import { test } from 'node:test'
import assert from 'node:assert/strict'

import type { FastifyRequest } from 'fastify'

import { createViewRenderer, type ViewRenderer } from './views.js'
import { ALL_MODULES } from '../../modules/registry.js'

/** Render a partial bare (HX-Request) with the request-scoped shell context. */
function renderBare(views: ViewRenderer, fragment: string): string {
  const req = {
    locale: 'es',
    isAuthenticated: false,
    pilot: null,
    csrfToken: 'test-token',
    url: '/es',
    headers: { 'hx-request': 'true' },
  } as unknown as FastifyRequest
  return views.render(req, { fragment })
}

function makeViews(): ViewRenderer {
  return createViewRenderer(ALL_MODULES)
}

const INTERACTIVE = /<(button|a|input|select|textarea)\b[^>]*>/g

function touchTargets(html: string): string[] {
  return [...html.matchAll(INTERACTIVE)]
    .map((m) => m[0])
    .filter((tag) => !tag.includes('touch-target'))
}

test('status chips render a text label alongside their tone color', () => {
  const views = makeViews()
  const html = renderBare(views, 'pages/_kitchen-sink.njk')
  assert.ok(html.includes('VFR'))
  assert.match(html, /text-emerald-300/)
  assert.ok(html.includes('ADVERTENCIA'))
  assert.match(html, /text-amber-300/)
  assert.ok(html.includes('LIFR'))
  assert.match(html, /text-purple-300/)
})

test('badges render a label and a severity color', () => {
  const views = makeViews()
  const html = renderBare(views, 'pages/_kitchen-sink.njk')
  assert.ok(html.includes('CRÍTICO'))
  assert.match(html, /text-red-400/)
  assert.ok(html.includes('AVISO'))
  assert.match(html, /text-amber-400/)
})

test('the raw/plain toggle renders both labels as buttons', () => {
  const views = makeViews()
  const html = renderBare(views, 'pages/_kitchen-sink.njk')
  assert.ok(html.includes('Texto plano'))
  assert.ok(html.includes('Texto crudo'))
  assert.equal((html.match(/<button/g) ?? []).length, 2)
})

test('every interactive element in the shared partials meets the 44px touch-target rule', () => {
  const views = makeViews()
  const html = renderBare(views, 'pages/_kitchen-sink.njk')
  const offenders = touchTargets(html)
  assert.deepEqual(offenders, [], 'interactive controls must carry the touch-target class')
  assert.equal((html.match(/touch-target/g) ?? []).length, 2, 'both toggle buttons are tappable')
})

test('progress bar carries ARIA progressbar semantics and computed width', () => {
  const views = makeViews()
  const html = renderBare(views, 'pages/_kitchen-sink.njk')
  assert.match(html, /role="progressbar"/)
  assert.match(html, /aria-valuenow="3"/)
  assert.match(html, /aria-valuemax="10"/)
  assert.match(html, /width: 30%/)
})

test('empty state conveys its message as text', () => {
  const views = makeViews()
  const html = renderBare(views, 'pages/_kitchen-sink.njk')
  assert.ok(html.includes('Sin datos'))
  assert.ok(html.includes('No hay contenido aquí todavía.'))
})
