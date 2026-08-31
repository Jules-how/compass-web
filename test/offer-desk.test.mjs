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

function flattenOfferGallery(desk) {
  return [...desk.live, ...desk.testing, ...desk.retired]
}

function offerKeyFromPath(path) {
  const p = (path.split('?')[0] || path).replace(/\/+$/, '') || path
  if (p === '/sales/offers') return null
  const prefix = '/sales/offers/'
  if (!p.startsWith(prefix)) return null
  const key = decodeURIComponent(p.slice(prefix.length).split('/')[0] || '').trim()
  return key || null
}

function asStringList(value) {
  if (!Array.isArray(value)) return []
  return value.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean)
}

function parseOfferLock(value) {
  const empty = {
    icp: '',
    antiIcp: [],
    screen: [],
    machine: { capture: '', fill: '', convert: '' },
    walk: [],
    mechanism: '',
    category: '',
    crowd: '',
    verticalIn: [],
    verticalOut: [],
    vehicles: [],
    relevance: []
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return empty
  const machine =
    value.machine && typeof value.machine === 'object' && !Array.isArray(value.machine) ? value.machine : {}
  const vehicles = Array.isArray(value.vehicles)
    ? value.vehicles
        .filter((row) => row && typeof row === 'object')
        .map((row) => ({
          problem: typeof row.problem === 'string' ? row.problem.trim() : '',
          vehicle: typeof row.vehicle === 'string' ? row.vehicle.trim() : ''
        }))
        .filter((row) => row.problem || row.vehicle)
    : []
  const relevance = Array.isArray(value.relevance)
    ? value.relevance
        .filter((row) => row && typeof row === 'object' && typeof row.fact === 'string' && row.fact.trim())
        .map((row) => ({
          fact: row.fact.trim(),
          required: row.required === true,
          source: typeof row.source === 'string' ? row.source.trim() : ''
        }))
    : []
  return {
    ...empty,
    icp: typeof value.icp === 'string' ? value.icp.trim() : '',
    antiIcp: asStringList(value.antiIcp),
    screen: asStringList(value.screen),
    machine: {
      capture: typeof machine.capture === 'string' ? machine.capture.trim() : '',
      fill: typeof machine.fill === 'string' ? machine.fill.trim() : '',
      convert: typeof machine.convert === 'string' ? machine.convert.trim() : ''
    },
    walk: asStringList(value.walk),
    mechanism: typeof value.mechanism === 'string' ? value.mechanism.trim() : '',
    category: typeof value.category === 'string' ? value.category.trim() : '',
    crowd: typeof value.crowd === 'string' ? value.crowd.trim() : '',
    verticalIn: asStringList(value.verticalIn),
    verticalOut: asStringList(value.verticalOut),
    vehicles,
    relevance
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

  const gallery = flattenOfferGallery(desk)
  assert.deepEqual(
    gallery.map((card) => card.offer.gtm_status),
    ['live', 'testing', 'retired']
  )
  assert.equal(gallery[0].offer.offer_key, 'ai-receptionist-system')
})

test('offer gallery path and lock parse', () => {
  assert.equal(offerKeyFromPath('/sales/offers'), null)
  assert.equal(offerKeyFromPath('/sales/offers/'), null)
  assert.equal(offerKeyFromPath('/sales/offers/new'), 'new')
  assert.equal(offerKeyFromPath('/sales/offers/booked-jobs-system'), 'booked-jobs-system')
  assert.equal(offerKeyFromPath('/sales/offers/booked-jobs-system/?x=1'), 'booked-jobs-system')

  const parsed = parseOfferLock({
    icp: ' shops ',
    extra: 'ignored',
    mechanism: 'Bolt onto their number',
    verticalIn: ['plumbing', ''],
    vehicles: [{ problem: 'Missed calls', vehicle: 'Voice' }, { problem: '', vehicle: '' }],
    relevance: [{ fact: 'Published email', required: true, source: 'Maps' }, { fact: '  ' }]
  })
  assert.equal(parsed.mechanism, 'Bolt onto their number')
  assert.equal(parsed.icp, 'shops')
  assert.deepEqual(parsed.verticalIn, ['plumbing'])
  assert.deepEqual(parsed.vehicles, [{ problem: 'Missed calls', vehicle: 'Voice' }])
  assert.deepEqual(parsed.relevance, [{ fact: 'Published email', required: true, source: 'Maps' }])
  assert.equal(parsed.crowd, '')
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
  assert.match(ui, /xl:grid-cols-4/)
  assert.match(ui, /sales\/offers\/new/)
  assert.match(ui, /flattenOfferGallery/)
  assert.match(ui, /offerKeyFromPath/)
  assert.doesNotMatch(ui, /lg:grid-cols-2/)
  assert.doesNotMatch(ui, /switchflow-offer/)
  assert.doesNotMatch(ui, /Scoreboard is showed/)

  const interior = read('src/components/offers/OfferInterior.tsx')
  assert.match(interior, /Make live/)
  assert.match(interior, /Primary copy/)
  assert.match(interior, /Anti-ICP/)
  assert.match(interior, /Open copy library/)

  const nested = read('src/app/(console)/sales/offers/[offerKey]/page.tsx')
  assert.match(nested, /OperatorShell/)

  assert.match(desk, /flattenOfferGallery/)
  assert.match(desk, /mechanism/)
  assert.match(desk, /verticalIn/)
  assert.match(desk, /relevance/)

  const navKeep = read('src/components/ConsoleNav.tsx')
  assert.match(navKeep, /p\.startsWith\('\/sales\/offers\/'\)/)
  assert.doesNotMatch(keep, /Live and testing SKUs/)
})
