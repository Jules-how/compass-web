import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function read(rel) {
  return readFileSync(resolve(root, rel), 'utf8')
}

const WAVE_BOUNCE_WARN_PCT = 2

function normalizeCopyStatus(value) {
  const s = String(value || '').trim()
  if (s === 'draft' || s === 'ready' || s === 'live' || s === 'none') return s
  return 'none'
}

function isPositiveOutboundStatus(status) {
  const s = (status || '').trim()
  return s === 'interested' || s === 'meeting_booked' || s === 'booked' || s === 'converted'
}

function isMeetingOutboundStatus(status) {
  const s = (status || '').trim()
  return s === 'meeting_booked' || s === 'booked'
}

function summarizeWaveLeads(rows) {
  const enrichMix = {}
  let openers = 0
  let missingCompanyOrEmail = 0
  let positive = 0
  let meetings = 0
  for (const row of rows) {
    const enrich = (row.enrich_status || 'none').trim() || 'none'
    enrichMix[enrich] = (enrichMix[enrich] || 0) + 1
    if ((row.opener || '').trim()) openers += 1
    const email = (row.email || '').trim()
    const company = (row.company || '').trim()
    if (!email || !company) missingCompanyOrEmail += 1
    if (isPositiveOutboundStatus(row.outbound_status)) positive += 1
    if (isMeetingOutboundStatus(row.outbound_status)) meetings += 1
  }
  return { cohort: rows.length, openers, missingCompanyOrEmail, enrichMix, positive, meetings }
}

function bounceRate(sent, bounced) {
  if (sent <= 0) return 0
  return Math.round((1000 * bounced) / sent) / 10
}

function buildWaveSnapshot(input) {
  const copyStatus = normalizeCopyStatus(input.campaign.copy_status)
  const bound = Boolean((input.campaign.instantly_campaign_id || '').trim())
  const offer = Boolean((input.campaign.offer_key || '').trim())
  const copyOk = copyStatus === 'draft' || copyStatus === 'ready' || copyStatus === 'live'
  const reviewedAt = input.campaign.opener_reviewed_at ?? null
  const confirmedAt = input.campaign.copy_confirmed_at ?? null
  const cohort = input.leads.cohort
  const openers = input.leads.openers
  const volume = input.instantly ?? null
  const rate = volume ? bounceRate(volume.sent, volume.bounced) : 0
  const bounceWarn = Boolean(volume && volume.sent > 0 && rate > WAVE_BOUNCE_WARN_PCT)
  const includeCopyMatch = input.includeCopyMatch !== false

  const checks = [
    { id: 'offer', ok: offer, blocking: true },
    { id: 'copy', ok: copyOk, blocking: true },
    { id: 'bound', ok: bound, blocking: true },
    { id: 'cohort', ok: cohort > 0, blocking: true },
    { id: 'openers', ok: cohort === 0 ? false : openers === cohort, blocking: true },
    { id: 'reviewed', ok: Boolean(reviewedAt), blocking: true }
  ]

  if (volume && volume.sent > 0) {
    checks.push({ id: 'bounce', ok: !bounceWarn, warn: bounceWarn, blocking: false })
  }

  if (includeCopyMatch) {
    const matchOk = copyStatus === 'live' && bound && Boolean(confirmedAt)
    checks.push({ id: 'copy_match', ok: matchOk, blocking: true })
  }

  const blocked = checks.some((c) => c.blocking && !c.ok)
  return { cohort, openers, checks, blocked, readyToActivate: !blocked, bounceRate: rate }
}

function copyPatchClearsConfirm(body) {
  if (body.copy_confirmed_at !== undefined) return false
  return body.sequence_draft !== undefined || body.cold_expression !== undefined
}

function readyCampaign(overrides = {}) {
  return {
    offer_key: 'growth-system',
    copy_status: 'live',
    instantly_campaign_id: 'inst-1',
    opener_reviewed_at: '2026-08-16T00:00:00.000Z',
    copy_confirmed_at: '2026-08-16T00:00:00.000Z',
    ...overrides
  }
}

function readyLeads(n = 12) {
  return {
    cohort: n,
    openers: n,
    missingCompanyOrEmail: 0,
    enrichMix: { opener_ready: n },
    positive: 0,
    meetings: 0
  }
}

