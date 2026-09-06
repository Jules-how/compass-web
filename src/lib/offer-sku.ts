import { computeOutcomeMetrics, type OutcomeMetrics } from '@/lib/outbound-outcome-metrics'
import type { LeadTally } from '@/lib/campaign-wave'
import { normalizeProvenance, type OutboundOffer } from '@/lib/outbound-copy'

export const GTM_STATUSES = ['live', 'testing', 'retired'] as const
export type GtmStatus = (typeof GTM_STATUSES)[number]

export type OfferVehicle = {
  problem: string
  vehicle: string
}

export type OfferRelevanceFact = {
  fact: string
  required: boolean
  source: string
}

export const VERTICAL_VARIANT_STATUSES = ['planned', 'testing', 'validated', 'killed'] as const
export type VerticalVariantStatus = (typeof VERTICAL_VARIANT_STATUSES)[number]

export type OfferVerticalVariant = {
  key: string
  name: string
  status: VerticalVariantStatus
  hypothesis: string
  pain_wrapper: string
  list_spec: string
  notes: string
}

export type OfferLock = {
  icp: string
  antiIcp: string[]
  screen: string[]
  machine: {
    capture: string
    fill: string
    convert: string
  }
  walk: string[]
  mechanism: string
  category: string
  crowd: string
  verticalIn: string[]
  verticalOut: string[]
  verticals: OfferVerticalVariant[]
  vehicles: OfferVehicle[]
  relevance: OfferRelevanceFact[]
}

export type OfferSkuFields = {
  gtm_status: GtmStatus
  one_sentence: string | null
  dream_outcome: string | null
  install_aud: number | null
  retainer_low_aud: number | null
  retainer_high_aud: number | null
  term_days: number | null
  guarantee: string | null
  lock: OfferLock
}

export type OfferSku = OutboundOffer & OfferSkuFields

export type OfferCampaignBind = {
  id: string
  name: string
  status: string
  offer_key?: string | null
  instantly_campaign_id?: string | null
  vertical_tags?: string[]
  location_tags?: string[]
  testing_variable?: string | null
  sample_size_target?: number | null
  expression_key?: string | null
  copy_status?: string | null
  hypothesis?: string | null
}

export type OfferCampaignResult = {
  id: string
  name: string
  status: string
  instantlyCampaignId: string | null
  verticalTags: string[]
  locationTags: string[]
  testingVariable: string | null
  sampleSizeTarget: number | null
  expressionKey: string | null
  copyStatus: string | null
  hypothesis: string | null
  cohort: number
  positive: number
  meetings: number
  sent: number | null
}

export const TEST_CELL_EMPTY = '—'

export type OfferTestCellFlag =
  | 'unbound'
  | 'no_vertical'
  | 'no_city'
  | 'mixed_variable'
  | 'multi_campaign'
  | 'volume_skew'
  | 'copy_split'

export type OfferTestCell = {
  key: string
  offerKey: string
  offerName: string
  gtmStatus: GtmStatus | 'unbound'
  vertical: string
  city: string
  testingVariable: string
  copyStatus: string
  expressionKey: string | null
  sampleSizeTarget: number | null
  campaigns: Array<{ id: string; name: string; status: string }>
  campaignCount: number
  cohort: number
  positive: number
  meetings: number
  sent: number | null
  positiveRate: number | null
  flags: OfferTestCellFlag[]
}

export type OfferDeskResults = {
  campaigns: number
  activeCampaigns: number
  cohort: number
  positive: number
  meetings: number
  sent: number | null
  outcomes: OutcomeMetrics | null
}

export type OfferDeskCard = {
  offer: OfferSku
  results: OfferDeskResults
  campaigns: OfferCampaignResult[]
}

export type OfferDeskModel = {
  live: OfferDeskCard[]
  testing: OfferDeskCard[]
  retired: OfferDeskCard[]
  unboundCampaigns: number
  cells: OfferTestCell[]
  totals: {
    live: number
    testing: number
    meetings: number
    positive: number
  }
}

