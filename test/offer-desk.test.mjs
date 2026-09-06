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
    verticals: [],
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
  const verticals = Array.isArray(value.verticals)
    ? value.verticals
        .filter((row) => row && typeof row === 'object')
        .map((row) => ({
          key: typeof row.key === 'string' ? row.key.trim() : '',
          name: typeof row.name === 'string' ? row.name.trim() : '',
          status: typeof row.status === 'string' ? row.status.trim() : 'planned',
          hypothesis: typeof row.hypothesis === 'string' ? row.hypothesis.trim() : '',
          pain_wrapper: typeof row.pain_wrapper === 'string' ? row.pain_wrapper.trim() : '',
          list_spec: typeof row.list_spec === 'string' ? row.list_spec.trim() : '',
          notes: typeof row.notes === 'string' ? row.notes.trim() : ''
        }))
        .filter((row) => row.key || row.name)
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
    verticals,
    vehicles,
    relevance
  }
}

test('offer desk lanes split live testing retired and score bound campaigns', () => {
  const desk = assembleOfferDesk({
    offers: [
      { offer_key: 'booked-jobs-system', gtm_status: 'live', name: 'Fill and capture' },
      { offer_key: 'agency-ai-reporting', gtm_status: 'testing', name: 'Reporting' },
      { offer_key: 'ai-receptionist-system', gtm_status: 'retired', name: 'After-hours' }
    ],
    campaigns: [
      {
        id: 'c1',
        name: 'Sydney plumbers',
        status: 'active',
        offer_key: 'booked-jobs-system',
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
  assert.equal(gallery[0].offer.offer_key, 'booked-jobs-system')
})

test('test cells group offer × vertical × city and flag incomparable volume', () => {
  const EMPTY = '—'
  function firstTag(tags) {
    if (!Array.isArray(tags)) return EMPTY
    const tag = tags.map((item) => String(item).trim()).find(Boolean)
    return tag || EMPTY
  }
  function cellKey(offerKey, vertical, city) {
    return `${offerKey || 'unbound'}|${vertical || EMPTY}|${city || EMPTY}`
  }
  function assembleTestCells(input) {
    const instantlyById = input.instantlyById ?? {}
    const buckets = new Map()
    for (const campaign of input.campaigns) {
      const offerKey = (campaign.offer_key || '').trim()
      const vertical = firstTag(campaign.vertical_tags)
      const city = firstTag(campaign.location_tags)
      const key = cellKey(offerKey, vertical, city)
      const bucket = buckets.get(key)
      if (bucket) bucket.rows.push(campaign)
      else buckets.set(key, { offerKey, vertical, city, rows: [campaign] })
    }
    const cells = []
    for (const [key, bucket] of buckets) {
      let sent = null
      let sentKnown = false
      let positive = 0
      for (const campaign of bucket.rows) {
        positive += (input.tallies[campaign.id] || {}).positive || 0
        const instantlyId = (campaign.instantly_campaign_id || '').trim()
        const rowSent = instantlyId && instantlyById[instantlyId] ? instantlyById[instantlyId].sent : null
        if (typeof rowSent === 'number') {
          sent = (sent || 0) + rowSent
          sentKnown = true
        }
      }
      const flags = []
      if (!bucket.offerKey) flags.push('unbound')
      if (bucket.vertical === EMPTY) flags.push('no_vertical')
      if (bucket.city === EMPTY) flags.push('no_city')
      if (bucket.rows.length > 1) flags.push('multi_campaign')
      cells.push({
        key,
        offerKey: bucket.offerKey,
        vertical: bucket.vertical,
        city: bucket.city,
        campaignCount: bucket.rows.length,
        sent: sentKnown ? sent : null,
        positive,
        flags
      })
    }
    const siblingSent = new Map()
    for (const cell of cells) {
      if (cell.flags.includes('unbound') || cell.sent == null) continue
      const group = cell.offerKey
      const list = siblingSent.get(group) ?? []
      list.push(cell.sent)
      siblingSent.set(group, list)
    }
    for (const cell of cells) {
      if (cell.sent == null) continue
      const list = siblingSent.get(cell.offerKey) ?? []
      if (list.length < 2) continue
      const min = Math.min(...list)
      const max = Math.max(...list)
      if (min > 0 && max / min >= 2) cell.flags.push('volume_skew')
    }
    return cells
  }

  const cells = assembleTestCells({
    campaigns: [
      {
        id: 'a',
        offer_key: 'booked-jobs-system',
        vertical_tags: ['locksmith'],
        location_tags: ['sydney'],
        instantly_campaign_id: 'i1'
      },
      {
        id: 'b',
        offer_key: 'booked-jobs-system',
        vertical_tags: ['locksmith'],
        location_tags: ['melbourne'],
        instantly_campaign_id: 'i2'
      },
      {
        id: 'c',
        offer_key: 'booked-jobs-system',
        vertical_tags: ['locksmith'],
        location_tags: [],
        instantly_campaign_id: 'i3'
      },
      {
        id: 'd',
        offer_key: null,
        vertical_tags: ['clinics'],
        location_tags: ['sydney']
      }
    ],
    tallies: { a: { positive: 2 }, b: { positive: 1 }, c: { positive: 0 }, d: { positive: 0 } },
    instantlyById: { i1: { sent: 200 }, i2: { sent: 80 }, i3: { sent: 10 } }
  })

  const sydney = cells.find((c) => c.key === 'booked-jobs-system|locksmith|sydney')
  const melbourne = cells.find((c) => c.key === 'booked-jobs-system|locksmith|melbourne')
  const noCity = cells.find((c) => c.key === 'booked-jobs-system|locksmith|—')
  const unbound = cells.find((c) => c.key === 'unbound|clinics|sydney')
  assert.equal(sydney.sent, 200)
  assert.equal(sydney.positive, 2)
  assert.equal(melbourne.sent, 80)
  assert.ok(sydney.flags.includes('volume_skew'))
  assert.ok(melbourne.flags.includes('volume_skew'))
  assert.ok(noCity.flags.includes('no_city'))
  assert.ok(unbound.flags.includes('unbound'))
})

test('missing plan slots skip existing offer × vertical × city keys', () => {
  function slug(value) {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
  }
  function unique(values) {
    const out = []
    const seen = new Set()
    for (const raw of values) {
      const tag = slug(raw)
      if (!tag || seen.has(tag)) continue
      seen.add(tag)
      out.push(tag)
    }
    return out
  }
  function missingPlanSlots(offerKey, verticals, cities, existingKeys) {
    const have = new Set(existingKeys)
    const slots = []
    for (const vertical of unique(verticals)) {
      for (const city of unique(cities)) {
        const key = `${offerKey}|${vertical}|${city}`
        if (!have.has(key)) slots.push({ key, vertical, city })
      }
    }
    return slots
  }

  const missing = missingPlanSlots(
    'booked-jobs-system',
    ['locksmith', 'plumber'],
    ['sydney', 'melbourne'],
    ['booked-jobs-system|locksmith|sydney']
  )
  assert.equal(missing.length, 3)
  assert.deepEqual(
    missing.map((s) => s.key).sort(),
    [
      'booked-jobs-system|locksmith|melbourne',
      'booked-jobs-system|plumber|melbourne',
      'booked-jobs-system|plumber|sydney'
    ]
  )
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
    verticals: [
      {
        key: 'plumbing',
        name: 'Plumbing Contractors',
        status: 'testing',
        hypothesis: 'Miss emergency calls on tools',
        pain_wrapper: 'We answer plumber emergency calls',
        list_spec: 'Maps: plumbing contractors',
        notes: '0 positive replies on wave 1'
      }
    ],
    vehicles: [{ problem: 'Missed calls', vehicle: 'Voice' }, { problem: '', vehicle: '' }],
    relevance: [{ fact: 'Published email', required: true, source: 'Maps' }, { fact: '  ' }]
  })
  assert.equal(parsed.mechanism, 'Bolt onto their number')
  assert.equal(parsed.icp, 'shops')
  assert.deepEqual(parsed.verticalIn, ['plumbing'])
  assert.equal(parsed.verticals.length, 1)
  assert.equal(parsed.verticals[0].key, 'plumbing')
  assert.equal(parsed.verticals[0].status, 'testing')
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
  assert.match(desk, /assembleTestCells/)
  assert.match(desk, /testCellKey/)
  assert.match(desk, /BOOKED_JOBS_LOCK/)
  assert.match(desk, /MISSED_CALL_LOCK/)

  const api = read('src/app/api/offers/desk/route.ts')
  assert.match(api, /assembleOfferDesk/)
  const agent = read('src/app/api/agent/offers/desk/route.ts')
  assert.match(agent, /requireAgentAuth/)
  const cellsApi = read('src/app/api/offers/cells/route.ts')
  assert.match(cellsApi, /createMissingOfferCells/)
  const cellsAgent = read('src/app/api/agent/offers/cells/route.ts')
  assert.match(cellsAgent, /requireAgentAuth/)
  const plan = read('src/lib/offer-test-cells.ts')
  assert.match(plan, /missingPlanSlots/)
  const board = read('src/components/offers/TestCellsBoard.tsx')
  assert.match(board, /Create \$\{missing.length\} missing cell/)

  const ui = read('src/components/offers/OffersDesk.tsx')
  assert.match(ui, /New testing SKU/)
  assert.match(ui, /xl:grid-cols-4/)
  assert.match(ui, /sales\/offers\/new/)
  assert.match(ui, /flattenOfferGallery/)
  assert.match(ui, /offerKeyFromPath/)
  assert.match(ui, /TestCellsBoard/)
  assert.doesNotMatch(ui, /lg:grid-cols-2/)
  assert.doesNotMatch(ui, /switchflow-offer/)
  assert.doesNotMatch(ui, /Scoreboard is showed/)

  const interior = read('src/components/offers/OfferInterior.tsx')
  assert.match(interior, /Make live/)
  assert.match(interior, /Primary copy/)
  assert.match(interior, /Anti-ICP/)
  assert.match(interior, /Open copy library/)
  assert.match(interior, /EditableOfferTitle/)
  assert.match(interior, /OfferCellRows/)
  assert.match(ui, /EditableOfferTitle/)

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
