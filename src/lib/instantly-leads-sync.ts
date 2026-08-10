import type { SupabaseClient } from '@supabase/supabase-js'

import {
  InstantlyApiError,
  getInstantlyApiKey,
  resolveInstantlyApiKey,
  type InstantlyCampaignAnalytics
} from '@/lib/instantly'
import { lookupCopyForInstantlyCampaign, recordOutreachTouch } from '@/lib/lead-outreach'

const INSTANTLY_API_BASE = 'https://api.instantly.ai/api/v2'
const PAGE_LIMIT = 100
/** Cap pages per filter so a daily job stays bounded. */
const MAX_PAGES_PER_FILTER = 10

/**
 * Instantly lead filters that should surface in Compass Inbox.
 * Positive, neutral reply, negative, and OOO — anything Jules may need to triage.
 */
export const INSTANTLY_INBOX_FILTERS = [
  'FILTER_VAL_REPLIED',
  'FILTER_LEAD_INTERESTED',
  'FILTER_LEAD_MEETING_BOOKED',
  'FILTER_LEAD_MEETING_COMPLETED',
  'FILTER_LEAD_CLOSED',
  'FILTER_LEAD_NOT_INTERESTED',
  'FILTER_LEAD_OUT_OF_OFFICE',
  'FILTER_LEAD_WRONG_PERSON',
  'FILTER_LEAD_LOST',
  'FILTER_LEAD_NO_SHOW',
  'FILTER_LEAD_CUSTOM_LABEL_POSITIVE',
  'FILTER_LEAD_CUSTOM_LABEL_NEGATIVE'
] as const

export type InstantlyLeadListFilter = (typeof INSTANTLY_INBOX_FILTERS)[number]

/** Outbound statuses the Inbox Instantly tab should load. */
export const INSTANTLY_INBOX_OUTBOUND_STATUSES = [
  'replied',
  'interested',
  'meeting_booked',
  'not_interested',
  'out_of_office',
  'wrong_person',
  // Legacy Compass mirror values (pre-agent-sync taxonomy).
  'replied_positive',
  'replied_negative'
] as const

export type InstantlyLeadRow = {
  id: string
  email?: string | null
  first_name?: string | null
  last_name?: string | null
  company_name?: string | null
  job_title?: string | null
  phone?: string | null
  website?: string | null
  campaign?: string | null
  lt_interest_status?: number | null
  email_reply_count?: number | null
  timestamp_last_reply?: string | null
  timestamp_last_contact?: string | null
  status?: number | null
  payload?: Record<string, unknown> | null
}