const GTM_SET = new Set<string>(GTM_STATUSES)

export function emptyOfferLock(): OfferLock {
  return {
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
}

export function emptyOfferSkuFields(): OfferSkuFields {
  return {
    gtm_status: 'testing',
    one_sentence: null,
    dream_outcome: null,
    install_aud: null,
    retainer_low_aud: null,
    retainer_high_aud: null,
    term_days: null,
    guarantee: null,
    lock: emptyOfferLock()
  }
}

export function isGtmStatus(value: string): value is GtmStatus {
  return GTM_SET.has(value)
}

export function parseGtmStatus(value: unknown, archived = false): GtmStatus {
  if (typeof value === 'string' && isGtmStatus(value.trim())) return value.trim() as GtmStatus
  return archived ? 'retired' : 'testing'
}

export function parseMoneyAud(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''))
  if (!Number.isFinite(n) || n < 0 || n > 1_000_000) return null
  return Math.round(n * 100) / 100
}

export function parseTermDays(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n > 3650) return null
  return n
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
}

function asVehicles(value: unknown): OfferVehicle[] {
  if (!Array.isArray(value)) return []
  const rows: OfferVehicle[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const raw = item as Record<string, unknown>
    const problem = typeof raw.problem === 'string' ? raw.problem.trim() : ''
    const vehicle = typeof raw.vehicle === 'string' ? raw.vehicle.trim() : ''
    if (!problem && !vehicle) continue
    rows.push({ problem, vehicle })
  }
  return rows
}

function asRelevance(value: unknown): OfferRelevanceFact[] {
  if (!Array.isArray(value)) return []
  const rows: OfferRelevanceFact[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const raw = item as Record<string, unknown>
    const fact = typeof raw.fact === 'string' ? raw.fact.trim() : ''
    if (!fact) continue
    const source = typeof raw.source === 'string' ? raw.source.trim() : ''
    rows.push({ fact, required: raw.required === true, source })
  }
  return rows
}

function asVerticalVariants(value: unknown): OfferVerticalVariant[] {
  if (!Array.isArray(value)) return []
  const rows: OfferVerticalVariant[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const raw = item as Record<string, unknown>
    const name = typeof raw.name === 'string' ? raw.name.trim() : ''
    const key = typeof raw.key === 'string' && raw.key.trim() ? slugifyOfferKey(raw.key) : slugifyOfferKey(name)
    if (!key && !name) continue
    const statusRaw = typeof raw.status === 'string' ? raw.status.trim().toLowerCase() : ''
    const status: VerticalVariantStatus =
      statusRaw === 'validated' || statusRaw === 'killed' || statusRaw === 'testing'
        ? (statusRaw as VerticalVariantStatus)
        : 'planned'
    rows.push({
      key,
      name: name || key,
      status,
      hypothesis: typeof raw.hypothesis === 'string' ? raw.hypothesis.trim() : '',
      pain_wrapper: typeof raw.pain_wrapper === 'string' ? raw.pain_wrapper.trim() : '',
      list_spec: typeof raw.list_spec === 'string' ? raw.list_spec.trim() : '',
      notes: typeof raw.notes === 'string' ? raw.notes.trim() : ''
    })
  }
  return rows
}

