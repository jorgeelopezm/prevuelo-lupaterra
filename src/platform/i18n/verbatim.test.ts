import { test } from 'node:test'
import assert from 'node:assert/strict'

import { isVerbatim, renderVerbatim, verbatim } from './verbatim.js'

const SAMPLE = 'LEMD 221030Z 25012KT 9999 SCT035 22/10 Q1018'

test('verbatim output is character-identical to the source', () => {
  assert.equal(renderVerbatim(verbatim(SAMPLE)), SAMPLE)
})

test('verbatim output is locale-invariant across es, pt, en', () => {
  const rendered = renderVerbatim(verbatim(SAMPLE))
  assert.equal(rendered, renderVerbatim(verbatim(SAMPLE)))
  assert.equal(renderVerbatim(verbatim(SAMPLE)), SAMPLE)
})

test('line breaks and significant leading whitespace are preserved', () => {
  const multiLine = 'TAF LEMD\n  221112Z 2212/2318 25012KT\n    TEMPO 2215/2219 28022G35KT'
  assert.equal(renderVerbatim(verbatim(multiLine)), multiLine)
})

test('isVerbatim identifies verbatim values', () => {
  assert.ok(isVerbatim(verbatim('x')))
  assert.ok(!isVerbatim('x'))
  assert.ok(!isVerbatim(null))
  assert.ok(!isVerbatim({ text: 'x' }))
})