export type InstantlyLeadsSyncResult = {
  fetched: number
  upserted: number
  inserted: number
  updated: number
  skipped: number
  filters: InstantlyLeadListFilter[]
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

export function mapInstantlyInterestToOutboundStatus(
  lead: Pick<InstantlyLeadRow, 'lt_interest_status' | 'email_reply_count' | 'timestamp_last_reply' | 'status'>
): string {
  const interest = lead.lt_interest_status
  switch (interest) {
    case 4:
      return 'converted'
    case 3:
    case 2:
      return 'meeting_booked'
    case 1:
      return 'interested'
    case 0:
      return 'out_of_office'
    case -1:
      return 'not_interested'
    case -2:
      return 'wrong_person'
    case -3:
    case -4:
      // Lost / no-show still need Inbox triage; keep recontact blocked.
      return 'not_interested'
    default:
      break
  }

  if (lead.status === -1 || lead.status === -2 || lead.status === -3) {
    return 'suppressed'
  }

  const replies = Number(lead.email_reply_count) || 0
  if (replies > 0 || lead.timestamp_last_reply) return 'replied'
  return 'in_instantly'
}

export function interestLabelForOutbound(outbound: string): string {
  switch (outbound) {
    case 'interested':
    case 'replied_positive':
      return 'Interested'
    case 'meeting_booked':
      return 'Meeting booked'
    case 'converted':
      return 'Closed'
    case 'not_interested':
    case 'replied_negative':
      return 'Not interested'
    case 'out_of_office':
      return 'Out of office'
    case 'wrong_person':
      return 'Wrong person'
    case 'suppressed':
      return 'Suppressed'
    case 'replied':
      return 'Replied'
    default:
      return outbound.replace(/_/g, ' ')
  }
}

/** True when Instantly outcome should block further cold outreach. */
export function isInstantlySuppressedOutbound(outbound: string): boolean {
  switch (outbound) {
    case 'not_interested':
    case 'wrong_person':
    case 'suppressed':
    case 'replied_negative':
      return true
    default:
      return false
  }
}

export function buildLeadDisplayName(lead: InstantlyLeadRow): string | null {
  const first = str(lead.first_name)
  const last = str(lead.last_name)
  const joined = [first, last].filter(Boolean).join(' ')
  if (joined) return joined
  const payload = lead.payload ?? {}
  const fromPayload = [str(payload.firstName), str(payload.lastName)].filter(Boolean).join(' ')
  return fromPayload || null
}

async function listInstantlyLeadsPage(
  apiKey: string,
  filter: InstantlyLeadListFilter,
  startingAfter?: string
): Promise<{ items: InstantlyLeadRow[]; next: string | null }> {
  const body: Record<string, unknown> = {
    filter,
    limit: PAGE_LIMIT,
    in_campaign: true
  }
  if (startingAfter) body.starting_after = startingAfter

  const res = await fetch(`${INSTANTLY_API_BASE}/leads/list`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body),
    cache: 'no-store'
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new InstantlyApiError(detail || `Instantly leads list failed (${res.status})`, res.status)
  }

  const json = (await res.json()) as {
    items?: InstantlyLeadRow[]
    next_starting_after?: string | null
  }
  return {
    items: Array.isArray(json.items) ? json.items : [],
    next: json.next_starting_after || null
  }
}

export async function fetchInstantlyLeadsForFilters(
  apiKey: string,
  filters: readonly InstantlyLeadListFilter[] = INSTANTLY_INBOX_FILTERS
): Promise<InstantlyLeadRow[]> {
  const byId = new Map<string, InstantlyLeadRow>()

  for (const filter of filters) {
    let cursor: string | undefined
    for (let page = 0; page < MAX_PAGES_PER_FILTER; page += 1) {
      const { items, next } = await listInstantlyLeadsPage(apiKey, filter, cursor)
      for (const item of items) {
        if (!item?.id) continue
        byId.set(item.id, item)
      }
      if (!next || items.length === 0) break
      cursor = next
    }
  }

  return [...byId.values()]
}

function campaignNameLookup(
  campaigns: InstantlyCampaignAnalytics[] | undefined,
  campaignId: string | null
): string | null {
  if (!campaignId || !campaigns?.length) return null
  const match = campaigns.find((c) => c.campaign_id === campaignId)
  return match?.campaign_name || null
}

type ExistingLead = {
  id: string
  email: string | null
  instantly_lead_id: string | null
  outbound_status: string | null
  suppression_reason: string | null
}

async function loadExistingLeads(
  supabase: SupabaseClient,
  instantlyIds: string[],
  emails: string[]
): Promise<ExistingLead[]> {
  const rows: ExistingLead[] = []
  const selectCols =
    'id,email,instantly_lead_id,outbound_status,suppression_reason'

  // Chunk to keep PostgREST URLs reasonable.
  const chunk = 200
  for (let i = 0; i < instantlyIds.length; i += chunk) {
    const slice = instantlyIds.slice(i, i + chunk)
    if (slice.length === 0) continue
    const { data, error } = await supabase
      .from('lead_contacts')
      .select(selectCols)
      .in('instantly_lead_id', slice)
    if (error) throw new Error(error.message)
    for (const row of data ?? []) rows.push(row as ExistingLead)
  }

  for (let i = 0; i < emails.length; i += chunk) {
    const slice = emails.slice(i, i + chunk)
    if (slice.length === 0) continue
    const { data, error } = await supabase.from('lead_contacts').select(selectCols).in('email', slice)
    if (error) throw new Error(error.message)
    for (const row of data ?? []) rows.push(row as ExistingLead)
  }

  return rows
}

