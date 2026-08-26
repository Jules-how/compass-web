import type { SupabaseClient } from '@supabase/supabase-js'

import { appendEvidenceBatch, type EvidenceEventInput } from '@/lib/events'
import {
  fetchInstantlyCampaignAnalytics,
  fetchInstantlyDailyCampaignAnalytics,
  fetchInstantlyEmailsPage,
  getInstantlyTimezone,
  rollingWindowDates
} from '@/lib/instantly'
import type { InstantlyLeadRow } from '@/lib/instantly-leads-sync'
import { mapInstantlyInterestToOutboundStatus } from '@/lib/instantly-leads-sync'
import { loadSyncSnapshot, upsertSyncSnapshot } from '@/lib/sync-snapshots'

const INSTANTLY_API_BASE = 'https://api.instantly.ai/api/v2'
const LEAD_PAGE_LIMIT = 100
const SLEEP_MS = 250

export type InstantlyBackfillCursor = {
  started_at: string
  completed_campaign_ids: string[]
  current_campaign_id?: string | null
  lead_starting_after?: string | null
  email_starting_after?: string | null
  phase?: 'leads' | 'emails' | 'done'
}

export type InstantlyBackfillResult = {
  campaigns: number
  eventsAttempted: number
  campaignsCompleted: number
  dryRun: boolean
  resumed: boolean
  done: boolean
}