export function parseOfferLock(value: unknown): OfferLock {
  const empty = emptyOfferLock()
  if (!value || typeof value !== 'object' || Array.isArray(value)) return empty
  const raw = value as Record<string, unknown>
  const machine =
    raw.machine && typeof raw.machine === 'object' && !Array.isArray(raw.machine)
      ? (raw.machine as Record<string, unknown>)
      : {}
  return {
    icp: typeof raw.icp === 'string' ? raw.icp.trim() : '',
    antiIcp: asStringList(raw.antiIcp ?? raw.anti_icp),
    screen: asStringList(raw.screen),
    machine: {
      capture: typeof machine.capture === 'string' ? machine.capture.trim() : '',
      fill: typeof machine.fill === 'string' ? machine.fill.trim() : '',
      convert: typeof machine.convert === 'string' ? machine.convert.trim() : ''
    },
    walk: asStringList(raw.walk),
    mechanism: typeof raw.mechanism === 'string' ? raw.mechanism.trim() : '',
    category: typeof raw.category === 'string' ? raw.category.trim() : '',
    crowd: typeof raw.crowd === 'string' ? raw.crowd.trim() : '',
    verticalIn: asStringList(raw.verticalIn ?? raw.vertical_in),
    verticalOut: asStringList(raw.verticalOut ?? raw.vertical_out),
    verticals: asVerticalVariants(raw.verticals),
    vehicles: asVehicles(raw.vehicles),
    relevance: asRelevance(raw.relevance)
  }
}

export function flattenOfferGallery(desk: Pick<OfferDeskModel, 'live' | 'testing' | 'retired'>): OfferDeskCard[] {
  return [...desk.live, ...desk.testing, ...desk.retired]
}

export function offerKeyFromPath(path: string): string | null {
  const p = (path.split('?')[0] || path).replace(/\/+$/, '') || path
  if (p === '/sales/offers') return null
  const prefix = '/sales/offers/'
  if (!p.startsWith(prefix)) return null
  const key = decodeURIComponent(p.slice(prefix.length).split('/')[0] || '').trim()
  return key || null
}

export function commercialLocked(offer: {
  install_aud: number | null
  retainer_low_aud: number | null
  retainer_high_aud: number | null
  term_days: number | null
}): boolean {
  return (
    offer.install_aud != null ||
    offer.retainer_low_aud != null ||
    offer.retainer_high_aud != null ||
    offer.term_days != null
  )
}

export function slugifyOfferKey(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return slug || `offer-${Date.now().toString(36)}`
}

export function projectOfferSku(row: Record<string, unknown>): OfferSku {
  const archived = row.archived === true
  return {
    id: String(row.id ?? ''),
    offer_key: String(row.offer_key ?? ''),
    name: String(row.name ?? ''),
    pack_summary: String(row.pack_summary ?? ''),
    positioning_line: typeof row.positioning_line === 'string' ? row.positioning_line : null,
    vertical_tags: Array.isArray(row.vertical_tags) ? (row.vertical_tags as string[]) : [],
    location_tags: Array.isArray(row.location_tags) ? (row.location_tags as string[]) : [],
    sort_order: typeof row.sort_order === 'number' ? row.sort_order : 100,
    archived,
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
    provenance: normalizeProvenance(row.provenance),
    source_creator: typeof row.source_creator === 'string' ? row.source_creator : null,
    source_file: typeof row.source_file === 'string' ? row.source_file : null,
    gtm_status: parseGtmStatus(row.gtm_status, archived),
    one_sentence: typeof row.one_sentence === 'string' && row.one_sentence.trim() ? row.one_sentence.trim() : null,
    dream_outcome:
      typeof row.dream_outcome === 'string' && row.dream_outcome.trim() ? row.dream_outcome.trim() : null,
    install_aud: parseMoneyAud(row.install_aud),
    retainer_low_aud: parseMoneyAud(row.retainer_low_aud),
    retainer_high_aud: parseMoneyAud(row.retainer_high_aud),
    term_days: parseTermDays(row.term_days),
    guarantee: typeof row.guarantee === 'string' && row.guarantee.trim() ? row.guarantee.trim() : null,
    lock: parseOfferLock(row.lock)
  }
}

export type SkuFieldPatch =
  | { ok: true; patch: Record<string, unknown> }
  | { ok: false; error: string }

function optionalText(value: unknown): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value !== 'string') return undefined
  return value.trim() || null
}

