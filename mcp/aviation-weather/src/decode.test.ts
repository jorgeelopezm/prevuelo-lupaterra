import { test } from 'node:test'
import assert from 'node:assert/strict'

import { decodeMetar } from './decode.js'

test('decode_metar returns Portuguese explanatory text with the raw report unchanged', () => {
  const raw = 'LEMD 250600Z 27012KT 9999 SCT025 18/11 Q1016 NOSIG'
  const decoded = decodeMetar(raw, 'pt')

  assert.equal(decoded.raw, raw, 'raw report echoed back unchanged')
  assert.equal(decoded.locale, 'pt')
  assert.ok(decoded.decoded)
  assert.match(decoded.explanation, /vento de 270°/i)
  assert.match(decoded.explanation, /12 kt/i)
  assert.match(decoded.explanation, /visibilidade 9999/i)
  assert.match(decoded.explanation, /nuvens SCT a 025/i)
  assert.match(decoded.explanation, /QNH 1016/i)
  assert.match(decoded.explanation, /sem mudanças significativas/i)
})

test('decode_metar localizes the same report into each supported locale', () => {
  const raw = 'LPPT 250600Z 30015G25KT CAVOK 19/12 Q1017'
  const es = decodeMetar(raw, 'es')
  const en = decodeMetar(raw, 'en')

  assert.match(es.explanation, /ráfagas de 25 kt/)
  assert.match(en.explanation, /gusting 25 kt/)
  assert.match(es.explanation, /techo y visibilidad buenos/)
  assert.match(en.explanation, /ceiling and visibility OK/)
  assert.equal(es.raw, raw)
  assert.equal(en.raw, raw)
})

test('decode_metar explains intensity and weather phenomena', () => {
  const decoded = decodeMetar('LEBL 250600Z 20010KT 8000 -RA SCT020 BKN040 17/14 Q1015', 'es')
  assert.match(decoded.explanation, /lluvia/)
  assert.ok(
    decoded.sections.some((s) => s.token === '-RA'),
    'the -RA token is present in the decoded sections',
  )
})

test('an unrecognizable report is marked undecoded with a locale-appropriate note', () => {
  const raw = 'zzz not a metar'
  const decoded = decodeMetar(raw, 'en')
  assert.equal(decoded.raw, raw)
  assert.equal(decoded.decoded, false)
  assert.match(decoded.explanation, /could not decode/i)
  assert.deepEqual(decoded.sections, [])
})
