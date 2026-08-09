import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function read(rel) {
  return readFileSync(resolve(root, rel), 'utf8')
}

const MS_DAY = 24 * 60 * 60 * 1000
const COOLDOWN_DAYS = 90

/** Mirror of src/lib/recontact-eligibility.ts for node:test (no TS transpile). */
function computeRecontactEligibility(lead, now = new Date()) {
  const blocked =
    lead.outbound_status === 'suppressed' ||
    Boolean(lead.suppression_reason) ||
    lead.recontact_ok === 0
  const lastRaw = lead.last_outbound_at?.trim() || null
  const lastMs = lastRaw ? Date.parse(lastRaw) : NaN
  const hasLast = Boolean(lastRaw) && !Number.isNaN(lastMs)
  const hot = ['replied', 'interested', 'booked', 'meeting_booked', 'converted'].includes(
    (lead.outbound_status || '').toLowerCase()
  )

  if (blocked) {
    return {
      lane: 'blocked',
      progressPercent: null,
      daysRemaining: null,
      recommendNewCampaign: false
    }
  }
  if (!hasLast) {
    return {
      lane: 'never_contacted',
      progressPercent: null,
      daysRemaining: null,
      recommendNewCampaign: false
    }
  }
  const elapsed = Math.max(0, now.getTime() - lastMs)
  const progress = Math.min(100, Math.round((elapsed / (COOLDOWN_DAYS * MS_DAY)) * 100))
  const remainingMs = Math.max(0, COOLDOWN_DAYS * MS_DAY - elapsed)
  const daysRemaining = Math.ceil(remainingMs / MS_DAY)
  if (progress >= 100) {
    return {
      lane: hot ? 'hot' : 'ready',
      progressPercent: 100,
      daysRemaining: 0,
      recommendNewCampaign: !hot
    }
  }
  return {
    lane: hot ? 'hot' : 'cooling',
    progressPercent: progress,
    daysRemaining,
    recommendNewCampaign: false
  }
}

test('recontact eligibility: never contacted', () => {
  const e = computeRecontactEligibility({ outbound_status: 'uncontacted', recontact_ok: 1 })
  assert.equal(e.lane, 'never_contacted')
  assert.equal(e.recommendNewCampaign, false)
})

test('recontact eligibility: cooling progresses toward 100%', () => {
  const now = new Date('2026-08-09T12:00:00.000Z')
  const fortyFiveAgo = new Date(now.getTime() - 45 * MS_DAY).toISOString()
  const e = computeRecontactEligibility(
    {
      outbound_status: 'contacted',
      recontact_ok: 1,
      last_outbound_at: fortyFiveAgo
    },
    now
  )
  assert.equal(e.lane, 'cooling')
  assert.equal(e.progressPercent, 50)
  assert.equal(e.daysRemaining, 45)
  assert.equal(e.recommendNewCampaign, false)
})

test('recontact eligibility: ready after 90 days goes green / recommend campaign', () => {
  const now = new Date('2026-08-09T12:00:00.000Z')
  const past = new Date(now.getTime() - 91 * MS_DAY).toISOString()
  const e = computeRecontactEligibility(
    {
      outbound_status: 'contacted',
      recontact_ok: 1,
      last_outbound_at: past
    },
    now
  )
  assert.equal(e.lane, 'ready')
  assert.equal(e.progressPercent, 100)
  assert.equal(e.recommendNewCampaign, true)
})

test('recontact eligibility: suppressed / unsubscribed stays blocked', () => {
  const now = new Date('2026-08-09T12:00:00.000Z')
  const past = new Date(now.getTime() - 200 * MS_DAY).toISOString()
  const e = computeRecontactEligibility(
    {
      outbound_status: 'suppressed',
      suppression_reason: 'instantly_unsubscribed',
      recontact_ok: 0,
      last_outbound_at: past
    },
    now
  )
  assert.equal(e.lane, 'blocked')
  assert.equal(e.recommendNewCampaign, false)
})

test('recontact eligibility: hot stages are not cold-recontact recommendations', () => {
  const now = new Date('2026-08-09T12:00:00.000Z')
  const past = new Date(now.getTime() - 100 * MS_DAY).toISOString()
  const e = computeRecontactEligibility(
    {
      outbound_status: 'interested',
      recontact_ok: 1,
      last_outbound_at: past
    },
    now
  )
  assert.equal(e.lane, 'hot')
  assert.equal(e.recommendNewCampaign, false)
})

test('recontact module and wiring contracts', () => {
  const lib = read('src/lib/recontact-eligibility.ts')
  const query = read('src/lib/leads-query.ts')
  const summary = read('src/app/api/leads/summary/route.ts')
  const table = read('src/components/LeadTable.tsx')
  const panel = read('src/components/LeadRecontactPanel.tsx')
  const migration = read('supabase/migrations/0036_lead_outreach_touches.sql')
  const sync = read('src/lib/instantly-leads-sync.ts')
  const outreachApi = read('src/app/api/leads/[id]/outreach/route.ts')

  assert.match(lib, /RECONTACT_COOLDOWN_DAYS = 90/)
  assert.match(lib, /computeRecontactEligibility/)
  assert.match(query, /recontact_ready/)
  assert.match(query, /applyRecontactReadyFilters/)
  assert.match(summary, /recontact_ready/)
  assert.match(table, /RecontactProgressRing/)
  assert.match(table, /LeadRecontactPanel/)
  assert.match(table, /Recontact ready/)
  assert.match(panel, /Outreach history/)
  assert.match(migration, /lead_outreach_touches/)
  assert.match(sync, /recordOutreachTouch/)
  assert.match(sync, /recontact_ok: suppressed \? 0 : 1/)
  assert.match(outreachApi, /listOutreachTouches/)
})

test('preset segment Ready to recontact exists', () => {
  const meta = read('src/lib/leads-meta.ts')
  assert.match(meta, /Ready to recontact \(90d\+\)/)
  assert.match(meta, /recontact_ready: '1'/)
})