/** Merge SKU fields from a PATCH/POST body onto an insert or update row. */
export function applyOfferSkuFields(
  body: Record<string, unknown>,
  target: Record<string, unknown>
): SkuFieldPatch {
  if (body.gtm_status !== undefined) {
    if (typeof body.gtm_status !== 'string' || !isGtmStatus(body.gtm_status.trim())) {
      return { ok: false, error: 'gtm_status_invalid' }
    }
    const status = body.gtm_status.trim() as GtmStatus
    target.gtm_status = status
    target.archived = status === 'retired'
  }
  const one = optionalText(body.one_sentence)
  if (one !== undefined) target.one_sentence = one
  const dream = optionalText(body.dream_outcome)
  if (dream !== undefined) target.dream_outcome = dream
  const guarantee = optionalText(body.guarantee)
  if (guarantee !== undefined) target.guarantee = guarantee
  const sourceFile = optionalText(body.source_file)
  if (sourceFile !== undefined) target.source_file = sourceFile
  if (body.install_aud !== undefined) {
    const n = body.install_aud === null || body.install_aud === '' ? null : parseMoneyAud(body.install_aud)
    if (body.install_aud !== null && body.install_aud !== '' && n == null) {
      return { ok: false, error: 'install_aud_invalid' }
    }
    target.install_aud = n
  }
  if (body.retainer_low_aud !== undefined) {
    const n =
      body.retainer_low_aud === null || body.retainer_low_aud === ''
        ? null
        : parseMoneyAud(body.retainer_low_aud)
    if (body.retainer_low_aud !== null && body.retainer_low_aud !== '' && n == null) {
      return { ok: false, error: 'retainer_low_aud_invalid' }
    }
    target.retainer_low_aud = n
  }
  if (body.retainer_high_aud !== undefined) {
    const n =
      body.retainer_high_aud === null || body.retainer_high_aud === ''
        ? null
        : parseMoneyAud(body.retainer_high_aud)
    if (body.retainer_high_aud !== null && body.retainer_high_aud !== '' && n == null) {
      return { ok: false, error: 'retainer_high_aud_invalid' }
    }
    target.retainer_high_aud = n
  }
  if (body.term_days !== undefined) {
    const n = body.term_days === null || body.term_days === '' ? null : parseTermDays(body.term_days)
    if (body.term_days !== null && body.term_days !== '' && n == null) {
      return { ok: false, error: 'term_days_invalid' }
    }
    target.term_days = n
  }
  if (body.lock !== undefined) {
    target.lock = parseOfferLock(body.lock)
  }
  return { ok: true, patch: target }
}

function isActiveCampaign(status: string): boolean {
  const s = status.trim().toLowerCase()
  return s === 'active' || s === 'live'
}

function emptyTally(): LeadTally {
  return { cohort: 0, positive: 0, meetings: 0, openers: 0 }
}

function sumTally(into: LeadTally, add: LeadTally) {
  into.cohort += add.cohort
  into.positive += add.positive
  into.meetings += add.meetings
  into.openers += add.openers
}

