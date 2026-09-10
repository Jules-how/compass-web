import type { SupabaseClient } from '@supabase/supabase-js'

import {
  copySnapshotFromSequence,
  outreachTouchId,
  type LeadOutreachTouch,
  type OutreachTouchCopy
} from '@/lib/recontact-eligibility'
import type { OutboundSequence } from '@/lib/outbound-copy'

export type RecordOutreachTouchInput = {
  contactId: string
  contactedAt: string
  channel?: string
  campaignId?: string | null
  campaignName?: string | null
  instantlyCampaignId?: string | null
  copySnapshot?: OutreachTouchCopy | null
  source?: string
  direction?: string
  outcome?: string
}

/**
 * Upsert a touch row. Idempotent on derived id (contact + campaign + day + source).
 */
export async function recordOutreachTouch(
  supabase: SupabaseClient,
  input: RecordOutreachTouchInput
): Promise<{ id: string; wrote: boolean }> {
  const baseId = outreachTouchId({
    contactId: input.contactId,
    instantlyCampaignId: input.instantlyCampaignId,
    contactedAt: input.contactedAt,
    source: input.source || 'instantly_sync'
  })
  const id = input.direction === 'inbound' ? `${baseId}-${Date.parse(input.contactedAt)}` : baseId
  const row = {
    id,
    contact_id: input.contactId,
    contacted_at: input.contactedAt,
    channel: input.channel || 'email',
    campaign_id: input.campaignId ?? null,
    campaign_name: input.campaignName ?? null,
    instantly_campaign_id: input.instantlyCampaignId ?? null,
    copy_snapshot: input.copySnapshot ?? null,
    source: input.source || 'instantly_sync',
    ...(input.direction ? { direction: input.direction } : {}),
    ...(input.outcome ? { outcome: input.outcome } : {}),
    ...(input.direction === 'inbound' ? { request_payload: { at_verified: true } } : {}),
    created_at: new Date().toISOString()
  }
  const { error } = await supabase.from('lead_outreach_touches').upsert(row, { onConflict: 'id' })
  if (error) {
    // Table may not exist yet in older envs — don't fail the parent sync.
    if (/does not exist|schema cache/i.test(error.message)) {
      return { id, wrote: false }
    }
    throw new Error(error.message)
  }
  return { id, wrote: true }
}

export async function listOutreachTouches(
  supabase: SupabaseClient,
  contactId: string,
  limit = 50
): Promise<LeadOutreachTouch[]> {
  const { data, error } = await supabase
    .from('lead_outreach_touches')
    .select(
      'id,contact_id,contacted_at,channel,campaign_id,campaign_name,instantly_campaign_id,copy_snapshot,source,created_at'
    )
    .eq('contact_id', contactId)
    .order('contacted_at', { ascending: false })
    .limit(limit)

  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) return []
    throw new Error(error.message)
  }
  return (data ?? []) as LeadOutreachTouch[]
}

/** Look up pipeline campaign copy bound to an Instantly campaign id. */
export async function lookupCopyForInstantlyCampaign(
  supabase: SupabaseClient,
  instantlyCampaignId: string | null | undefined
): Promise<{ campaignId: string | null; campaignName: string | null; copy: OutreachTouchCopy | null }> {
  if (!instantlyCampaignId?.trim()) {
    return { campaignId: null, campaignName: null, copy: null }
  }
  const { data, error } = await supabase
    .from('compass_pipeline_campaigns')
    .select('id,name,sequence_draft,cold_expression')
    .eq('instantly_campaign_id', instantlyCampaignId.trim())
    .limit(1)
    .maybeSingle()

  if (error || !data) {
    return { campaignId: null, campaignName: null, copy: null }
  }

  const fromSeq = copySnapshotFromSequence(data.sequence_draft as OutboundSequence | null)
  const cold = typeof data.cold_expression === 'string' ? data.cold_expression.trim() : null
  const copy: OutreachTouchCopy | null = fromSeq
    ? {
        ...fromSeq,
        cold_expression: fromSeq.cold_expression || cold,
        preview:
          fromSeq.preview ||
          [fromSeq.subject, cold].filter(Boolean).join(' — ').slice(0, 280) ||
          null
      }
    : cold
      ? { subject: null, opener: null, cold_expression: cold, cta: null, preview: cold.slice(0, 280) }
      : null

  return {
    campaignId: data.id as string,
    campaignName: (data.name as string) || null,
    copy
  }
}
