import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function read(rel) {
  return readFileSync(resolve(root, rel), 'utf8')
}

function ratePct(part, whole) {
  if (whole <= 0) return 0
  return Math.round((1000 * part) / whole) / 10
}

function computeOutcomeMetrics(volume, counts) {
  const sent = Math.max(0, volume.sent)
  const bounced = Math.max(0, volume.bounced)
  const delivered = Math.max(0, sent - bounced)
  const positive = Math.max(0, counts.positive)
  const meetings = Math.max(0, counts.meetings)
  return {
    delivered,
    positive,
    meetings,
    positiveRate: ratePct(positive, delivered),
    meetingsPer100: delivered > 0 ? Math.round((1000 * meetings) / delivered) / 10 : 0
  }
}

function assembleOfferDesk(input) {
  const instantlyById = input.instantlyById ?? {}
  const byKey = new Map()
  let unboundCampaigns = 0
  for (const campaign of input.campaigns) {
    const key = (campaign.offer_key || '').trim()
    if (!key) {
      unboundCampaigns += 1
      continue
    }
    const list = byKey.get(key) ?? []
    list.push(campaign)
    byKey.set(key, list)
  }

  const cards = input.offers.map((offer) => {
    const bound = byKey.get(offer.offer_key) ?? []
    const tally = { cohort: 0, positive: 0, meetings: 0 }
    let sentSum = 0
    let sentKnown = false
    for (const campaign of bound) {
      const rowTally = input.tallies[campaign.id] ?? { cohort: 0, positive: 0, meetings: 0 }
      tally.cohort += rowTally.cohort
      tally.positive += rowTally.positive
      tally.meetings += rowTally.meetings
      const instantlyId = (campaign.instantly_campaign_id || '').trim() || null
      const sent = instantlyId && instantlyById[instantlyId] ? instantlyById[instantlyId].sent : null
      if (typeof sent === 'number') {
        sentSum += sent
        sentKnown = true
      }
    }
    const sent = sentKnown ? sentSum : null
    return {
      offer,
      results: {
        campaigns: bound.length,
        activeCampaigns: bound.filter((row) => row.status === 'active').length,
        cohort: tally.cohort,
        positive: tally.positive,
        meetings: tally.meetings,
        sent,
        outcomes:
          sent != null
            ? computeOutcomeMetrics({ sent, bounced: 0 }, { positive: tally.positive, meetings: tally.meetings })
            : null
      }
    }
  })

  const live = cards.filter((card) => card.offer.gtm_status === 'live')
  const testing = cards.filter((card) => card.offer.gtm_status === 'testing')
  const retired = cards.filter((card) => card.offer.gtm_status === 'retired')
  return {
    live,
    testing,
    retired,
    unboundCampaigns,
    totals: {
      live: live.length,
      testing: testing.length,
      meetings: live.reduce((sum, card) => sum + card.results.meetings, 0),
      positive: live.reduce((sum, card) => sum + card.results.positive, 0)
    }
  }
}

test('offer desk lanes split live testing retired and score bound campaigns', () => {
  const desk = assembleOfferDesk({
    offers: [
      { offer_key: 'ai-receptionist-system', gtm_status: 'live', name: 'After-hours' },
      { offer_key: 'booked-jobs-system', gtm_status: 'testing', name: 'Booked jobs' },
      { offer_key: 'growth-system', gtm_status: 'retired', name: 'Growth' }
    ],
    campaigns: [
      {
        id: 'c1',
        name: 'Sydney plumbers',
        status: 'active',
        offer_key: 'ai-receptionist-system',
        instantly_campaign_id: 'inst-1'
      },
      {
        id: 'c2',
        name: 'Unbound',
        status: 'draft',
        offer_key: null,
        instantly_campaign_id: null
      }
    ],
    tallies: {
      c1: { cohort: 120, positive: 6, meetings: 2 }
    },
    instantlyById: { 'inst-1': { sent: 200 } }
  })

  assert.equal(desk.totals.live, 1)
  assert.equal(desk.totals.testing, 1)
  assert.equal(desk.unboundCampaigns, 1)
  assert.equal(desk.totals.meetings, 2)
  assert.equal(desk.live[0].results.sent, 200)
  assert.equal(desk.live[0].results.positive, 6)
  assert.equal(desk.live[0].results.outcomes.delivered, 200)
  assert.equal(desk.testing[0].results.campaigns, 0)
  assert.equal(desk.retired.length, 1)
})

test('offer sku desk is wired in Compass not markdown', () => {
  const migration = read('supabase/migrations/0055_offer_sku_desk.sql')
  assert.match(migration, /gtm_status/)
  assert.match(migration, /booked-jobs-system/)
  assert.match(migration, /ai-receptionist-system/)
  assert.match(migration, /CHECK \(gtm_status IN \('live', 'testing', 'retired'\)\)/)

  const nav = read('src/components/NavLinks.tsx')
  assert.match(nav, /sales\/offers/)
  assert.match(nav, /OffersIcon/)
  assert.match(nav, /pathname\.startsWith\('\/sales\/offers'\)/)

  const keep = read('src/components/ConsoleHomeInboxKeepAlive.tsx')
  assert.match(keep, /OffersDesk/)
  assert.match(keep, /showOffers/)

  const page = read('src/app/(console)/sales/offers/page.tsx')
  assert.match(page, /OperatorShell/)

  const desk = read('src/lib/offer-sku.ts')
  assert.match(desk, /assembleOfferDesk/)
  assert.match(desk, /BOOKED_JOBS_LOCK/)
  assert.match(desk, /MISSED_CALL_LOCK/)

  const api = read('src/app/api/offers/desk/route.ts')
  assert.match(api, /assembleOfferDesk/)
  const agent = read('src/app/api/agent/offers/desk/route.ts')
  assert.match(agent, /requireAgentAuth/)

  const ui = read('src/components/offers/OffersDesk.tsx')
  assert.match(ui, /New testing SKU/)
  assert.match(ui, /Make live/)
  assert.match(ui, /lg:grid-cols-2/)
  assert.doesNotMatch(ui, /switchflow-offer/)
  assert.doesNotMatch(ui, /Scoreboard is showed/)
})