export function assembleOfferDesk(input: {
  offers: OfferSku[]
  campaigns: OfferCampaignBind[]
  tallies: Record<string, LeadTally>
  instantlyById?: Record<string, { sent: number }>
}): OfferDeskModel {
  const instantlyById = input.instantlyById ?? {}
  const byKey = new Map<string, OfferCampaignBind[]>()
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

  const cards: OfferDeskCard[] = input.offers
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
    .map((offer) => {
      const bound = byKey.get(offer.offer_key) ?? []
      const tally = emptyTally()
      let sentSum = 0
      let sentKnown = false
      const campaigns: OfferCampaignResult[] = bound.map((campaign) => {
        const rowTally = input.tallies[campaign.id] ?? emptyTally()
        sumTally(tally, rowTally)
        const instantlyId = (campaign.instantly_campaign_id || '').trim() || null
        const sent = instantlyId && instantlyById[instantlyId] ? instantlyById[instantlyId].sent : null
        if (typeof sent === 'number') {
          sentSum += sent
          sentKnown = true
        }
        const verticalTags = Array.isArray(campaign.vertical_tags) ? campaign.vertical_tags : []
        const locationTags = Array.isArray(campaign.location_tags) ? campaign.location_tags : []
        return {
          id: campaign.id,
          name: campaign.name,
          status: campaign.status,
          instantlyCampaignId: instantlyId,
          verticalTags,
          locationTags,
          testingVariable: campaign.testing_variable?.trim() || null,
          sampleSizeTarget:
            typeof campaign.sample_size_target === 'number' ? campaign.sample_size_target : null,
          expressionKey: campaign.expression_key?.trim() || null,
          copyStatus: campaign.copy_status?.trim() || null,
          hypothesis: campaign.hypothesis?.trim() || null,
          cohort: rowTally.cohort,
          positive: rowTally.positive,
          meetings: rowTally.meetings,
          sent
        }
      })
      const sent = sentKnown ? sentSum : null
      const outcomes =
        sent != null
          ? computeOutcomeMetrics({ sent, bounced: 0 }, { positive: tally.positive, meetings: tally.meetings })
          : null
      return {
        offer,
        campaigns,
        results: {
          campaigns: bound.length,
          activeCampaigns: bound.filter((row) => isActiveCampaign(row.status)).length,
          cohort: tally.cohort,
          positive: tally.positive,
          meetings: tally.meetings,
          sent,
          outcomes
        }
      }
    })

  const live = cards.filter((card) => card.offer.gtm_status === 'live')
  const testing = cards.filter((card) => card.offer.gtm_status === 'testing')
  const retired = cards.filter((card) => card.offer.gtm_status === 'retired')
  const liveMeetings = live.reduce((sum, card) => sum + card.results.meetings, 0)
  const livePositive = live.reduce((sum, card) => sum + card.results.positive, 0)

  const cells = assembleTestCells(input)

  return {
    live,
    testing,
    retired,
    unboundCampaigns,
    cells,
    totals: {
      live: live.length,
      testing: testing.length,
      meetings: liveMeetings,
      positive: livePositive
    }
  }
}

export function firstCampaignTag(tags?: string[] | null): string {
  if (!Array.isArray(tags)) return TEST_CELL_EMPTY
  const tag = tags.map((item) => item.trim()).find(Boolean)
  return tag || TEST_CELL_EMPTY
}

export function testCellKey(offerKey: string, vertical: string, city: string): string {
  return `${offerKey || 'unbound'}|${vertical || TEST_CELL_EMPTY}|${city || TEST_CELL_EMPTY}`
}

function uniqueOrMixed(values: string[]): { value: string; mixed: boolean } {
  const uniq = [...new Set(values.map((item) => item.trim()).filter(Boolean))]
  if (uniq.length === 0) return { value: 'none', mixed: false }
  if (uniq.length === 1) return { value: uniq[0], mixed: false }
  return { value: 'mixed', mixed: true }
}