function pickExisting(
  byInstantlyId: Map<string, ExistingLead>,
  byEmail: Map<string, ExistingLead>,
  instantlyId: string,
  email: string | null
): ExistingLead | null {
  return byInstantlyId.get(instantlyId) || (email ? byEmail.get(email) || null : null)
}

/**
 * Pull high-signal Instantly leads into `lead_contacts` so Inbox Instantly
 * and Leads stay nearly in lockstep with Instantly.
 */
export async function syncInstantlyLeadsIntoCompass(
  supabase: SupabaseClient,
  options?: {
    apiKey?: string | null
    filters?: readonly InstantlyLeadListFilter[]
    campaigns?: InstantlyCampaignAnalytics[]
  }
): Promise<InstantlyLeadsSyncResult> {
  const apiKey =
    options?.apiKey ?? (await resolveInstantlyApiKey(supabase)) ?? getInstantlyApiKey()
  if (!apiKey) throw new InstantlyApiError('INSTANTLY_API_KEY is not configured', 503)

  const filters = options?.filters ?? INSTANTLY_INBOX_FILTERS
  const leads = await fetchInstantlyLeadsForFilters(apiKey, filters)
  const stamp = new Date().toISOString()

  const instantlyIds = leads.map((l) => l.id)
  const emails = [
    ...new Set(
      leads.map((l) => normalizeEmail(l.email)).filter((e): e is string => Boolean(e))
    )
  ]

  const existing = await loadExistingLeads(supabase, instantlyIds, emails)
  const byInstantlyId = new Map<string, ExistingLead>()
  const byEmail = new Map<string, ExistingLead>()
  for (const row of existing) {
    if (row.instantly_lead_id) byInstantlyId.set(row.instantly_lead_id, row)
    const email = normalizeEmail(row.email)
    if (email && !byEmail.has(email)) byEmail.set(email, row)
  }

  let inserted = 0
  let updated = 0
  let skipped = 0

  for (const lead of leads) {
    const email = normalizeEmail(lead.email)
    if (!email && !lead.id) {
      skipped += 1
      continue
    }

    const outbound = mapInstantlyInterestToOutboundStatus(lead)
    const campaignId = str(lead.campaign)
    const campaignName = campaignNameLookup(options?.campaigns, campaignId)
    const payload = lead.payload ?? {}
    const company =
      str(lead.company_name) || str(payload.companyName) || null
    const role = str(lead.job_title) || str(payload.jobTitle) || null
    const phone = str(lead.phone) || str(payload.phone) || null
    const name = buildLeadDisplayName(lead)

    const match = pickExisting(byInstantlyId, byEmail, lead.id, email)
    const suppressed = isInstantlySuppressedOutbound(outbound)
    const suppressionReason = suppressed
      ? interestSuppressionReason(lead.lt_interest_status, lead.status)
      : null
    const lastContactAt =
      str(lead.timestamp_last_reply) ||
      str(lead.timestamp_last_contact) ||
      stamp
    const patch: Record<string, unknown> = {
      email: email,
      phone,
      company,
      role,
      source: 'instantly',
      outbound_status: outbound,
      interest_label: interestLabelForOutbound(outbound),
      lead_status_source: 'instantly_sync',
      instantly_lead_id: lead.id,
      instantly_campaign_id: campaignId,
      instantly_campaign: campaignName,
      instantly_campaign_name: campaignName,
      instantly_synced_at: stamp,
      last_outbound_at: lastContactAt,
      updated_at: stamp,
      mirrored_at: stamp,
      suppression_reason: suppressionReason,
      // Negative Instantly outcomes block recontact; OOO / positive stay open.
      recontact_ok: suppressed ? 0 : 1
    }

    // Avoid wiping an existing display name with null.
    if (!name) delete patch.name
    if (!phone) delete patch.phone
    if (!company) delete patch.company
    if (!role) delete patch.role

    let contactId: string
    if (match) {
      // Don't demote a stronger local status unless Instantly is more advanced.
      if (!shouldOverwriteOutbound(match.outbound_status, outbound)) {
        delete patch.outbound_status
        delete patch.interest_label
      }
      // Don't clear an existing suppress block if Instantly didn't re-suppress.
      if (!suppressed && match.suppression_reason) {
        delete patch.suppression_reason
        delete patch.recontact_ok
      }
      const { error } = await supabase.from('lead_contacts').update(patch).eq('id', match.id)
      if (error) throw new Error(error.message)
      updated += 1
      contactId = match.id
      byInstantlyId.set(lead.id, { ...match, instantly_lead_id: lead.id, email })
      if (email) byEmail.set(email, { ...match, instantly_lead_id: lead.id, email })
    } else {
      const row = {
        id: `inst-${lead.id}`,
        name: name || email || lead.id,
        ...patch,
        created_at: stamp
      }
      const { error } = await supabase.from('lead_contacts').insert(row)
      if (error) throw new Error(error.message)
      inserted += 1
      contactId = row.id
      const created: ExistingLead = {
        id: row.id,
        email,
        instantly_lead_id: lead.id,
        outbound_status: outbound,
        suppression_reason: suppressionReason
      }
      byInstantlyId.set(lead.id, created)
      if (email) byEmail.set(email, created)
    }

    // Log outreach for 90-day cooldown history (best-effort; never fail sync).
    try {
      const linked = await lookupCopyForInstantlyCampaign(supabase, campaignId)
      await recordOutreachTouch(supabase, {
        contactId,
        contactedAt: lastContactAt,
        channel: 'email',
        campaignId: linked.campaignId,
        campaignName: linked.campaignName || campaignName,
        instantlyCampaignId: campaignId,
        copySnapshot: linked.copy,
        source: 'instantly_sync'
      })
    } catch {
      // ignore touch-log failures
    }
  }

  return {
    fetched: leads.length,
    upserted: inserted + updated,
    inserted,
    updated,
    skipped,
    filters: [...filters]
  }
}

