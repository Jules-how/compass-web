import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function read(rel) {
  return readFileSync(resolve(root, rel), 'utf8')
}

/** Mirror of sequence analytics helpers in src/lib/instantly.ts */
const STATUS = {
  draft: 0,
  active: 1,
  paused: 2,
  completed: 3,
  runningSubsequences: 4
}

function mapInstantlyCampaignStatus(status) {
  switch (status) {
    case STATUS.active:
    case STATUS.runningSubsequences:
      return 'live'
    case STATUS.draft:
      return 'launching'
    default:
      return 'paused'
  }
}

function campaignProgress(row) {
  const leads = Math.max(0, Number(row.leads_count) || 0)
  if (leads <= 0) return 0
  const newContacted = Math.max(0, Number(row.new_leads_contacted_count) || 0)
  const contacted = Math.max(0, Number(row.contacted_count) || 0)
  const numerator = newContacted > 0 ? newContacted : Math.min(contacted, leads)
  return Math.min(100, Math.round((100 * numerator) / leads))
}

function buildSequenceCampaignAnalytics(row) {
  const leads = Math.max(0, Number(row.leads_count) || 0)
  const contacted = Math.max(0, Number(row.contacted_count) || 0)
  const sent = Math.max(0, Number(row.emails_sent_count) || 0)
  const replies =
    Math.max(0, Number(row.reply_count_unique) || 0) ||
    Math.max(0, Number(row.reply_count) || 0)
  const opportunities = Math.max(0, Number(row.total_opportunities) || 0)
  const completed = Math.max(0, Number(row.completed_count) || 0)
  const progress = campaignProgress(row)
  const remaining = Math.max(0, leads - Math.min(contacted, leads))
  const replyRate = sent > 0 ? Math.round((1000 * replies) / sent) / 10 : 0

  return {
    campaignId: row.campaign_id,
    campaignName: row.campaign_name || 'Untitled campaign',
    status: mapInstantlyCampaignStatus(row.campaign_status),
    leads,
    contacted,
    sent,
    replies,
    opportunities,
    completed,
    remaining,
    progress,
    replyRate
  }
}

function findCampaignAnalytics(rows, campaignId) {
  const id = campaignId.trim()
  if (!id) return null
  return rows.find((row) => row.campaign_id === id) ?? null
}

function buildDemoSequenceCampaignAnalytics(campaignId) {
  const id = campaignId.trim() || 'demo-campaign'
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  const leads = 800 + (hash % 1600)
  const progress = 35 + (hash % 50)
  const contacted = Math.round((leads * progress) / 100)
  const sent = Math.round(contacted * (1.4 + (hash % 40) / 100))
  const replies = Math.max(1, Math.round(sent * (0.02 + (hash % 30) / 1000)))
  const opportunities = Math.max(0, Math.round(replies * 0.25))
  const completed = Math.round(leads * (progress / 100) * 0.4)
  return {
    campaignId: id,
    campaignName: 'Demo Instantly campaign',
    status: 'live',
    leads,
    contacted,
    sent,
    replies,
    opportunities,
    completed,
    remaining: Math.max(0, leads - contacted),
    progress,
    replyRate: sent > 0 ? Math.round((1000 * replies) / sent) / 10 : 0
  }
}

test('buildSequenceCampaignAnalytics maps Instantly row to editor metrics', () => {
  const metrics = buildSequenceCampaignAnalytics({
    campaign_id: 'camp-1',
    campaign_name: 'NSW Electricians',
    campaign_status: STATUS.active,
    leads_count: 1000,
    contacted_count: 400,
    new_leads_contacted_count: 350,
    emails_sent_count: 1200,
    reply_count: 80,
    reply_count_unique: 48,
    completed_count: 100,
    total_opportunities: 12
  })

  assert.equal(metrics.campaignId, 'camp-1')
  assert.equal(metrics.campaignName, 'NSW Electricians')
  assert.equal(metrics.status, 'live')
  assert.equal(metrics.leads, 1000)
  assert.equal(metrics.contacted, 400)
  assert.equal(metrics.sent, 1200)
  assert.equal(metrics.replies, 48)
  assert.equal(metrics.opportunities, 12)
  assert.equal(metrics.progress, 35)
  assert.equal(metrics.remaining, 600)
  assert.equal(metrics.replyRate, 4)
})

test('findCampaignAnalytics matches Instantly id', () => {
  const rows = [
    { campaign_id: 'a', campaign_name: 'A', campaign_status: 1, leads_count: 1, contacted_count: 0, emails_sent_count: 0, reply_count: 0, reply_count_unique: 0, completed_count: 0, total_opportunities: 0 },
    { campaign_id: 'b', campaign_name: 'B', campaign_status: 2, leads_count: 2, contacted_count: 0, emails_sent_count: 0, reply_count: 0, reply_count_unique: 0, completed_count: 0, total_opportunities: 0 }
  ]
  assert.equal(findCampaignAnalytics(rows, 'b')?.campaign_name, 'B')
  assert.equal(findCampaignAnalytics(rows, ' missing '), null)
  assert.equal(findCampaignAnalytics(rows, ''), null)
})

test('demo sequence analytics is stable for the same Instantly id', () => {
  const a = buildDemoSequenceCampaignAnalytics('uuid-stable')
  const b = buildDemoSequenceCampaignAnalytics('uuid-stable')
  assert.deepEqual(a, b)
  assert.ok(a.leads >= 800)
  assert.ok(a.progress >= 35)
  assert.equal(a.status, 'live')
})

test('sequence campaign analytics route and editor panel are wired', () => {
  const route = read('src/app/api/instantly/campaigns/[id]/analytics/route.ts')
  const panel = read('src/components/outbound/SequenceAnalyticsPanel.tsx')
  const editor = read('src/components/outbound/SequenceEditor.tsx')
  const client = read('src/lib/instantly.ts')

  assert.match(route, /requirePortalAccess\(\{\s*operator:\s*true\s*\}\)/)
  assert.match(route, /loadSequenceCampaignAnalytics/)
  assert.match(route, /buildDemoSequenceCampaignAnalytics/)
  assert.match(panel, /useCachedJson/)
  assert.match(panel, /\/api\/instantly\/campaigns\//)
  assert.match(editor, /SequenceAnalyticsPanel/)
  assert.match(editor, /instantly_campaign_id/)
  assert.match(client, /buildSequenceCampaignAnalytics/)
  assert.match(client, /loadSequenceCampaignAnalytics/)
  assert.match(client, /SEQUENCE_ANALYTICS_CACHE_TTL_MS/)
})