test('wave snapshot blocks when offer is missing', () => {
  const snap = buildWaveSnapshot({
    campaign: readyCampaign({ offer_key: null }),
    leads: readyLeads(),
    instantly: null
  })
  assert.equal(snap.checks.find((c) => c.id === 'offer').ok, false)
  assert.equal(snap.blocked, true)
  assert.equal(snap.readyToActivate, false)
})

test('wave snapshot does not block a large cohort', () => {
  const snap = buildWaveSnapshot({
    campaign: readyCampaign(),
    leads: readyLeads(40),
    instantly: null
  })
  assert.equal(snap.blocked, false)
  assert.equal(snap.readyToActivate, true)
})

test('wave snapshot warns on bounce above 2% without blocking', () => {
  const snap = buildWaveSnapshot({
    campaign: readyCampaign(),
    leads: readyLeads(),
    instantly: { sent: 100, bounced: 3 }
  })
  const bounce = snap.checks.find((c) => c.id === 'bounce')
  assert.equal(bounce.ok, false)
  assert.equal(bounce.warn, true)
  assert.equal(bounce.blocking, false)
  assert.equal(snap.bounceRate, 3)
  assert.equal(snap.blocked, false)
})

test('wave snapshot blocks until openers are reviewed', () => {
  const snap = buildWaveSnapshot({
    campaign: readyCampaign({ opener_reviewed_at: null }),
    leads: readyLeads(),
    instantly: null
  })
  assert.equal(snap.checks.find((c) => c.id === 'reviewed').ok, false)
  assert.equal(snap.blocked, true)
})

test('wave snapshot requires live copy match confirmation', () => {
  const stale = buildWaveSnapshot({
    campaign: readyCampaign({ copy_confirmed_at: null }),
    leads: readyLeads(),
    instantly: null
  })
  assert.equal(stale.checks.find((c) => c.id === 'copy_match').ok, false)
  assert.equal(stale.blocked, true)

  const ok = buildWaveSnapshot({
    campaign: readyCampaign(),
    leads: readyLeads(),
    instantly: null
  })
  assert.equal(ok.blocked, false)
  assert.equal(ok.readyToActivate, true)
})

test('copy PATCH clears confirm unless confirm is sent in the same body', () => {
  assert.equal(copyPatchClearsConfirm({ sequence_draft: {} }), true)
  assert.equal(copyPatchClearsConfirm({ cold_expression: 'x' }), true)
  assert.equal(copyPatchClearsConfirm({ sequence_draft: {}, copy_confirmed_at: 'now' }), false)
  assert.equal(copyPatchClearsConfirm({ hypothesis: 'x' }), false)
})

test('wave files and sidecar Wave section are wired', () => {
  const migration = read('supabase/migrations/0045_campaign_wave.sql')
  assert.match(migration, /opener_reviewed_at/)
  assert.match(migration, /copy_confirmed_at/)
  assert.match(read('supabase/migrations/0050_drop_wave_cap.sql'), /DROP COLUMN IF EXISTS wave_cap/)

  const lib = read('src/lib/campaign-wave.ts')
  assert.match(lib, /export function buildWaveSnapshot/)
  assert.match(lib, /export function researchState/)
  assert.match(lib, /wave_opener_count/)
  assert.match(lib, /copy_match/)
  assert.match(lib, /WAVE_BOUNCE_WARN_PCT/)
  assert.doesNotMatch(lib, /wave_cap/)
  assert.doesNotMatch(lib, /parseWaveCap/)

  const sidecar = read('src/components/campaigns/CampaignSidecar.tsx')
  assert.match(sidecar, /CampaignWaveSection/)
  assert.match(sidecar, /title="Wave"/)
  assert.match(sidecar, /Match Instantly before the next wave/)

  const planner = read('src/components/campaigns/CampaignPlanner.tsx')
  assert.match(planner, /wavePlannerBit/)

  const agent = read('src/app/api/agent/campaigns/route.ts')
  assert.match(agent, /compactWaveForAgent/)
  assert.doesNotMatch(agent, /wave_cap/)
  assert.doesNotMatch(read('src/lib/agent-brief.ts'), /wave_cap/)
  assert.doesNotMatch(read('src/components/campaigns/CampaignWaveSection.tsx'), /placeholder="30/)
})
