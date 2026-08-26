import assert from 'node:assert/strict'
import test from 'node:test'

function confidenceFromEventCount(n) {
  const count = Math.max(0, Math.round(Number(n) || 0))
  if (count >= 30) return 1
  if (count <= 0) return 0.2
  return Math.round((count / 30) * 1000) / 1000
}

function scoreRankedAction(input) {
  const cash = Math.max(0, Number(input.cashAtStake) || 0)
  const urgency = Math.max(0, Math.min(1, Number(input.urgency) || 0))
  const confidence = confidenceFromEventCount(input.eventCount)
  const score = Math.round(cash * urgency * confidence)
  return { ...input, confidence, score }
}

function rankActions(inputs, limit = 5) {
  return inputs
    .map(scoreRankedAction)
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || b.cashAtStake - a.cashAtStake)
    .slice(0, limit)
}

function campaignUnderperforming(d14, r14, d90, r90, min = 200) {
  if (d14 < min || d90 < min) return false
  if (r90 <= 0) return false
  return r14 < r90 * 0.6
}

test('confidence scales to 1.0 at n>=30', () => {
  assert.equal(confidenceFromEventCount(0), 0.2)
  assert.equal(confidenceFromEventCount(15), 0.5)
  assert.equal(confidenceFromEventCount(30), 1)
  assert.equal(confidenceFromEventCount(100), 1)
})

test('score = cash × urgency × confidence', () => {
  const row = scoreRankedAction({
    key: 'x',
    title: 't',
    due: null,
    href: '/',
    cashAtStake: 2000,
    urgency: 0.7,
    eventCount: 30
  })
  assert.equal(row.score, 1400)
})

test('rankActions returns top 5 by score', () => {
  const ranked = rankActions([
    { key: 'a', title: 'A', due: null, href: '/', cashAtStake: 500, urgency: 1, eventCount: 30 },
    { key: 'b', title: 'B', due: null, href: '/', cashAtStake: 5000, urgency: 0.7, eventCount: 30 },
    { key: 'c', title: 'C', due: null, href: '/', cashAtStake: 100, urgency: 1, eventCount: 30 }
  ])
  assert.equal(ranked.length, 3)
  assert.equal(ranked[0].key, 'b')
})

test('campaign underperforming vs baseline', () => {
  assert.equal(campaignUnderperforming(250, 1, 500, 5), true)
  assert.equal(campaignUnderperforming(100, 1, 500, 5), false)
  assert.equal(campaignUnderperforming(250, 4, 500, 5), false)
})
