/**
 * 90-day recontact cooldown for outbound leads.
 * Progress grows from last_outbound_at → 100% when the lead is safe to email again.
 */

export const RECONTACT_COOLDOWN_DAYS = 90
export const RECONTACT_COOLDOWN_MS = RECONTACT_COOLDOWN_DAYS * 24 * 60 * 60 * 1000

export type RecontactLane =
  | 'never_contacted'
  | 'cooling'
  | 'ready'
  | 'blocked'
  | 'hot'

export type RecontactEligibility = {
  lane: RecontactLane
  /** 0–100; null when never contacted or blocked without a clock. */
  progressPercent: number | null
  daysSinceContact: number | null
  daysRemaining: number | null
  eligibleAt: string | null
  lastContactAt: string | null
  blockedReason: string | null
  /** True when progress is 100% and the lead may enter a new cold campaign. */
  recommendNewCampaign: boolean
  label: string
  detail: string
}

export type RecontactLeadFields = {
  outbound_status?: string | null
  recontact_ok?: number | null
  suppression_reason?: string | null
  last_outbound_at?: string | null
  interest_label?: string | null
}

const HOT_STATUSES = new Set([
  'replied',
  'interested',
  'booked',
  'meeting_booked',
  'converted'
])

const MS_PER_DAY = 24 * 60 * 60 * 1000

export function isRecontactBlocked(lead: RecontactLeadFields): {
  blocked: boolean
  reason: string | null
} {
  if (lead.outbound_status === 'suppressed' || lead.suppression_reason) {
    return {
      blocked: true,
      reason: lead.suppression_reason?.trim() || 'suppressed'
    }
  }
  if (lead.recontact_ok === 0) {
    return { blocked: true, reason: 'recontact_blocked' }
  }
  return { blocked: false, reason: null }
}

export function isHotOutboundStatus(status: string | null | undefined): boolean {
  if (!status) return false
  return HOT_STATUSES.has(status.trim().toLowerCase())
}

/** ISO cutoff: contacts at or before this timestamp are past the 90-day window. */
export function recontactCutoffIso(now = new Date()): string {
  return new Date(now.getTime() - RECONTACT_COOLDOWN_MS).toISOString()
}

export function computeRecontactEligibility(
  lead: RecontactLeadFields,
  now = new Date()
): RecontactEligibility {
  const block = isRecontactBlocked(lead)
  const lastRaw = lead.last_outbound_at?.trim() || null
  const lastMs = lastRaw ? Date.parse(lastRaw) : NaN
  const hasLast = Boolean(lastRaw) && !Number.isNaN(lastMs)

  if (block.blocked) {
    return {
      lane: 'blocked',
      progressPercent: null,
      daysSinceContact: hasLast ? daysBetween(lastMs, now.getTime()) : null,
      daysRemaining: null,
      eligibleAt: null,
      lastContactAt: lastRaw,
      blockedReason: block.reason,
      recommendNewCampaign: false,
      label: 'Do not contact',
      detail: blockReasonLabel(block.reason)
    }
  }

  if (!hasLast) {
    return {
      lane: 'never_contacted',
      progressPercent: null,
      daysSinceContact: null,
      daysRemaining: null,
      eligibleAt: null,
      lastContactAt: null,
      blockedReason: null,
      recommendNewCampaign: false,
      label: 'Never contacted',
      detail: 'No outbound send recorded yet.'
    }
  }

  const elapsed = Math.max(0, now.getTime() - lastMs)
  const daysSince = Math.floor(elapsed / MS_PER_DAY)
  const progress = Math.min(100, Math.round((elapsed / RECONTACT_COOLDOWN_MS) * 100))
  const remainingMs = Math.max(0, RECONTACT_COOLDOWN_MS - elapsed)
  const daysRemaining = Math.ceil(remainingMs / MS_PER_DAY)
  const eligibleAt = new Date(lastMs + RECONTACT_COOLDOWN_MS).toISOString()
  const hot = isHotOutboundStatus(lead.outbound_status)

  if (progress >= 100) {
    if (hot) {
      return {
        lane: 'hot',
        progressPercent: 100,
        daysSinceContact: daysSince,
        daysRemaining: 0,
        eligibleAt,
        lastContactAt: lastRaw,
        blockedReason: null,
        recommendNewCampaign: false,
        label: 'Past cooldown',
        detail: 'Cooldown complete — follow up personally before a cold recontact.'
      }
    }
    return {
      lane: 'ready',
      progressPercent: 100,
      daysSinceContact: daysSince,
      daysRemaining: 0,
      eligibleAt,
      lastContactAt: lastRaw,
      blockedReason: null,
      recommendNewCampaign: true,
      label: 'Ready to recontact',
      detail: `${RECONTACT_COOLDOWN_DAYS} days since last touch — safe to pull into a new campaign.`
    }
  }

  if (hot) {
    return {
      lane: 'hot',
      progressPercent: progress,
      daysSinceContact: daysSince,
      daysRemaining,
      eligibleAt,
      lastContactAt: lastRaw,
      blockedReason: null,
      recommendNewCampaign: false,
      label: 'Active conversation',
      detail: `Cooldown ${progress}% · ${daysRemaining} day${daysRemaining === 1 ? '' : 's'} left (handle personally).`
    }
  }

  return {
    lane: 'cooling',
    progressPercent: progress,
    daysSinceContact: daysSince,
    daysRemaining,
    eligibleAt,
    lastContactAt: lastRaw,
    blockedReason: null,
    recommendNewCampaign: false,
    label: 'In cooldown',
    detail: `${daysSince} of ${RECONTACT_COOLDOWN_DAYS} days · ${daysRemaining} day${daysRemaining === 1 ? '' : 's'} until recontact.`
  }
}