export function assembleTestCells(input: {
  offers: OfferSku[]
  campaigns: OfferCampaignBind[]
  tallies: Record<string, LeadTally>
  instantlyById?: Record<string, { sent: number }>
}): OfferTestCell[] {
  const instantlyById = input.instantlyById ?? {}
  const offerName = new Map(input.offers.map((offer) => [offer.offer_key, offer.name]))
  const offerStatus = new Map(input.offers.map((offer) => [offer.offer_key, offer.gtm_status]))
  const buckets = new Map<
    string,
    {
      offerKey: string
      vertical: string
      city: string
      rows: OfferCampaignBind[]
    }
  >()

  for (const campaign of input.campaigns) {
    const offerKey = (campaign.offer_key || '').trim()
    const vertical = firstCampaignTag(campaign.vertical_tags)
    const city = firstCampaignTag(campaign.location_tags)
    const key = testCellKey(offerKey, vertical, city)
    const bucket = buckets.get(key)
    if (bucket) {
      bucket.rows.push(campaign)
    } else {
      buckets.set(key, { offerKey, vertical, city, rows: [campaign] })
    }
  }

  const cells: OfferTestCell[] = []
  for (const [key, bucket] of buckets) {
    const tally = emptyTally()
    let sentSum = 0
    let sentKnown = false
    const campaigns = bucket.rows.map((campaign) => {
      sumTally(tally, input.tallies[campaign.id] ?? emptyTally())
      const instantlyId = (campaign.instantly_campaign_id || '').trim()
      const sent = instantlyId && instantlyById[instantlyId] ? instantlyById[instantlyId].sent : null
      if (typeof sent === 'number') {
        sentSum += sent
        sentKnown = true
      }
      return { id: campaign.id, name: campaign.name, status: campaign.status }
    })
    const variable = uniqueOrMixed(bucket.rows.map((row) => row.testing_variable || 'none'))
    const copy = uniqueOrMixed(bucket.rows.map((row) => row.copy_status || 'none'))
    const expression = uniqueOrMixed(bucket.rows.map((row) => row.expression_key || ''))
    const targets = bucket.rows
      .map((row) => row.sample_size_target)
      .filter((n): n is number => typeof n === 'number' && Number.isFinite(n))
    const sent = sentKnown ? sentSum : null
    const flags: OfferTestCellFlag[] = []
    if (!bucket.offerKey) flags.push('unbound')
    if (bucket.vertical === TEST_CELL_EMPTY) flags.push('no_vertical')
    if (bucket.city === TEST_CELL_EMPTY) flags.push('no_city')
    if (variable.mixed) flags.push('mixed_variable')
    if (campaigns.length > 1) flags.push('multi_campaign')
    cells.push({
      key,
      offerKey: bucket.offerKey,
      offerName: offerName.get(bucket.offerKey) || (bucket.offerKey ? bucket.offerKey : 'Unbound'),
      gtmStatus: offerStatus.get(bucket.offerKey) ?? 'unbound',
      vertical: bucket.vertical,
      city: bucket.city,
      testingVariable: variable.value,
      copyStatus: copy.value,
      expressionKey: expression.mixed ? 'mixed' : expression.value || null,
      sampleSizeTarget: targets.length === 1 ? targets[0] : null,
      campaigns,
      campaignCount: campaigns.length,
      cohort: tally.cohort,
      positive: tally.positive,
      meetings: tally.meetings,
      sent,
      positiveRate: sent != null && sent > 0 ? Math.round((1000 * tally.positive) / sent) / 10 : null,
      flags
    })
  }

  const siblingSent = new Map<string, number[]>()
  for (const cell of cells) {
    if (cell.flags.includes('unbound') || cell.sent == null) continue
    const group = `${cell.offerKey}|${cell.testingVariable}`
    const list = siblingSent.get(group) ?? []
    list.push(cell.sent)
    siblingSent.set(group, list)
  }
  for (const cell of cells) {
    if (cell.sent == null) continue
    const list = siblingSent.get(`${cell.offerKey}|${cell.testingVariable}`) ?? []
    if (list.length < 2) continue
    const min = Math.min(...list)
    const max = Math.max(...list)
    if (min > 0 && max / min >= 2) cell.flags.push('volume_skew')
  }

  const siblingCopy = new Map<string, Set<string>>()
  for (const cell of cells) {
    if (cell.flags.includes('unbound')) continue
    if (cell.city === TEST_CELL_EMPTY || cell.vertical === TEST_CELL_EMPTY) continue
    const token = `${cell.expressionKey || ''}|${cell.copyStatus}`
    const group = `${cell.offerKey}|${cell.testingVariable}`
    const set = siblingCopy.get(group) ?? new Set<string>()
    set.add(token)
    siblingCopy.set(group, set)
  }
  for (const cell of cells) {
    const set = siblingCopy.get(`${cell.offerKey}|${cell.testingVariable}`)
    if (set && set.size > 1) cell.flags.push('copy_split')
  }

  return cells.sort((a, b) => {
    const offer = a.offerName.localeCompare(b.offerName)
    if (offer) return offer
    const vertical = a.vertical.localeCompare(b.vertical)
    if (vertical) return vertical
    return a.city.localeCompare(b.city)
  })
}

