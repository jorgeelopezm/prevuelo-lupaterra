import { test } from 'node:test'
import assert from 'node:assert/strict'

import { briefingForNotams, officialBriefingFor } from './briefing.js'

test('Spanish mainland and Canary Islands aerodromes map to the ENAIRE ICARO XXI briefing', () => {
  for (const icao of ['LEMD', 'LEBL', 'GCLP', 'GCTS']) {
    assert.equal(officialBriefingFor(icao)?.href, 'https://notampib.enaire.es/icaro', icao)
  }
})

test('Portuguese mainland and island aerodromes map to the NAV Portugal AIS briefing', () => {
  for (const icao of ['LPPT', 'LPPR', 'LPPD', 'LPMA']) {
    assert.equal(officialBriefingFor(icao)?.href, 'https://ais.nav.pt', icao)
  }
})

test('any other prefix has no official briefing link', () => {
  for (const icao of ['SUMU', 'KJFK', 'EGLL', 'LFPG', '']) {
    assert.equal(officialBriefingFor(icao), null, icao)
  }
})

test('lower-case and padded indicators are normalized', () => {
  assert.equal(officialBriefingFor(' lemd ')?.labelKey, 'weather.briefing_link_enaire')
})

test('a confirmed complete NOTAM list gets no briefing link; unknown or absent coverage does', () => {
  assert.equal(briefingForNotams('LEMD', 'complete'), null)
  assert.equal(briefingForNotams('LEMD', 'unknown')?.labelKey, 'weather.briefing_link_enaire')
  assert.equal(briefingForNotams('LPPT', undefined)?.labelKey, 'weather.briefing_link_nav_portugal')
  assert.equal(briefingForNotams('SUMU', 'unknown'), null)
})