function daysBetween(fromMs: number, toMs: number): number {
  return Math.max(0, Math.floor((toMs - fromMs) / MS_PER_DAY))
}

function blockReasonLabel(reason: string | null): string {
  if (!reason) return 'Marked do-not-contact.'
  const map: Record<string, string> = {
    suppressed: 'Suppressed — do not contact.',
    recontact_blocked: 'Recontact explicitly blocked.',
    manual_suppress: 'Manually suppressed.',
    instantly_unsubscribed: 'Unsubscribed in Instantly.',
    instantly_bounced: 'Bounced in Instantly.',
    instantly_not_interested: 'Marked not interested.',
    instantly_wrong_person: 'Wrong person.',
    instantly_lost: 'Marked lost.',
    instantly_no_show: 'No-show.',
    instantly_skipped: 'Skipped in Instantly.',
    instantly_suppressed: 'Suppressed in Instantly.'
  }
  return map[reason] ?? `Blocked (${reason.replace(/_/g, ' ')}).`
}

export type OutreachTouchCopy = {
  subject?: string | null
  opener?: string | null
  cold_expression?: string | null
  cta?: string | null
  preview?: string | null
}

export type LeadOutreachTouch = {
  id: string
  contact_id: string
  contacted_at: string
  channel: string
  campaign_id: string | null
  campaign_name: string | null
  instantly_campaign_id: string | null
  copy_snapshot: OutreachTouchCopy | null
  source: string
  created_at: string
}

/** Parse Instantly multi-campaign id JSON into a stable id list. */
export function parseCampaignIdList(
  raw: string | null | undefined,
  latestId?: string | null
): string[] {
  const seen = new Set<string>()
  if (raw) {
    try {
      const v = JSON.parse(raw) as unknown
      if (Array.isArray(v)) {
        for (const item of v) {
          const id = String(item ?? '').trim()
          if (id) seen.add(id)
        }
      }
    } catch {
      // ignore
    }
  }
  const latest = latestId?.trim()
  if (latest) seen.add(latest)
  return Array.from(seen)
}

/** Build a lightweight history row from lead mirror fields when no touch log exists yet. */
export function synthesizeTouchesFromLead(lead: {
  id: string
  last_outbound_at?: string | null
  instantly_campaign_id?: string | null
  instantly_campaign_ids?: string | null
  instantly_campaign_name?: string | null
  instantly_campaign?: string | null
  instantly_uploaded_at?: string | null
}): Array<Omit<LeadOutreachTouch, 'created_at'> & { created_at?: string }> {
  if (!lead.last_outbound_at) return []
  const name = lead.instantly_campaign_name || lead.instantly_campaign || null
  const ids = parseCampaignIdList(lead.instantly_campaign_ids, lead.instantly_campaign_id)
  if (ids.length === 0) {
    return [
      {
        id: `synth-${lead.id}-latest`,
        contact_id: lead.id,
        contacted_at: lead.last_outbound_at,
        channel: 'email',
        campaign_id: null,
        campaign_name: name,
        instantly_campaign_id: null,
        copy_snapshot: null,
        source: 'lead_mirror'
      }
    ]
  }
  return ids.map((campaignId, index) => ({
    id: `synth-${lead.id}-${campaignId}`,
    contact_id: lead.id,
    contacted_at:
      index === ids.length - 1
        ? lead.last_outbound_at!
        : lead.instantly_uploaded_at || lead.last_outbound_at!,
    channel: 'email',
    campaign_id: null,
    campaign_name: index === ids.length - 1 ? name : null,
    instantly_campaign_id: campaignId,
    copy_snapshot: null,
    source: 'lead_mirror'
  }))
}

export function copySnapshotFromSequence(sequence: {
  steps?: Array<{
    kind?: string
    subject?: string
    slots?: Array<{ key?: string; body?: string }>
  }>
} | null | undefined): OutreachTouchCopy | null {
  if (!sequence?.steps?.length) return null
  const email = sequence.steps.find((s) => s.kind === 'email') ?? sequence.steps[0]
  const slot = (key: string) =>
    email.slots?.find((s) => s.key === key)?.body?.trim() || null
  const subject = email.subject?.trim() || slot('subject')
  const opener = slot('opener')
  const cold = slot('cold_expression')
  const cta = slot('cta')
  const preview = [subject, opener || cold].filter(Boolean).join(' — ').slice(0, 280) || null
  if (!subject && !opener && !cold && !cta) return null
  return { subject, opener, cold_expression: cold, cta, preview }
}

export function outreachTouchId(parts: {
  contactId: string
  instantlyCampaignId?: string | null
  contactedAt: string
  source?: string
}): string {
  const day = parts.contactedAt.slice(0, 10)
  const camp = (parts.instantlyCampaignId || 'none').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48)
  const src = (parts.source || 'sync').slice(0, 24)
  return `touch-${parts.contactId.slice(0, 40)}-${camp}-${day}-${src}`
}
