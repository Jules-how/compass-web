import type { SupabaseClient } from '@supabase/supabase-js'

import type { CompassCampaign } from '@/lib/campaigns'
import { listEvidence, type EvidenceEventRow } from '@/lib/events'
import { enrichOutboundCampaignFactors } from '@/lib/outbound-factor-performance'
import {
  buildOutboundBoard,
  fetchInstantlyCampaignAnalytics,
  fetchInstantlyDailyCampaignAnalytics,
  getInstantlyTimezone,
  rollingWindowDates,
  resolveInstantlyApiKey,
  type InstantlyCampaignAnalytics
} from '@/lib/instantly'
import { computeOutcomeMetrics } from '@/lib/outbound-outcome-metrics'
import { normalizeProvenance } from '@/lib/outbound-copy'

export const COMPONENT_WINDOWS = ['7d', '30d', 'all'] as const
export type ComponentWindow = (typeof COMPONENT_WINDOWS)[number]

export const COMPONENT_GRAINS = [
  'vertical',
  'offer',
  'opener_kind',
  'cta',
  'subject',
  'length',
  'research_kind'
] as const
export type ComponentGrain = (typeof COMPONENT_GRAINS)[number]

export type ComponentStatRow = {
  id: string
  grain: ComponentGrain
  key: string
  window: ComponentWindow
  campaign_ids: string[]
  sent: number
  delivered: number
  replies: number
  positive: number
  meetings: number
  positive_rate: number
  meetings_per_100: number
  n_campaigns: number
  updated_at: string
}

const MIN_CONFIDENCE_DELIVERED = 200

type MutableBucket = {
  grain: ComponentGrain
  key: string
  window: ComponentWindow
  campaignIds: Set<string>
  sent: number
  bounced: number
  replies: number
  positive: number
  meetings: number
}

function statId(grain: ComponentGrain, key: string, window: ComponentWindow): string {
  return `cs:${grain}:${encodeURIComponent(key)}:${window}`
}

function windowSince(window: ComponentWindow, timeZone: string): string | null {
  if (window === 'all') return null
  const days = window === '7d' ? 7 : 30
  const { start } = rollingWindowDates(days, timeZone)
  return `${start}T00:00:00.000Z`
}

function inWindow(ts: string, since: string | null): boolean {
  if (!since) return true
  return Date.parse(ts) >= Date.parse(since)
}

function subjectFromCampaign(bind: CompassCampaign | null): string {
  const seq = bind?.sequence_draft
  const email = seq?.steps?.find((s) => s.kind === 'email') || seq?.steps?.[0]
  const subject = (email?.subject || '').replace(/\s+/g, ' ').trim()
  if (!subject) return '—'
  return subject.length > 80 ? `${subject.slice(0, 77)}…` : subject
}

function provenanceSuffix(bind: CompassCampaign | null, provenanceMap: Map<string, string>): string {
  const structure = (bind?.structure_id || '').trim()
  if (structure && provenanceMap.has(structure)) {
    const p = provenanceMap.get(structure)
    return p === 'source' ? ' · source' : p === 'yours' ? ' · yours' : ''
  }
  return ''
}

function campaignFactorKey(
  campaign: ReturnType<typeof enrichOutboundCampaignFactors>,
  grain: ComponentGrain,
  bind: CompassCampaign | null,
  provenanceMap: Map<string, string>
): string {
  if (grain === 'vertical') {
    return (bind?.vertical_tags?.[0] || campaign.vertical || '—').trim() || '—'
  }
  if (grain === 'offer') {
    return campaign.offer || campaign.offerKey || '—'
  }
  if (grain === 'cta') {
    const base = campaign.ctaType || campaign.cta || '—'
    return `${base}${provenanceSuffix(bind, provenanceMap)}`
  }
  if (grain === 'subject') {
    return `${subjectFromCampaign(bind)}${provenanceSuffix(bind, provenanceMap)}`
  }
  if (grain === 'length') {
    return campaign.lengthBand || '—'
  }
  return '—'
}

