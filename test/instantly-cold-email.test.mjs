import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function read(rel) {
  return readFileSync(resolve(root, rel), 'utf8')
}

/** Mirror of mapping helpers in src/lib/instantly.ts for contract coverage. */
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

function statusRank(status) {
  switch (status) {
    case STATUS.active:
    case STATUS.runningSubsequences:
      return 0
    case STATUS.draft:
      return 1
    case STATUS.paused:
      return 2
    default:
      return 3
  }
}

function selectHomeCampaigns(rows, limit = 5) {
  const actionable = rows.filter((row) => row.campaign_status !== STATUS.completed)
  const pool = actionable.length > 0 ? actionable : rows
  return [...pool]
    .sort((a, b) => {
      const byStatus = statusRank(a.campaign_status) - statusRank(b.campaign_status)
      if (byStatus !== 0) return byStatus
      return (b.emails_sent_count || 0) - (a.emails_sent_count || 0)
    })
    .slice(0, limit)
}

function buildColdEmailGlance({ today, rolling30d, repliesWaiting, campaigns }) {
  const sent30 = Number(rolling30d.emails_sent_count) || 0
  const replies30 = Number(rolling30d.reply_count_unique) || 0
  const replyRate = sent30 > 0 ? Math.round((1000 * replies30) / sent30) / 10 : 0
  const meetingsToday =
    Number(today.total_meeting_booked) ||
    Number(today.total_interested) ||
    Number(today.total_opportunities) ||
    0

  return {
    emailsSentToday: Number(today.emails_sent_count) || 0,
    repliesWaiting: Math.max(0, Math.round(Number(repliesWaiting) || 0)),
    meetingsBooked: meetingsToday,
    replyRate,
    campaigns: selectHomeCampaigns(campaigns).map((row) => ({
      id: row.campaign_id,
      name: row.campaign_name,
      status: mapInstantlyCampaignStatus(row.campaign_status),
      sent: Number(row.emails_sent_count) || 0,
      replies: Number(row.reply_count_unique) || Number(row.reply_count) || 0,
      meetings: Number(row.total_opportunities) || 0,
      progress: campaignProgress(row)
    }))
  }
}

test('Instantly campaign status maps to home UI labels', () => {
  assert.equal(mapInstantlyCampaignStatus(1), 'live')
  assert.equal(mapInstantlyCampaignStatus(4), 'live')
  assert.equal(mapInstantlyCampaignStatus(0), 'launching')
  assert.equal(mapInstantlyCampaignStatus(2), 'paused')
  assert.equal(mapInstantlyCampaignStatus(3), 'paused')
})

test('cold email glance prefers live campaigns and computes reply rate', () => {
  const glance = buildColdEmailGlance({
    today: {
      emails_sent_count: 74,
      reply_count_unique: 1,
      total_meeting_booked: 0,
      total_interested: 2,
      total_opportunities: 1
    },
    rolling30d: {
      emails_sent_count: 1593,
      reply_count_unique: 12
    },
    repliesWaiting: 0,
    campaigns: [
      {
        campaign_id: 'paused-big',
        campaign_name: 'Paused Big',
        campaign_status: 2,
        leads_count: 500,
        contacted_count: 400,
        emails_sent_count: 1000,
        reply_count: 10,
        reply_count_unique: 8,
        completed_count: 100,
        total_opportunities: 3
      },
      {
        campaign_id: 'live-a',
        campaign_name: 'Live A',
        campaign_status: 1,
        leads_count: 100,
        contacted_count: 52,
        new_leads_contacted_count: 52,
        emails_sent_count: 52,
        reply_count: 2,
        reply_count_unique: 2,
        completed_count: 0,
        total_opportunities: 1
      },
      {
        campaign_id: 'done',
        campaign_name: 'Done',
        campaign_status: 3,
        leads_count: 200,
        contacted_count: 200,
        emails_sent_count: 900,
        reply_count: 20,
        reply_count_unique: 15,
        completed_count: 200,
        total_opportunities: 5
      }
    ]
  })

  assert.equal(glance.emailsSentToday, 74)
  assert.equal(glance.repliesWaiting, 0)
  assert.equal(glance.meetingsBooked, 2)
  assert.equal(glance.replyRate, 0.8)
  assert.equal(glance.campaigns[0].id, 'live-a')
  assert.equal(glance.campaigns[0].status, 'live')
  assert.equal(glance.campaigns[0].progress, 52)
  assert.equal(glance.campaigns[1].id, 'paused-big')
  assert.ok(!glance.campaigns.some((c) => c.id === 'done'))
})

test('Instantly cold-email route is operator-gated and Home fetches it', () => {
  const route = read('src/app/api/instantly/cold-email/route.ts')
  const home = read('src/components/home/HomeDashboard.tsx')
  const client = read('src/lib/instantly.ts')

  assert.match(route, /requirePortalAccess\(\{\s*operator:\s*true\s*\}\)/)
  assert.match(route, /loadColdEmailGlanceFromInstantly/)
  assert.match(route, /portalJsonCached\([\s\S]*60\)/)
  assert.match(home, /\/api\/instantly\/cold-email/)
  assert.match(client, /api\.instantly\.ai\/api\/v2/)
  assert.match(client, /emails\/unread\/count/)
  assert.match(client, /campaigns\/analytics\/overview/)
  assert.match(client, /COLD_EMAIL_CACHE_TTL_MS/)
})