function interestSuppressionReason(
  interest: number | null | undefined,
  status: number | null | undefined
): string {
  switch (interest) {
    case -1:
      return 'instantly_not_interested'
    case -2:
      return 'instantly_wrong_person'
    case -3:
      return 'instantly_lost'
    case -4:
      return 'instantly_no_show'
    default:
      break
  }
  switch (status) {
    case -1:
      return 'instantly_bounced'
    case -2:
      return 'instantly_unsubscribed'
    case -3:
      return 'instantly_skipped'
    default:
      return 'instantly_suppressed'
  }
}

const OUTBOUND_RANK: Record<string, number> = {
  uncontacted: 0,
  in_instantly: 1,
  contacted: 2,
  out_of_office: 2.5,
  replied: 3,
  replied_positive: 4,
  interested: 4,
  not_interested: 4.5,
  replied_negative: 4.5,
  wrong_person: 4.5,
  meeting_booked: 5,
  booked: 5,
  converted: 6,
  suppressed: 7
}

function shouldOverwriteOutbound(
  existing: string | null | undefined,
  incoming: string
): boolean {
  if (!existing) return true
  const existingKey = existing.toLowerCase()
  const incomingKey = incoming.toLowerCase()
  const a = OUTBOUND_RANK[existingKey] ?? 0
  const b = OUTBOUND_RANK[incomingKey] ?? 0
  // Always apply Instantly suppression / conversion / negative / OOO signals.
  if (
    incomingKey === 'suppressed' ||
    incomingKey === 'converted' ||
    incomingKey === 'not_interested' ||
    incomingKey === 'wrong_person' ||
    incomingKey === 'out_of_office'
  ) {
    return true
  }
  // Normalize legacy replied_positive/negative whenever Instantly has a fresher lane.
  if (existingKey === 'replied_positive' || existingKey === 'replied_negative') return true
  return b >= a
}