export function indexInstantlySent(
  campaigns: Array<{ id?: string; sent?: number }> | null | undefined
): Record<string, { sent: number }> {
  const map: Record<string, { sent: number }> = {}
  for (const campaign of campaigns ?? []) {
    const id = (campaign.id || '').trim()
    if (!id) continue
    map[id] = { sent: Math.max(0, Math.round(Number(campaign.sent) || 0)) }
  }
  return map
}

export const MISSED_CALL_LOCK: OfferLock = {
  ...emptyOfferLock(),
  icp: 'Established residential trades whose phone already rings and who lose jobs while they are on the tools.',
  antiIcp: [
    'Solo tradie with a quiet phone',
    'Pitch is only I need more leads',
    'Commercial tender / sparkies BD',
    'New ABN / green shop',
    'Will not divert the public number'
  ],
  screen: [
    'What happens when a call comes in while you are on a job?',
    'Last month, how many enquiries did you not call back the same day?',
    'After-hours: voicemail, divert, or nobody?',
    'Will you leave the public number pointed at this path for 90 days?'
  ],
  machine: {
    capture: 'Voice on their number for overflow / after hours. SMS on miss or form. Book into their calendar.',
    fill: 'Consented reactivation, then Google Ads. After 30 days of capture data if they still want volume.',
    convert: 'Landing page only if paid traffic or booking UX is the bottleneck. Never the first SKU.'
  },
  walk: [
    'Quiet phone',
    'CPL as the success metric',
    'Franchise HQ',
    'No lawful published email'
  ]
}