function addToBucket(
  buckets: Map<string, MutableBucket>,
  grain: ComponentGrain,
  key: string,
  window: ComponentWindow,
  patch: {
    campaignId?: string
    sent?: number
    bounced?: number
    replies?: number
    positive?: number
    meetings?: number
  }
) {
  const id = `${grain}:${key}:${window}`
  const cur =
    buckets.get(id) ??
    ({
      grain,
      key,
      window,
      campaignIds: new Set<string>(),
      sent: 0,
      bounced: 0,
      replies: 0,
      positive: 0,
      meetings: 0
    } satisfies MutableBucket)

  if (patch.campaignId) cur.campaignIds.add(patch.campaignId)
  cur.sent += patch.sent ?? 0
  cur.bounced += patch.bounced ?? 0
  cur.replies += patch.replies ?? 0
  cur.positive += patch.positive ?? 0
  cur.meetings += patch.meetings ?? 0
  buckets.set(id, cur)
}

function finalizeBuckets(buckets: Map<string, MutableBucket>, stamp: string): ComponentStatRow[] {
  const rows: ComponentStatRow[] = []
  for (const bucket of buckets.values()) {
    const outcome = computeOutcomeMetrics(
      { sent: bucket.sent, bounced: bucket.bounced },
      { positive: bucket.positive, meetings: bucket.meetings }
    )
    rows.push({
      id: statId(bucket.grain, bucket.key, bucket.window),
      grain: bucket.grain,
      key: bucket.key,
      window: bucket.window,
      campaign_ids: [...bucket.campaignIds],
      sent: bucket.sent,
      delivered: outcome.delivered,
      replies: bucket.replies,
      positive: outcome.positive,
      meetings: outcome.meetings,
      positive_rate: outcome.positiveRate,
      meetings_per_100: outcome.meetingsPer100,
      n_campaigns: bucket.campaignIds.size,
      updated_at: stamp
    })
  }
  return rows
}

async function loadProvenanceMap(supabase: SupabaseClient): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const { data } = await supabase.from('compass_outbound_structures').select('id,provenance')
  for (const row of data ?? []) {
    map.set(String(row.id), normalizeProvenance(row.provenance))
  }
  return map
}

async function loadPipelineCampaigns(supabase: SupabaseClient): Promise<CompassCampaign[]> {
  const { data, error } = await supabase
    .from('compass_pipeline_campaigns')
    .select(
      'id,name,status,instantly_campaign_id,offer_key,structure_id,cta_type,vertical_tags,location_tags,cold_expression,expression_key,sequence_draft'
    )
    .not('instantly_campaign_id', 'is', null)
  if (error) throw new Error(error.message)
  return (data ?? []) as CompassCampaign[]
}

async function loadOfferNames(supabase: SupabaseClient): Promise<Record<string, string>> {
  const { data } = await supabase.from('compass_outbound_offers').select('id,title')
  const out: Record<string, string> = {}
  for (const row of data ?? []) {
    out[String(row.id)] = String(row.title || row.id)
  }
  return out
}

function countLeadOutcomes(
  events: EvidenceEventRow[],
  leadId: string,
  since: string | null
): { replies: number; positive: number; meetings: number } {
  let replies = 0
  let positive = 0
  let meetings = 0
  for (const event of events) {
    if (event.lead_id !== leadId) continue
    if (!inWindow(event.ts, since)) continue
    if (event.type === 'email.replied') replies += 1
    if (event.type === 'lead.interested') positive += 1
    if (event.type === 'lead.meeting_booked') meetings += 1
  }
  return { replies, positive, meetings }
}

export function rollupLeadGrainFromEvents(input: {
  leads: Array<{
    id: string
    opener_kind?: string | null
    lead_facts?: Array<{ kind?: string }> | null
  }>
  events: EvidenceEventRow[]
  grain: 'opener_kind' | 'research_kind'
  window: ComponentWindow
  since: string | null
}): Map<string, MutableBucket> {
  const buckets = new Map<string, MutableBucket>()
  for (const lead of input.leads) {
    const key =
      input.grain === 'opener_kind'
        ? (lead.opener_kind || 'none').trim() || 'none'
        : (lead.lead_facts?.[0]?.kind || 'none').trim() || 'none'
    const outcomes = countLeadOutcomes(input.events, lead.id, input.since)
    if (outcomes.replies + outcomes.positive + outcomes.meetings <= 0) continue
    addToBucket(buckets, input.grain, key, input.window, {
      replies: outcomes.replies,
      positive: outcomes.positive,
      meetings: outcomes.meetings,
      sent: outcomes.replies > 0 ? 1 : 0,
      bounced: 0
    })
  }
  return buckets
}

