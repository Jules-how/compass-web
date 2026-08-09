import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function read(rel) {
  return readFileSync(resolve(root, rel), 'utf8')
}

const STATUS = {
  draft: 0,
  active: 1,
  paused: 2,
  completed: 3,
  runningSubsequences: 4,
  bounceProtect: -2
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

function mapInstantlyOutboundStatus(status) {
  if (status === STATUS.completed) return 'completed'
  return mapInstantlyCampaignStatus(status)
}

function campaignProgress(row) {
  const leads = Math.max(0, Number(row.leads_count) || 0)
  if (leads <= 0) return 0
  const newContacted = Math.max(0, Number(row.new_leads_contacted_count) || 0)
  const contacted = Math.max(0, Number(row.contacted_count) || 0)
  const numerator = newContacted > 0 ? newContacted : Math.min(contacted, leads)
  return Math.min(100, Math.round((100 * numerator) / leads))
}

function campaignReplyRate(row) {
  const sent = Math.max(0, Number(row.emails_sent_count) || 0)
  if (sent <= 0) return 0
  const replies =
    Math.max(0, Number(row.reply_count_unique) || 0) ||
    Math.max(0, Number(row.reply_count) || 0)
  return Math.round((1000 * replies) / sent) / 10
}

function mapInstantlyRowToOutboundCampaign(row) {
  const leads = Math.max(0, Number(row.leads_count) || 0)
  const newContacted = Math.max(0, Number(row.new_leads_contacted_count) || 0)
  const contacted = Math.max(0, Number(row.contacted_count) || 0)
  const touched = newContacted > 0 ? newContacted : Math.min(contacted, leads)
  const sendCount = Math.max(0, Number(row.emails_sent_count) || 0)
  const replyCount =
    Math.max(0, Number(row.reply_count_unique) || 0) ||
    Math.max(0, Number(row.reply_count) || 0)
  const opportunities = Math.max(0, Number(row.total_opportunities) || 0)

  return {
    id: row.campaign_id,
    name: row.campaign_name || 'Untitled campaign',
    status: mapInstantlyOutboundStatus(row.campaign_status),
    leadCount: leads,
    sendCount,
    remaining: Math.max(0, leads - touched),
    progress: campaignProgress(row),
    replyCount,
    replyRate: campaignReplyRate(row),
    opportunities
  }
}

function buildOutboundBoard(rows) {
  const mapped = rows.map(mapInstantlyRowToOutboundCampaign)
  const live = mapped.filter(
    (c) => c.status === 'live' || c.status === 'launching' || c.status === 'paused'
  )
  const history = mapped.filter((c) => c.status === 'completed')
  return {
    live,
    history,
    liveCount: live.filter((c) => c.status === 'live').length
  }
}

test('outbound board maps Instantly analytics into readable live metrics', () => {
  const board = buildOutboundBoard([
    {
      campaign_id: 'live-1',
      campaign_name: 'QLD Electricians | Growth System',
      campaign_status: STATUS.active,
      leads_count: 50,
      contacted_count: 73,
      new_leads_contacted_count: 50,
      emails_sent_count: 73,
      reply_count: 2,
      reply_count_unique: 2,
      completed_count: 25,
      total_opportunities: 1,
      bounced_count: 1
    },
    {
      campaign_id: 'done-1',
      campaign_name: 'Mortgage Brokers Au V2',
      campaign_status: STATUS.completed,
      leads_count: 335,
      contacted_count: 995,
      new_leads_contacted_count: 335,
      emails_sent_count: 995,
      reply_count: 2,
      reply_count_unique: 2,
      completed_count: 330,
      total_opportunities: 2
    },
    {
      campaign_id: 'paused-1',
      campaign_name: 'Paused brokers',
      campaign_status: STATUS.paused,
      leads_count: 100,
      contacted_count: 40,
      new_leads_contacted_count: 40,
      emails_sent_count: 40,
      reply_count: 0,
      reply_count_unique: 0,
      completed_count: 0,
      total_opportunities: 0
    }
  ])

  assert.equal(board.liveCount, 1)
  assert.equal(board.live.length, 2)
  assert.equal(board.history.length, 1)

  const live = board.live.find((c) => c.id === 'live-1')
  assert.ok(live)
  assert.equal(live.status, 'live')
  assert.equal(live.progress, 100)
  assert.equal(live.remaining, 0)
  assert.equal(live.replyCount, 2)
  assert.equal(live.replyRate, 2.7)
  assert.equal(live.opportunities, 1)

  assert.equal(board.history[0].id, 'done-1')
  assert.equal(board.history[0].status, 'completed')
})

test('outbound Instantly route is operator-gated and hub sections fetch it', () => {
  const route = read('src/app/api/instantly/outbound-campaigns/route.ts')
  const live = read('src/components/outbound/OutboundLiveSection.tsx')
  const history = read('src/components/outbound/OutboundHistorySection.tsx')
  const hub = read('src/components/outbound/OutboundHub.tsx')
  const client = read('src/lib/instantly.ts')

  assert.match(route, /requirePortalAccess\(\{\s*operator:\s*true\s*\}\)/)
  assert.match(route, /loadOutboundBoardFromInstantly/)
  assert.match(live, /\/api\/instantly\/outbound-campaigns/)
  assert.match(live, /Reply rate/)
  assert.match(live, /Opportunities/)
  assert.doesNotMatch(live, /\+ve · .* mtgs/)
  assert.match(history, /\/api\/instantly\/outbound-campaigns/)
  assert.match(hub, /minmax\(24rem,28rem\)/)
  assert.match(client, /buildOutboundBoard/)
  assert.match(client, /OUTBOUND_BOARD_CACHE_TTL_MS/)
})