export const BOOKED_JOBS_LOCK: OfferLock = {
  ...emptyOfferLock(),
  icp: 'Owner-led residential trades in major AU cities, 2 to 8 vans, that already pay for demand or will fund Google, and that lose book-now jobs to voicemail, slow callback, or empty slots. Price is a guide; quote from named GP times extra jobs (or leaked jobs).',
  antiIcp: [
    'Quiet phone and will not fund Google',
    'Wants leads with no capture (ads into voicemail)',
    'CPL or lead volume as the scoreboard',
    'Sparkies commercial BD',
    '60-person contractor, franchise, 1800 desk',
    'Will not point number and forms at the path',
    'Tilers, kitchens, cleaning, handyman',
    'Website, reactivation, or cold email as the product',
    'Meta as month-one fill for non-visual book-now work',
    'Search or LSA into a unit whose cost per showed sits at or above contribution',
    'Cafe economics (carry too thin for the work)'
  ],
  screen: [
    'What do you already pay for demand (Google Ads, Hipages, nothing)? If nothing, will you fund Google Ads at a floor we name today after a Keyword Planner check on your territory?',
    'When a new lead comes in (call or form), what happens in the first 10 minutes, including after hours?',
    'Last month, how many enquiries did you not action the same day?',
    'Typical job this month. Named contribution, not revenue. Extra jobs they can take, or leaked jobs last month if capture-only. Carry = contribution times that count. Quote at or under carry; use the guide when carry clears it. Fail fill if Planner cost per showed is at or above contribution. Walk cafe economics.',
    'Will you point the public number and forms at this booking path for 30 days, and let Google run into that path only after capture is on?'
  ],
  machine: {
    capture:
      'Stage 1, required first. Email/SMS speed-to-lead, after-hours speed-to-lead, after-hours voice that books. Overflow on their number. Calendar. Handoff. About 48 hours. Not nurture. Not the product by itself.',
    fill: 'Stage 2: Google Search emergency/local/high-intent into the live path, built paused in their account, enabled after review. They pay media. Kill switch if enquiries do not book. Stage 3: Meta for planned/proof/aspirational only after Google is booking. Shoot bonus only when Meta is on. Not Email 1.',
    convert:
      'Landing page only if paid traffic or booking UX is the bottleneck. Website rebuild, lead reactivation, and cold email sold to the shop are out of scope. Never the first conversation.'
  },
  walk: [
    'Franchise, 1800, store, FM, tiler in the name',
    'No published email after site extract + verify',
    'Wrong in-trade for this campaign',
    'CPL buyer who will not change answering',
    'Cafe economics (carry too thin for the work)',
    'Search or LSA when cost per showed sits on or above contribution'
  ],
  mechanism:
    'Most shops buy more leads and leave voicemail, or tighten the phone and never buy dedicated demand. Extra leads walk; empty weeks stay empty. We tighten capture first, then point Google Search at that line, then Meta for planned work once the line is booking. Showed jobs, not CPL. Fees are a guide; this shop\'s GP sets the quote.',
  category: 'Demand in, showed job out. Not an ads shop. Not a receptionist shop. Not “fill and capture” as a brand.',
  crowd:
    'Owner-led residential trades in major AU cities, 2 to 8 vans, owner can say yes this week, that want more booked work and will fund Google Search or already pay for demand. Quote from carry, not a locked sticker.',
  verticalIn: ['plumber', 'hvac', 'electrical', 'locksmith', 'roofing', 'pest'],
  verticalOut: ['tilers', 'kitchens', 'cleaning', 'handyman'],
  vehicles: [
    { problem: 'Call while on a job goes to voicemail', vehicle: 'Overflow voice on their public number' },
    { problem: 'After hours is nobody', vehicle: 'After hours voice + SMS' },
    { problem: 'Form or Hipages lead, callback tomorrow, job gone', vehicle: 'Speed-to-lead SMS on miss or form' },
    { problem: 'Google ads into voicemail', vehicle: 'Capture on before Search enables. Kill switch if it does not book.' },
    { problem: 'Empty weeks, will fund demand', vehicle: 'Google Search emergency / local into the live path' },
    { problem: 'Planned / proof / high-ticket Search will not buy', vehicle: 'Meta after Google is booking. Shoot bonus when Meta is on.' },
    { problem: 'Unit cannot carry the guide retainer', vehicle: 'Quote from carry. Capture-only until fill unit passes. Walk cafe economics.' },
    { problem: 'Do not want a robot quoting licensed work', vehicle: 'Handoff script. Human for anything licensed.' },
    { problem: 'Do not know if ads work', vehicle: 'Weekly note: new, missed, booked, showed. Metric is showed jobs.' },
    { problem: 'No-shows', vehicle: 'Factual appointment SMS. No promo copy.' },
    { problem: 'Website / reactivation / outbound as the product', vehicle: 'Walk. Out of scope.' }
  ],
  relevance: [
    { fact: 'Published work email', required: true, source: 'Site or Maps. Never invent.' },
    { fact: 'Trading name', required: true, source: 'Maps' },
    { fact: 'Suburb', required: true, source: 'Maps / address' },
    { fact: 'Trade on the in-table for this campaign', required: true, source: 'Maps category' },
    { fact: 'Demand proxy (reviews or years trading or visible Google Ads/Hipages)', required: true, source: 'Maps, site' },
    { fact: 'Paid demand (Hipages, Google Ads, Meta Ads)', required: false, source: 'Site extract, not Origami' },
    { fact: 'Hours / close time / after hours claim', required: false, source: 'Maps hours' },
    { fact: 'Specialty', required: false, source: 'Services' }
  ]
}
