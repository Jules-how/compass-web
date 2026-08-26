import type { SupabaseClient } from '@supabase/supabase-js'

import {
  interestLabelForOutbound,
  interestSuppressionReason,
  isInstantlySuppressedOutbound,
  shouldOverwriteOutbound
} from '@/lib/instantly-leads-sync'
import { lookupCopyForInstantlyCampaign, recordOutreachTouch } from '@/lib/lead-outreach'
import { appendEvidence } from '@/lib/events'
import { leadStageFromOutbound } from '@/lib/pipeline-spine'

export type InstantlyWebhookPayload = {
  timestamp?: string
  event_type?: string
  workspace?: string
  campaign_id?: string
  campaign_name?: string
  lead_email?: string
  email?: string
  lead_id?: string
  id?: string
  email_account?: string
  firstName?: string
  lastName?: string
  first_name?: string
  last_name?: string
  companyName?: string
  company_name?: string
  phone?: string
  website?: string
  reply_subject?: string
  reply_text_snippet?: string
  [key: string]: unknown
}

export type InstantlyWebhookApplyResult = {
  ok: boolean
  skipped?: boolean
  reason?: string
  contactId?: string
  outboundStatus?: string
  eventType?: string
  inserted?: boolean
  updated?: boolean
}

function str(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

function normalizeEmail(email: string | null | undefined): string | null {
  const value = str(email)?.toLowerCase()
  return value || null
}

/** Map Instantly webhook event_type → Compass outbound_status. */
export function mapWebhookEventToOutboundStatus(eventType: string | null | undefined): string | null {
  switch ((eventType || '').trim().toLowerCase()) {
    case 'reply_received':
    case 'auto_reply_received':
    case 'lead_neutral':
      return 'replied'
    case 'lead_interested':
    case 'custom_label_any_positive':
      return 'interested'
    case 'lead_not_interested':
    case 'custom_label_any_negative':
      return 'not_interested'
    case 'lead_meeting_booked':
    case 'lead_meeting_completed':
      return 'meeting_booked'
    case 'lead_closed':
      return 'converted'
    case 'lead_out_of_office':
      return 'out_of_office'
    case 'lead_wrong_person':
      return 'wrong_person'
    case 'lead_unsubscribed':
    case 'email_bounced':
      return 'suppressed'
    case 'email_sent':
      return 'in_instantly'
    default:
      return null
  }
}

function webhookEvidenceType(eventType: string): string | null {
  switch (eventType.trim().toLowerCase()) {
    case 'email_sent':
      return 'email.sent'
    case 'reply_received':
    case 'auto_reply_received':
    case 'lead_neutral':
      return 'email.replied'
    case 'lead_interested':
    case 'custom_label_any_positive':
      return 'lead.interested'
    case 'lead_meeting_booked':
    case 'lead_meeting_completed':
      return 'lead.meeting_booked'
    case 'lead_closed':
      return 'lead.converted'
    case 'email_bounced':
      return 'email.bounced'
    case 'lead_unsubscribed':
      return 'lead.unsubscribed'
    default:
      return null
  }
}

function webhookSuppressionReason(outbound: string, eventType: string): string {
  switch (outbound) {
    case 'not_interested':
      return 'instantly_not_interested'
    case 'wrong_person':
      return 'instantly_wrong_person'
    case 'suppressed':
      if (eventType === 'lead_unsubscribed') return 'instantly_unsubscribed'
      if (eventType === 'email_bounced') return 'instantly_bounced'
      return 'instantly_suppressed'
    default:
      return interestSuppressionReason(null, null)
  }
}

function displayNameFromPayload(payload: InstantlyWebhookPayload, email: string | null): string {
  const first = str(payload.firstName) || str(payload.first_name)
  const last = str(payload.lastName) || str(payload.last_name)
  const joined = [first, last].filter(Boolean).join(' ')
  if (joined) return joined
  return email || str(payload.lead_id) || str(payload.id) || 'Instantly lead'
}

/**
 * Apply one Instantly webhook event into lead_contacts for Inbox Instantly.
 * Pull sync remains the nightly backstop; this is the real-time path.
 */
export async function applyInstantlyWebhookEvent(
  supabase: SupabaseClient,
  payload: InstantlyWebhookPayload
): Promise<InstantlyWebhookApplyResult> {
  const eventType = str(payload.event_type)
  const outbound = mapWebhookEventToOutboundStatus(eventType)
  if (!eventType || !outbound) {
    return { ok: true, skipped: true, reason: 'ignored_event', eventType: eventType || undefined }
  }

  const email = normalizeEmail(payload.lead_email || payload.email)
  const instantlyLeadId = str(payload.lead_id) || str(payload.id)
  if (!email && !instantlyLeadId) {
    return { ok: true, skipped: true, reason: 'missing_lead_identity', eventType }
  }

  const stamp = new Date().toISOString()
  const eventAt = str(payload.timestamp) || stamp
  const campaignId = str(payload.campaign_id)
  const campaignName = str(payload.campaign_name)
  const company = str(payload.companyName) || str(payload.company_name)
  const phone = str(payload.phone)
  const name = displayNameFromPayload(payload, email)
  const suppressed = isInstantlySuppressedOutbound(outbound)
  const suppressionReason = suppressed ? webhookSuppressionReason(outbound, eventType) : null

  let match: {
    id: string
    outbound_status: string | null
    suppression_reason: string | null
  } | null = null

  if (instantlyLeadId) {
    const { data, error } = await supabase
      .from('lead_contacts')
      .select('id,outbound_status,suppression_reason')
      .eq('instantly_lead_id', instantlyLeadId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (data) match = data
  }
  if (!match && email) {
    const { data, error } = await supabase
      .from('lead_contacts')
      .select('id,outbound_status,suppression_reason')
      .eq('email', email)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (data) match = data
  }

  const patch: Record<string, unknown> = {
    email,
    phone,
    company,
    source: 'instantly',
    outbound_status: outbound,
    interest_label: interestLabelForOutbound(outbound),
    lead_status_source: 'instantly_webhook',
    instantly_synced_at: stamp,
    last_outbound_at: eventAt,
    updated_at: stamp,
    mirrored_at: stamp,
    suppression_reason: suppressionReason,
    recontact_ok: suppressed ? 0 : 1
  }
  if (instantlyLeadId) patch.instantly_lead_id = instantlyLeadId
  if (campaignId) {
    patch.instantly_campaign_id = campaignId
    patch.instantly_campaign = campaignName
    patch.instantly_campaign_name = campaignName
  }
  if (!phone) delete patch.phone
  if (!company) delete patch.company
  if (!email) delete patch.email

  let contactId: string
  let inserted = false
  let updated = false

  if (match) {
    if (!shouldOverwriteOutbound(match.outbound_status, outbound)) {
      delete patch.outbound_status
      delete patch.interest_label
    }
    if (!suppressed && match.suppression_reason) {
      delete patch.suppression_reason
      delete patch.recontact_ok
    }
    const { error } = await supabase.from('lead_contacts').update(patch).eq('id', match.id)
    if (error) throw new Error(error.message)
    contactId = match.id
    updated = true
  } else {
    const row = {
      id: instantlyLeadId ? `inst-${instantlyLeadId}` : `inst-mail-${email}`,
      name,
      ...patch,
      created_at: stamp
    }
    const { error } = await supabase.from('lead_contacts').insert(row)
    if (error) throw new Error(error.message)
    contactId = row.id
    inserted = true
  }

  try {
    const linked = await lookupCopyForInstantlyCampaign(supabase, campaignId)
    await recordOutreachTouch(supabase, {
      contactId,
      contactedAt: eventAt,
      channel: 'email',
      campaignId: linked.campaignId,
      campaignName: linked.campaignName || campaignName,
      instantlyCampaignId: campaignId,
      copySnapshot: linked.copy,
      source: 'instantly_webhook'
    })
  } catch {
    // best-effort
  }

  const evidenceType = webhookEvidenceType(eventType)
  if (evidenceType) {
    try {
      const nativeId = `${eventType}:${instantlyLeadId || email || contactId}:${eventAt}`
      await appendEvidence(supabase, {
        source: 'instantly',
        type: evidenceType,
        lead_id: contactId,
        ts: eventAt,
        campaign: campaignId || campaignName || undefined,
        native_id: nativeId,
        payload: {
          event_type: eventType,
          email,
          campaign_id: campaignId,
          campaign_name: campaignName,
          outbound_status: outbound
        }
      })
      await supabase
        .from('lead_contacts')
        .update({
          pipeline_stage: leadStageFromOutbound(outbound),
          updated_at: stamp
        })
        .eq('id', contactId)
    } catch {
      // best-effort
    }
  }

  return {
    ok: true,
    contactId,
    outboundStatus: outbound,
    eventType,
    inserted,
    updated
  }
}
