import { computeOutcomeMetrics, type OutcomeMetrics } from '@/lib/outbound-outcome-metrics'
import type { LeadTally } from '@/lib/campaign-wave'
import { normalizeProvenance, type OutboundOffer } from '@/lib/outbound-copy'

export const GTM_STATUSES = ['live', 'testing', 'retired'] as const
export type GtmStatus = (typeof GTM_STATUSES)[number]

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
}

export type OfferCampaignResult = {
  id: string
  name: string
  status: string
  instantlyCampaignId: string | null
  cohort: number
  positive: number
  meetings: number
  sent: number | null
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
    walk: []
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
    walk: asStringList(raw.walk)
  }
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
        return {
          id: campaign.id,
          name: campaign.name,
          status: campaign.status,
          instantlyCampaignId: instantlyId,
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

  return {
    live,
    testing,
    retired,
    unboundCampaigns,
    totals: {
      live: live.length,
      testing: testing.length,
      meetings: liveMeetings,
      positive: livePositive
    }
  }
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
    fill: 'Consented reactivation, then Google / LSA. After 30 days of capture data if they still want volume.',
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
  icp: 'Established shops that already buy inbound or need more of it, and lose the enquiry before it becomes a showed job.',
  antiIcp: [
    'CPL buyer who will not change answering',
    'Empty diary with no spend and no inbound',
    'Sparkies commercial BD',
    'Full-stack ads + web as the product'
  ],
  screen: [
    'Where do enquiries come from today (Google, LSA, Hipages, phone)?',
    'How fast do you call a new lead back?',
    'What happens when a call comes in while you are on a job?',
    'Will you leave routing and the calendar pointed at this path for 90 days?'
  ],
  machine: {
    capture: 'Inbound booking: overflow voice, miss SMS, calendar, handoff rules.',
    fill: 'Lead gen only after capture is closed, or in the same install if they already spend and leak.',
    convert: 'Speed-to-lead in minutes on new enquiries. Same conversion job as capture.'
  },
  walk: [
    'Wants 40 leads and will not talk about missed inbound or callback lag',
    'Will not give number or calendar access',
    'Success metric is cheapest CPL'
  ]
}