export async function recomputeComponentStats(
  supabase: SupabaseClient,
  options?: { apiKey?: string | null; campaigns?: InstantlyCampaignAnalytics[] }
): Promise<{ rows: number }> {
  const timeZone = getInstantlyTimezone()
  const stamp = new Date().toISOString()
  const apiKey = options?.apiKey ?? (await resolveInstantlyApiKey(supabase))
  const [pipeline, offerNames, provenanceMap, events] = await Promise.all([
    loadPipelineCampaigns(supabase),
    loadOfferNames(supabase),
    loadProvenanceMap(supabase),
    listEvidence(supabase, { since: '1970-01-01T00:00:00.000Z' })
  ])

  let analytics = options?.campaigns ?? []
  if (analytics.length === 0 && apiKey) {
    analytics = await fetchInstantlyCampaignAnalytics(apiKey)
  }

  const board = buildOutboundBoard(analytics)
  const enriched = [...board.live, ...board.history].map((c) =>
    enrichOutboundCampaignFactors(c, pipeline, offerNames)
  )

  const buckets = new Map<string, MutableBucket>()

  for (const window of COMPONENT_WINDOWS) {
    const since = windowSince(window, timeZone)

    for (const campaign of enriched) {
      const bind = pipeline.find((p) => p.instantly_campaign_id === campaign.id) ?? null
      let sent = 0
      let bounced = 0

      if (window === 'all') {
        sent = campaign.sendCount
        bounced = campaign.bouncedCount || 0
      } else if (apiKey && since) {
        const { end } = rollingWindowDates(window === '7d' ? 7 : 30, timeZone)
        const daily = await fetchInstantlyDailyCampaignAnalytics(
          apiKey,
          since.slice(0, 10),
          end,
          campaign.id
        )
        sent = daily.reduce((sum, d) => sum + (Number(d.sent) || 0), 0)
      }

      const campaignEvents = events.filter(
        (e) => e.campaign === campaign.id && inWindow(e.ts, since)
      )
      let replies = 0
      let positive = 0
      let meetings = 0
      for (const event of campaignEvents) {
        if (event.type === 'email.replied') replies += 1
        if (event.type === 'lead.interested') positive += 1
        if (event.type === 'lead.meeting_booked') meetings += 1
      }

      if (sent <= 0 && replies + positive + meetings <= 0) continue

      for (const grain of ['vertical', 'offer', 'cta', 'subject', 'length'] as const) {
        const key = campaignFactorKey(campaign, grain, bind, provenanceMap)
        addToBucket(buckets, grain, key, window, {
          campaignId: campaign.id,
          sent,
          bounced,
          replies,
          positive,
          meetings
        })
      }
    }

    const { data: leadRows } = await supabase
      .from('lead_contacts')
      .select('id,opener_kind,lead_facts')
      .not('outbound_status', 'eq', 'uncontacted')
      .limit(5000)

    for (const grain of ['opener_kind', 'research_kind'] as const) {
      const leadBuckets = rollupLeadGrainFromEvents({
        leads: (leadRows ?? []) as Array<{
          id: string
          opener_kind?: string | null
          lead_facts?: Array<{ kind?: string }> | null
        }>,
        events,
        grain,
        window,
        since
      })
      for (const [id, bucket] of leadBuckets) {
        buckets.set(id, bucket)
      }
    }
  }

  const rows = finalizeBuckets(buckets, stamp)
  if (rows.length > 0) {
    const { error } = await supabase.from('compass_component_stats').upsert(rows, {
      onConflict: 'grain,key,window'
    })
    if (error) throw new Error(error.message)
  }

  return { rows: rows.length }
}

export async function listComponentStats(
  supabase: SupabaseClient,
  options?: { grain?: ComponentGrain; window?: ComponentWindow }
): Promise<ComponentStatRow[]> {
  let query = supabase
    .from('compass_component_stats')
    .select(
      'id,grain,key,window,campaign_ids,sent,delivered,replies,positive,meetings,positive_rate,meetings_per_100,n_campaigns,updated_at'
    )
  if (options?.grain) query = query.eq('grain', options.grain)
  if (options?.window) query = query.eq('window', options.window)

  const { data, error } = await query
  if (error) throw new Error(error.message)

  const rows = (data ?? []) as ComponentStatRow[]
  return rows.sort(
    (a, b) =>
      b.meetings_per_100 - a.meetings_per_100 ||
      b.positive_rate - a.positive_rate ||
      b.delivered - a.delivered
  )
}

export function isLowConfidence(row: Pick<ComponentStatRow, 'delivered'>): boolean {
  return row.delivered < MIN_CONFIDENCE_DELIVERED
}

export { MIN_CONFIDENCE_DELIVERED }
