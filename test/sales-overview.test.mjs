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

function mapInstantlySalesCampaignStatus(status) {
  if (status === STATUS.completed) return 'completed'
  return mapInstantlyCampaignStatus(status)
}

function splitCampaignMeta(name) {
  const parts = name
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean)
  if (parts.length >= 2) {
    return { list: parts[0], offer: parts.slice(1).join(' · ') }
  }
  return { list: 'Instantly', offer: name.trim() || 'Outbound' }
}

function pctDelta(current, prior) {
  if (prior <= 0) return current > 0 ? 100 : 0
  return Math.round(((current - prior) / prior) * 1000) / 10
}

function ratePct(numerator, denominator) {
  if (denominator <= 0) return 0
  return Math.round((1000 * numerator) / denominator) / 10
}

function buildSalesOverviewModel({ rolling30d, prior30d, campaigns, daily }) {
  const sent30 = Math.max(0, Math.round(Number(rolling30d.emails_sent_count) || 0))
  const sentPrior = Math.max(0, Math.round(Number(prior30d.emails_sent_count) || 0))
  const replies30 = Math.max(
    0,
    Math.round(Number(rolling30d.reply_count_unique) || Number(rolling30d.reply_count) || 0)
  )
  const bounced = Math.max(0, Math.round(Number(rolling30d.bounced_count) || 0))
  const contacted = Math.max(0, Math.round(Number(rolling30d.contacted_count) || sent30))
  const interested = Math.max(0, Math.round(Number(rolling30d.total_interested) || 0))
  const meetings = Math.max(0, Math.round(Number(rolling30d.total_meeting_booked) || 0))
  const delivered = Math.max(0, sent30 - bounced)
  const opportunityValue = Math.max(
    0,
    Math.round(Number(rolling30d.total_opportunity_value) || 0)
  )
  const priorOpportunityValue = Math.max(
    0,
    Math.round(Number(prior30d.total_opportunity_value) || 0)
  )

  const mapped = campaigns.map((row) => {
    const meta = splitCampaignMeta(row.campaign_name || 'Campaign')
    return {
      id: row.campaign_id,
      name: row.campaign_name,
      status: mapInstantlySalesCampaignStatus(row.campaign_status),
      offer: meta.offer,
      list: meta.list,
      sent: Number(row.emails_sent_count) || 0,
      replies: Number(row.reply_count_unique) || 0,
      meetings: Number(row.total_opportunities) || 0,
      expectedRevenue: Number(row.total_opportunity_value) || 0
    }
  })

  return {
    source: 'instantly',
    kpis: {
      emailsSent: sent30,
      emailsSentDelta: pctDelta(sent30, sentPrior),
      liveOffers: mapped.filter((c) => c.status === 'live').length,
      replies: replies30,
      replyRate: ratePct(replies30, sent30),
      expectedRevenue: opportunityValue,
      expectedRevenueDelta: pctDelta(opportunityValue, priorOpportunityValue),
      meetingsBooked: meetings,
      bounceRate: ratePct(bounced, contacted || sent30),
      positiveReplyRate: ratePct(interested + meetings, delivered),
      contactsRemaining: 0
    },
    campaigns: mapped,
    series: daily.map((row) => ({
      date: row.date,
      sent: row.sent,
      opens: row.unique_opened || 0,
      replies: row.unique_replies || 0
    })),
    deals: mapped
      .filter((c) => c.meetings > 0)
      .map((c) => ({
        id: `opp-${c.id}`,
        company: c.name,
        value: c.expectedRevenue,
        stage: 'qualified'
      }))
  }
}

test('sales campaign status keeps completed distinct from paused', () => {
  assert.equal(mapInstantlySalesCampaignStatus(3), 'completed')
  assert.equal(mapInstantlySalesCampaignStatus(2), 'paused')
  assert.equal(mapInstantlySalesCampaignStatus(1), 'live')
})

test('splitCampaignMeta parses Instantly-style names', () => {
  assert.deepEqual(splitCampaignMeta('Gemelec | Residential Property Managers'), {
    list: 'Gemelec',
    offer: 'Residential Property Managers'
  })
  assert.deepEqual(splitCampaignMeta('Solo campaign'), {
    list: 'Instantly',
    offer: 'Solo campaign'
  })
})

test('buildSalesOverviewModel maps Instantly overview into KPIs', () => {
  const model = buildSalesOverviewModel({
    rolling30d: {
      emails_sent_count: 1675,
      reply_count_unique: 10,
      bounced_count: 33,
      contacted_count: 1591,
      total_interested: 5,
      total_meeting_booked: 0,
      total_opportunity_value: 5000
    },
    prior30d: {
      emails_sent_count: 1769,
      total_opportunity_value: 6000
    },
    campaigns: [
      {
        campaign_id: 'c1',
        campaign_name: 'Switchflow | Brokers | Pay Per Booked',
        campaign_status: 1,
        emails_sent_count: 441,
        reply_count_unique: 6,
        total_opportunities: 2,
        total_opportunity_value: 2000
      },
      {
        campaign_id: 'c2',
        campaign_name: 'Paused one',
        campaign_status: 2,
        emails_sent_count: 100,
        reply_count_unique: 1,
        total_opportunities: 0,
        total_opportunity_value: 0
      }
    ],
    daily: [
      { date: '2026-08-01', sent: 40, unique_opened: 0, unique_replies: 1 },
      { date: '2026-08-02', sent: 55, unique_opened: 0, unique_replies: 0 }
    ]
  })

  assert.equal(model.source, 'instantly')
  assert.equal(model.kpis.emailsSent, 1675)
  assert.equal(model.kpis.emailsSentDelta, pctDelta(1675, 1769))
  assert.equal(model.kpis.replies, 10)
  assert.equal(model.kpis.bounceRate, ratePct(33, 1591))
  assert.equal(model.kpis.expectedRevenue, 5000)
  assert.equal(model.kpis.positiveReplyRate, ratePct(5, 1642))
  assert.equal(model.campaigns[0].list, 'Switchflow')
  assert.equal(model.campaigns[0].offer, 'Brokers · Pay Per Booked')
  assert.equal(model.series.length, 2)
  assert.equal(model.deals.length, 1)
  assert.equal(model.deals[0].value, 2000)
})

test('Sales overview wires Instantly API + Australia map', () => {
  const overview = read('src/components/sales/SalesOverview.tsx')
  const map = read('src/components/sales/TargetingSuccessMap.tsx')
  const route = read('src/app/api/instantly/sales-overview/route.ts')
  const lib = read('src/lib/sales-overview.ts')
  const outline = read('src/lib/australia-outline.ts')

  assert.match(overview, /\/api\/instantly\/sales-overview/)
  assert.match(overview, /Live from Instantly/)
  assert.match(route, /loadSalesOverviewFromInstantly/)
  assert.match(route, /requirePortalAccess\(\{\s*operator:\s*true\s*\}\)/)
  assert.match(lib, /fetchInstantlyDailyCampaignAnalytics/)
  assert.match(lib, /buildSalesOverviewModel/)
  assert.match(map, /AUSTRALIA_OUTLINE_PATHS/)
  assert.match(map, /projectAustraliaLatLng/)
  assert.match(outline, /export const AUSTRALIA_OUTLINE_PATHS/)
  assert.match(outline, /export function projectAustraliaLatLng/)
})
