import type { SupabaseClient } from '@supabase/supabase-js'

import { loadHomeGlance } from '@/lib/ad-sync'
import type { ColdEmailGlance } from '@/lib/home-demo-data'
import { loadSyncSnapshot } from '@/lib/sync-snapshots'
import type { MorningWavePayload } from '@/lib/wave-morning'
import { loadMorningWavePayload } from '@/lib/wave-morning-server'

export type AgentCurrentWave = {
  campaignId: string | null
  campaignName: string | null
  trade: string | null
  cluster: string | null
  uncontactedRemaining: number
  lastImportAt: string | null
}

export type AgentBrief = {
  generatedAt: string
  lastSyncAt: string | null
  ads: {
    source: 'live' | 'demo'
    syncedAt: string | null
    connectedAccounts: number
    spendToday: number
    spendDelta: number
    roas: number
    cpa: number
    topCreatives: Array<{
      name: string
      channel: string
      spend: number
      roas: number
      status: string
    }>
  }
  instantly: {
    source: 'live' | 'missing'
    syncedAt: string | null
    emailsSentToday: number
    repliesWaiting: number
    meetingsBooked: number
    replyRate: number
    campaigns: Array<{
      id: string
      name: string
      status: string
      sent: number
      replies: number
      progress: number
    }>
  }
  leads: {
    total: number
    replied: number
    interested: number
    meetingBooked: number
    inInstantly: number
    needsReview: number
  }
  pipeline: {
    activeCampaigns: number
    campaigns: Array<{
      id: string
      name: string
      status: string
      health: string
      instantlyCampaignId: string | null
    }>
  }
  /** Live targeting ledger. Not markdown. */
  currentWave: AgentCurrentWave
  morningWave: MorningWavePayload | null
  /** One-line operator hint for agents — keep prompts short. */
  hint: string
}

export type WaveCampaignPick = {
  id: string
  name: string
  status: string
  priority: number
  vertical_tags?: string[] | null
  location_tags?: string[] | null
}

export type WaveLeadPick = {
  vertical?: string | null
  cohort_tag?: string | null
  outbound_status?: string | null
}

const FOCUS_STATUS_RANK = ['active', 'planned', 'draft', 'paused'] as const

function modeOf(values: Array<string | null | undefined>): string | null {
  const counts = new Map<string, number>()
  for (const raw of values) {
    const value = (raw || '').trim()
    if (!value) continue
    counts.set(value, (counts.get(value) || 0) + 1)
  }
  let best: string | null = null
  let n = 0
  for (const [value, count] of counts) {
    if (count > n) {
      best = value
      n = count
    }
  }
  return best
}

export function isUncontactedOutbound(status: string | null | undefined): boolean {
  const value = (status || '').trim()
  return value === '' || value === 'uncontacted'
}

export function pickFocusCampaign(campaigns: WaveCampaignPick[]): WaveCampaignPick | null {
  if (campaigns.length === 0) return null
  return [...campaigns].sort((a, b) => {
    const aRank = FOCUS_STATUS_RANK.indexOf(a.status as (typeof FOCUS_STATUS_RANK)[number])
    const bRank = FOCUS_STATUS_RANK.indexOf(b.status as (typeof FOCUS_STATUS_RANK)[number])
    const aOrder = aRank === -1 ? 99 : aRank
    const bOrder = bRank === -1 ? 99 : bRank
    if (aOrder !== bOrder) return aOrder - bOrder
    return (b.priority ?? 0) - (a.priority ?? 0)
  })[0]
}