type PipelineBind = {
  instantly_campaign_id: string | null
  offer_key: string | null
  vertical_tags: string[] | null
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function verticalFromBind(bind: PipelineBind | null): string | null {
  const tags = bind?.vertical_tags
  if (!Array.isArray(tags) || tags.length === 0) return null
  const first = String(tags[0] || '').trim()
  return first || null
}

function offerFromBind(bind: PipelineBind | null): string | null {
  const key = (bind?.offer_key || '').trim()
  return key || null
}

async function listCampaignLeadsPage(
  apiKey: string,
  campaignId: string,
  startingAfter?: string
): Promise<{ items: InstantlyLeadRow[]; next: string | null }> {
  const body: Record<string, unknown> = {
    campaign: campaignId,
    limit: LEAD_PAGE_LIMIT,
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
    throw new Error(detail || `Instantly leads list failed (${res.status})`)
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

function leadEvidenceEvents(
  lead: InstantlyLeadRow,
  campaignId: string,
  bind: PipelineBind | null,
  contactId?: string | null
): EvidenceEventInput[] {
  const events: EvidenceEventInput[] = []
  const vertical = verticalFromBind(bind)
  const offer = offerFromBind(bind)
  const outbound = mapInstantlyInterestToOutboundStatus(lead)
  const ts =
    lead.timestamp_last_reply ||
    lead.timestamp_last_contact ||
    new Date().toISOString()
  const leadId = lead.id

  const base = {
    source: 'instantly' as const,
    lead_id: contactId || undefined,
    ts,
    vertical,
    offer,
    campaign: campaignId,
    messaging_component: null,
    payload: {
      instantly_lead_id: leadId,
      campaign_id: campaignId,
      outbound_status: outbound,
      backfill: true
    }
  }

  const replies = Number(lead.email_reply_count) || 0
  if (replies > 0 || lead.timestamp_last_reply) {
    events.push({
      ...base,
      type: 'email.replied',
      native_id: `${leadId}:${campaignId}`,
      idempotency_key: `instantly:email.replied:${leadId}:${campaignId}`
    })
  }

  if (outbound === 'interested') {
    events.push({
      ...base,
      type: 'lead.interested',
      native_id: `${leadId}:${campaignId}`,
      idempotency_key: `instantly:lead.interested:${leadId}:${campaignId}`
    })
  }

  if (outbound === 'meeting_booked' || outbound === 'converted') {
    events.push({
      ...base,
      type: 'lead.meeting_booked',
      native_id: `${leadId}:${campaignId}`,
      idempotency_key: `instantly:lead.meeting_booked:${leadId}:${campaignId}`
    })
  }

  if (lead.status === -2) {
    events.push({
      ...base,
      type: 'lead.unsubscribed',
      native_id: `${leadId}:${campaignId}`,
      idempotency_key: `instantly:lead.unsubscribed:${leadId}:${campaignId}`
    })
  }

  if (lead.status === -1) {
    events.push({
      ...base,
      type: 'email.bounced',
      native_id: `${leadId}:${campaignId}`,
      idempotency_key: `instantly:email.bounced:${leadId}:${campaignId}`
    })
  }

  return events
}

function dailySentEvents(
  campaignId: string,
  dailyRows: Array<{ date: string; sent: number }>,
  bind: PipelineBind | null
): EvidenceEventInput[] {
  const vertical = verticalFromBind(bind)
  const offer = offerFromBind(bind)
  const events: EvidenceEventInput[] = []

  for (const row of dailyRows) {
    const sent = Math.max(0, Number(row.sent) || 0)
    if (sent <= 0) continue
    const date = row.date
    events.push({
      source: 'instantly',
      type: 'email.sent',
      ts: `${date}T12:00:00.000Z`,
      vertical,
      offer,
      campaign: campaignId,
      messaging_component: null,
      native_id: `${campaignId}:${date}`,
      idempotency_key: `instantly:email.sent_day:${campaignId}:${date}`,
      payload: { campaign_id: campaignId, date, sent, backfill: true, grain: 'day' }
    })
  }

  return events
}

async function loadPipelineBinds(supabase: SupabaseClient): Promise<Map<string, PipelineBind>> {
  const { data, error } = await supabase
    .from('compass_pipeline_campaigns')
    .select('instantly_campaign_id,offer_key,vertical_tags')
    .not('instantly_campaign_id', 'is', null)
  if (error) throw new Error(error.message)

  const map = new Map<string, PipelineBind>()
  for (const row of data ?? []) {
    const id = String(row.instantly_campaign_id || '').trim()
    if (!id) continue
    map.set(id, row as PipelineBind)
  }
  return map
}

async function loadContactIdsByInstantlyLead(
  supabase: SupabaseClient,
  instantlyLeadIds: string[]
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const chunk = 200
  for (let i = 0; i < instantlyLeadIds.length; i += chunk) {
    const slice = instantlyLeadIds.slice(i, i + chunk)
    if (slice.length === 0) continue
    const { data } = await supabase
      .from('lead_contacts')
      .select('id,instantly_lead_id')
      .in('instantly_lead_id', slice)
    for (const row of data ?? []) {
      if (row.instantly_lead_id) out.set(String(row.instantly_lead_id), String(row.id))
    }
  }
  return out
}

export type InstantlyBackfillOptions = {
  dryRun?: boolean
  reset?: boolean
  maxCampaigns?: number
  sleepMs?: number
}

/**
 * Pull Instantly history into compass_evidence_events. Read-only against Instantly.
 * Resumable via compass_sync_snapshots.instantly_backfill.
 */
export async function runInstantlyBackfill(
  supabase: SupabaseClient,
  apiKey: string,
  options: InstantlyBackfillOptions = {}
): Promise<InstantlyBackfillResult> {
  const dryRun = Boolean(options.dryRun)
  const sleepMs = options.sleepMs ?? SLEEP_MS
  const binds = await loadPipelineBinds(supabase)

  let cursor: InstantlyBackfillCursor | null = null
  if (!options.reset) {
    const snap = await loadSyncSnapshot<InstantlyBackfillCursor>(supabase, 'instantly_backfill')
    cursor = snap?.payload ?? null
  }

  const startedAt = cursor?.started_at ?? new Date().toISOString()
  const completed = new Set(cursor?.completed_campaign_ids ?? [])

  const campaigns = await fetchInstantlyCampaignAnalytics(apiKey)
  const timeZone = getInstantlyTimezone()
  const allTime = rollingWindowDates(3650, timeZone)
  const maxCampaigns = options.maxCampaigns ?? campaigns.length

  let eventsAttempted = 0
  let campaignsCompleted = 0

  const pending = campaigns
    .filter((c) => !completed.has(c.campaign_id))
    .slice(0, maxCampaigns)

  for (const campaign of pending) {
    const campaignId = campaign.campaign_id
    const bind = binds.get(campaignId) ?? null
    const batch: EvidenceEventInput[] = []

    const daily = await fetchInstantlyDailyCampaignAnalytics(
      apiKey,
      allTime.start,
      allTime.end,
      campaignId
    )
    await sleep(sleepMs)
    batch.push(
      ...dailySentEvents(
        campaignId,
        daily.map((d) => ({ date: d.date, sent: d.sent })),
        bind
      )
    )

    let leadCursor =
      cursor?.current_campaign_id === campaignId ? cursor.lead_starting_after ?? undefined : undefined
    for (;;) {
      const { items, next } = await listCampaignLeadsPage(apiKey, campaignId, leadCursor)
      const contactMap = await loadContactIdsByInstantlyLead(
        supabase,
        items.map((l) => l.id).filter(Boolean)
      )
      for (const lead of items) {
        batch.push(
          ...leadEvidenceEvents(lead, campaignId, bind, contactMap.get(lead.id) ?? null)
        )
      }
      if (!next || items.length === 0) break
      leadCursor = next
      await sleep(sleepMs)

      if (!dryRun) {
        await upsertSyncSnapshot(
          supabase,
          'instantly_backfill',
          {
            started_at: startedAt,
            completed_campaign_ids: [...completed],
            current_campaign_id: campaignId,
            lead_starting_after: leadCursor,
            phase: 'leads'
          } satisfies InstantlyBackfillCursor,
          'live'
        )
      }
    }

    let emailCursor =
      cursor?.current_campaign_id === campaignId ? cursor.email_starting_after ?? undefined : undefined
    try {
      for (;;) {
        const { items, next } = await fetchInstantlyEmailsPage(apiKey, {
          campaignId,
          startingAfter: emailCursor
        })
        for (const email of items) {
          const leadId = String(email.lead_id || '').trim()
          const sentAt = String(email.sent_at || email.timestamp_email || '').trim()
          if (!leadId || !sentAt) continue
          batch.push({
            source: 'instantly',
            type: 'email.sent',
            ts: sentAt,
            vertical: verticalFromBind(bind),
            offer: offerFromBind(bind),
            campaign: campaignId,
            messaging_component: null,
            native_id: `${leadId}:${campaignId}:${sentAt}`,
            idempotency_key: `instantly:email.sent:${leadId}:${campaignId}:${sentAt}`,
            payload: {
              campaign_id: campaignId,
              instantly_lead_id: leadId,
              email_id: email.id,
              backfill: true,
              grain: 'email'
            }
          })
        }
        if (!next || items.length === 0) break
        emailCursor = next
        await sleep(sleepMs)
      }
    } catch {
      // emails list is optional — daily grain already covers sent volume
    }

    eventsAttempted += batch.length
    if (!dryRun && batch.length > 0) {
      await appendEvidenceBatch(supabase, batch)
    }

    completed.add(campaignId)
    campaignsCompleted += 1
    cursor = {
      started_at: startedAt,
      completed_campaign_ids: [...completed],
      current_campaign_id: null,
      phase: 'done'
    }

    if (!dryRun) {
      await upsertSyncSnapshot(supabase, 'instantly_backfill', cursor, 'live')
    }
    await sleep(sleepMs)
  }

  const done = completed.size >= campaigns.length || pending.length === 0

  return {
    campaigns: campaigns.length,
    eventsAttempted,
    campaignsCompleted,
    dryRun,
    resumed: Boolean(cursor?.completed_campaign_ids?.length),
    done
  }
}

export async function resetInstantlyBackfillCursor(supabase: SupabaseClient): Promise<void> {
  await upsertSyncSnapshot(
    supabase,
    'instantly_backfill',
    { started_at: new Date().toISOString(), completed_campaign_ids: [], phase: 'leads' },
    'live'
  )
}
