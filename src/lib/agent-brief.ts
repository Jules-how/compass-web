import type { SupabaseClient } from '@supabase/supabase-js'

import { loadHomeGlance } from '@/lib/ad-sync'
import type { ColdEmailGlance } from '@/lib/home-demo-data'
import { loadSyncSnapshot } from '@/lib/sync-snapshots'

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
  /** One-line operator hint for agents — keep prompts short. */
  hint: string
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

  const [adsGlance, instantlySnap, lastSync, pipelineRows, total, replied, interested, meetingBooked, inInstantly, needsReview] =
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

  const hintParts: string[] = []
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
    hint: hintParts.join(' · ')
  }
}
