import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  ALL_PILOT_ANSWERED_ITEM_KEYS,
  LOW_MEDIUM_THRESHOLD,
  MEDIUM_HIGH_THRESHOLD,
  overallScore,
  scoreAircraftDomain,
  scoreAllDomains,
  scoreAnsweredDomain,
  topContributingFactors,
  verdictForScore,
} from './scoring.js'
import type { AircraftSnapshot, RiskAnswer } from './types.js'

function allFavorableAnswers(): RiskAnswer[] {
  return ALL_PILOT_ANSWERED_ITEM_KEYS.map((itemKey) => ({ itemKey, optionIndex: 0 }))
}

function allWorstAnswers(): RiskAnswer[] {
  return ALL_PILOT_ANSWERED_ITEM_KEYS.map((itemKey) => ({ itemKey, optionIndex: 2 }))
}

const NO_DATA_SNAPSHOT: AircraftSnapshot = {
  engineExceedance: null,
  fuelStatus: null,
  hoursToNextMaintenance: null,
}

test('all-favorable answers and no aircraft telemetry score to zero', () => {
  const domains = scoreAllDomains(allFavorableAnswers(), NO_DATA_SNAPSHOT)
  assert.equal(overallScore(domains), 0)
  assert.equal(verdictForScore(0), 'low')
})

test('all-worst answers push the overall score well past the high threshold', () => {
  const domains = scoreAllDomains(allWorstAnswers(), NO_DATA_SNAPSHOT)
  const score = overallScore(domains)
  assert.ok(score >= MEDIUM_HIGH_THRESHOLD)
  assert.equal(verdictForScore(score), 'high')
})

test('verdict threshold boundaries', () => {
  assert.equal(verdictForScore(LOW_MEDIUM_THRESHOLD - 1), 'low')
  assert.equal(verdictForScore(LOW_MEDIUM_THRESHOLD), 'medium')
  assert.equal(verdictForScore(MEDIUM_HIGH_THRESHOLD - 1), 'medium')
  assert.equal(verdictForScore(MEDIUM_HIGH_THRESHOLD), 'high')
})

test('an unanswered item defaults to the favorable option, not a penalty', () => {
  const domain = scoreAnsweredDomain('pilot', [])
  assert.equal(domain.score, 0)
})

test('aircraft domain with no fleet data flags every item as not available and scores zero', () => {
  const domain = scoreAircraftDomain(NO_DATA_SNAPSHOT)
  assert.equal(domain.score, 0)
  for (const item of domain.items) {
    assert.equal(item.notAvailable, true)
    assert.equal(item.points, 0)
  }
})

test('aircraft domain reflects an engine exceedance without pilot input', () => {
  const domain = scoreAircraftDomain({
    engineExceedance: true,
    fuelStatus: 'ok',
    hoursToNextMaintenance: 50,
  })
  const engineItem = domain.items.find((i) => i.itemKey === 'engine_exceedance')
  assert.equal(engineItem?.points, 6)
  assert.equal(engineItem?.notAvailable, false)
  assert.ok(domain.score > 0)
})

test('hours-to-maintenance below the due-soon threshold contributes points', () => {
  const dueSoon = scoreAircraftDomain({
    engineExceedance: false,
    fuelStatus: 'ok',
    hoursToNextMaintenance: 5,
  })
  const notDueSoon = scoreAircraftDomain({
    engineExceedance: false,
    fuelStatus: 'ok',
    hoursToNextMaintenance: 50,
  })
  assert.ok(dueSoon.score > notDueSoon.score)
})

test('top contributing factors ranks the highest-scoring items first and excludes zero-point items', () => {
  const domains = scoreAllDomains(
    [
      { itemKey: 'illness', optionIndex: 2 },
      { itemKey: 'medication', optionIndex: 0 },
      { itemKey: 'stress', optionIndex: 1 },
      { itemKey: 'weather', optionIndex: 2 },
    ],
    { engineExceedance: true, fuelStatus: 'ok', hoursToNextMaintenance: 50 },
  )
  const factors = topContributingFactors(domains, 3)
  assert.equal(factors.length, 3)
  for (let i = 1; i < factors.length; i++) {
    assert.ok(factors[i - 1]!.points >= factors[i]!.points)
  }
  assert.ok(factors.every((f) => f.points > 0))
})

test('top contributing factors is empty when nothing scored above zero', () => {
  const domains = scoreAllDomains(allFavorableAnswers(), NO_DATA_SNAPSHOT)
  assert.deepEqual(topContributingFactors(domains), [])
})