export function deriveCurrentWave(input: {
  campaign: WaveCampaignPick | null
  leads: WaveLeadPick[]
  lastImportAt: string | null
}): AgentCurrentWave {
  const campaign = input.campaign
  const tradeFromTags = (campaign?.vertical_tags ?? []).map((t) => String(t).trim()).find(Boolean) || null
  const clusterFromTags = (campaign?.location_tags ?? []).map((t) => String(t).trim()).find(Boolean) || null
  return {
    campaignId: campaign?.id ?? null,
    campaignName: campaign?.name ?? null,
    trade: tradeFromTags || modeOf(input.leads.map((row) => row.vertical)),
    cluster: clusterFromTags || modeOf(input.leads.map((row) => row.cohort_tag)),
    uncontactedRemaining: input.leads.filter((row) => isUncontactedOutbound(row.outbound_status)).length,
    lastImportAt: input.lastImportAt
  }
}

async function countExact(
  supabase: SupabaseClient,
  apply?: (q: {
    eq: (column: string, value: string) => unknown
    or: (filters: string) => unknown
  }) => unknown
): Promise<number> {
  const base = supabase.from('lead_contacts').select('id', { count: 'exact', head: true }) as unknown as {
    eq: (column: string, value: string) => unknown
    or: (filters: string) => unknown
  } & PromiseLike<{ count: number | null; error: unknown }>
  const result = (await (apply ? apply(base) : base)) as {
    count: number | null
    error: unknown
  }
  if (result?.error) return 0
  return result?.count ?? 0
}

/**
 * Compact operator brief for Cursor agents. Prefer this over dumping tables —
 * ~1–2KB JSON, enough to plan strategy without burning tokens.
 */
