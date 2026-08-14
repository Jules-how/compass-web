import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function read(rel) {
  return readFileSync(resolve(root, rel), 'utf8')
}

const STRUCTURE_LENGTH = {
  'nick-3step': 'Short',
  'nick-4step': 'Medium',
  'platten-aida': 'Long',
  'connor-3para': 'Long'
}

function lengthBandFromStructure(structureId) {
  if (!structureId) return ''
  return STRUCTURE_LENGTH[structureId] || ''
}

function guessCtaType(body) {
  const t = body.toLowerCase()
  if (!t.trim()) return ''
  if (t.includes('mind if') || t.includes('permission') || t.includes('send over')) {
    return 'permission'
  }
  if (t.includes('min call') || t.includes('thu') || t.includes('fri') || t.includes('this week')) {
    return 'timed_call'
  }
  if (t.includes('open to') || t.includes('worth exploring') || t.includes('curious')) {
    return 'interest_check'
  }
  return 'other'
}

function parseCopyNotes(notes) {
  const lower = notes.toLowerCase()
  let lengthBand = ''
  if (lower.includes('nick 3') || lower.includes('3-step')) lengthBand = 'Short'
  else if (lower.includes('nick 4') || lower.includes('4-step')) lengthBand = 'Medium'
  else if (lower.includes('aida') || lower.includes('connor')) lengthBand = 'Long'

  let ctaType = ''
  if (lower.includes('permission')) ctaType = 'permission'
  else if (lower.includes('timed call')) ctaType = 'timed_call'
  else if (lower.includes('interest-check') || lower.includes('interest check')) {
    ctaType = 'interest_check'
  }
  return { lengthBand, ctaType }
}

function rollupByOffer(campaigns) {
  const map = new Map()
  for (const c of campaigns) {
    const cur = map.get(c.offer) || { key: c.offer, campaigns: 0, sent: 0, replies: 0 }
    cur.campaigns += 1
    cur.sent += c.sendCount
    cur.replies += c.replyCount
    map.set(c.offer, cur)
  }
  return [...map.values()]
    .map((r) => ({
      ...r,
      replyRate: r.sent ? Math.round((r.replies / r.sent) * 1000) / 10 : 0
    }))
    .sort((a, b) => b.replyRate - a.replyRate)
}

test('factor performance module + hub wiring exist', () => {
  const lib = read('src/lib/outbound-factor-performance.ts')
  assert.match(lib, /export function rollupOutboundByFactor/)
  assert.match(lib, /export function enrichOutboundCampaignFactors/)
  assert.match(lib, /lengthBandFromStructure/)
  assert.match(lib, /expressionLabel/)
  assert.match(lib, /countFactorDifferences/)
  assert.match(lib, /'cta_type'/)
  assert.match(lib, /'expression'/)
  assert.match(lib, /'structure'/)

  const section = read('src/components/outbound/OutboundFactorSection.tsx')
  assert.match(section, /Performance by factor/)
  assert.match(section, /Group by/)
  assert.match(section, /CTA type/)
  assert.match(section, /Expression/)

  const hub = read('src/components/outbound/OutboundHub.tsx')
  assert.match(hub, /OutboundFactorSection/)
  assert.match(hub, /OutboundExperimentCompare/)

  const api = read('src/app/api/instantly/outbound-campaigns/route.ts')
  assert.match(api, /enrichOutboundBoardFactors/)
  assert.match(api, /compass_pipeline_campaigns/)
})

test('expression label prefers expression_key; CTA type explicit beats guess', () => {
  // Mirror production helpers for unit coverage without TS compile.
  function expressionLabel(expressionKey, coldExpression) {
    const key = (expressionKey || '').trim()
    if (key) return key
    const body = (coldExpression || '').replace(/\s+/g, ' ').trim()
    if (!body) return '—'
    return body.length > 64 ? `${body.slice(0, 61)}…` : body
  }
  assert.equal(expressionLabel('expr-growth', 'long body text'), 'expr-growth')
  assert.equal(expressionLabel('', 'Hello world'), 'Hello world')

  function preferCtaType(explicit, guessed) {
    return (explicit || '').trim() || guessed || ''
  }
  assert.equal(preferCtaType('permission', 'timed_call'), 'permission')
  assert.equal(preferCtaType('', 'timed_call'), 'timed_call')
})

test('experiment campaign columns + challenger route exist', () => {
  const campaigns = read('src/lib/campaigns.ts')
  assert.match(campaigns, /normalizeExperimentFactor/)
  assert.match(campaigns, /validateExperimentWrite/)
  assert.match(campaigns, /experiment_status/)

  const challenger = read('src/app/api/campaigns/[id]/challenger/route.ts')
  assert.match(challenger, /Spawn a one-factor challenger/)
  assert.match(challenger, /experiment_role: 'challenger'/)

  const inventory = read('src/app/api/agent/leads/inventory/route.ts')
  assert.match(inventory, /buildLeadInventory/)

  const mark = read('src/app/api/agent/leads/mark/route.ts')
  assert.match(mark, /enrich_status/)
  assert.match(mark, /pipeline_campaign_id/)
  assert.match(mark, /parseLeadFacts/)
})

test('length / CTA helpers match Compass structures and CTA phrasing', () => {
  assert.equal(lengthBandFromStructure('nick-3step'), 'Short')
  assert.equal(lengthBandFromStructure('nick-4step'), 'Medium')
  assert.equal(lengthBandFromStructure('platten-aida'), 'Long')
  assert.equal(guessCtaType('Mind if I send over a walkthrough?'), 'permission')
  assert.equal(guessCtaType('Worth a 15-min call Thu/Fri?'), 'timed_call')

  const notes = parseCopyNotes('Nick 3-step · permission CTA')
  assert.equal(notes.lengthBand, 'Short')
  assert.equal(notes.ctaType, 'permission')
})

test('offer rollup ranks by reply rate', () => {
  const rows = rollupByOffer([
    { offer: 'AI Enablement', sendCount: 1000, replyCount: 70 },
    { offer: 'Growth System', sendCount: 500, replyCount: 20 }
  ])
  assert.equal(rows[0].key, 'AI Enablement')
  assert.equal(rows[0].replyRate, 7)
  assert.equal(rows[1].replyRate, 4)
})