export async function buildAgentBrief(supabase: SupabaseClient): Promise<AgentBrief> {
  const generatedAt = new Date().toISOString()

  const [adsGlance, instantlySnap, lastSync, pipelineRows, focusCampaigns, lastBatch, total, replied, interested, meetingBooked, inInstantly, needsReview] =
    await Promise.all([
      loadHomeGlance(supabase),
      loadSyncSnapshot<ColdEmailGlance>(supabase, 'instantly_cold_email'),
      loadSyncSnapshot<{ ranAt?: string }>(supabase, 'last_daily_sync'),
      supabase
        .from('compass_pipeline_campaigns')
        .select('id,name,status,health,instantly_campaign_id')
        .neq('status', 'archived')
        .order('priority', { ascending: false })
        .limit(12),
      supabase
        .from('compass_pipeline_campaigns')
        .select('id,name,status,priority,vertical_tags,location_tags')
        .neq('status', 'archived')
        .neq('status', 'cancelled')
        .neq('status', 'completed')
        .order('priority', { ascending: false })
        .limit(12),
      supabase
        .from('lead_import_batches')
        .select('created_at')
        .order('created_at', { ascending: false })
        .limit(1),
      countExact(supabase),
      countExact(supabase, (q) => q.eq('outbound_status', 'replied')),
      countExact(supabase, (q) => q.eq('outbound_status', 'interested')),
      countExact(supabase, (q) => q.eq('outbound_status', 'meeting_booked')),
      countExact(supabase, (q) =>
        q.or(
          'outbound_status.eq.in_instantly,instantly_lead_id.not.is.null,instantly_campaign_id.not.is.null'
        )
      ),
      countExact(supabase, (q) =>
        q.or('outbound_status.eq.needs_review,outbound_status.eq.needs-review')
      )
    ])

  const cold = instantlySnap?.payload
  const instantlyCampaigns = (cold?.campaigns ?? []).slice(0, 5).map((c) => ({
    id: c.id,
    name: c.name,
    status: c.status,
    sent: c.sent,
    replies: c.replies,
    progress: c.progress
  }))

  const pipeline = (pipelineRows.data ?? []).map((row) => ({
    id: String(row.id),
    name: String(row.name),
    status: String(row.status ?? 'planned'),
    health: String(row.health ?? 'no_updates'),
    instantlyCampaignId: row.instantly_campaign_id ? String(row.instantly_campaign_id) : null
  }))

  const topCreatives = (adsGlance.glance.creatives ?? []).slice(0, 5).map((c) => ({
    name: c.name,
    channel: c.channel,
    spend: c.spend,
    roas: c.roas,
    status: c.status
  }))

  const lastImportAt =
    lastBatch.data?.[0]?.created_at != null ? String(lastBatch.data[0].created_at) : null
  const focus = pickFocusCampaign(
    (focusCampaigns.data ?? []).map((row) => ({
      id: String(row.id),
      name: String(row.name ?? ''),
      status: String(row.status ?? 'planned'),
      priority: Number(row.priority ?? 0),
      vertical_tags: Array.isArray(row.vertical_tags) ? row.vertical_tags.map(String) : [],
      location_tags: Array.isArray(row.location_tags) ? row.location_tags.map(String) : []
    }))
  )

  let waveLeads: WaveLeadPick[] = []
  if (focus) {
    const cohort = await supabase
      .from('lead_contacts')
      .select('vertical,cohort_tag,outbound_status')
      .eq('pipeline_campaign_id', focus.id)
      .limit(8000)
    if (!cohort.error) waveLeads = cohort.data ?? []
  } else {
    const loose = await supabase
      .from('lead_contacts')
      .select('vertical,cohort_tag,outbound_status')
      .or('outbound_status.eq.uncontacted,outbound_status.is.null')
      .limit(2000)
    if (!loose.error) waveLeads = loose.data ?? []
  }

  const currentWave = deriveCurrentWave({
    campaign: focus,
    leads: waveLeads,
    lastImportAt
  })

  const hintParts: string[] = []
  if (currentWave.trade || currentWave.cluster) {
    const bits = [currentWave.trade, currentWave.cluster].filter(Boolean)
    hintParts.push(
      `${bits.join(' · ')}${currentWave.uncontactedRemaining ? ` · ${currentWave.uncontactedRemaining} uncontacted` : ''}`
    )
  }
  if ((cold?.repliesWaiting ?? 0) > 0) {
    hintParts.push(`${cold!.repliesWaiting} Instantly replies waiting`)
  }
  if (interested + meetingBooked > 0) {
    hintParts.push(`${interested + meetingBooked} hot outbound leads`)
  }
  if (adsGlance.source === 'demo') {
    hintParts.push('ads glance is demo — connect/sync ad accounts')
  } else if (adsGlance.glance.spendToday > 0) {
    hintParts.push(`ads spend today $${Math.round(adsGlance.glance.spendToday)}`)
  }
  if (hintParts.length === 0) hintParts.push('no urgent outbound signals')

  const morningWave = await loadMorningWavePayload(supabase, cold?.repliesWaiting ?? 0).catch(
    () => null
  )
  if (morningWave && !morningWave.landUnlocked) {
    hintParts.unshift('Home brief not accepted — do not land live remaining')
  }

  return {
    generatedAt,
    lastSyncAt: lastSync?.payload?.ranAt || lastSync?.syncedAt || null,
    ads: {
      source: adsGlance.source,
      syncedAt: adsGlance.syncedAt,
      connectedAccounts: adsGlance.connectedAccounts,
      spendToday: adsGlance.glance.spendToday,
      spendDelta: adsGlance.glance.spendDelta,
      roas: adsGlance.glance.roas,
      cpa: adsGlance.glance.cpa,
      topCreatives
    },
    instantly: {
      source: cold ? 'live' : 'missing',
      syncedAt: instantlySnap?.syncedAt ?? null,
      emailsSentToday: cold?.emailsSentToday ?? 0,
      repliesWaiting: cold?.repliesWaiting ?? 0,
      meetingsBooked: cold?.meetingsBooked ?? 0,
      replyRate: cold?.replyRate ?? 0,
      campaigns: instantlyCampaigns
    },
    leads: {
      total,
      replied,
      interested,
      meetingBooked,
      inInstantly,
      needsReview
    },
    pipeline: {
      activeCampaigns: pipeline.length,
      campaigns: pipeline
    },
    currentWave,
    morningWave,
    hint: hintParts.join(' · ')
  }
}
