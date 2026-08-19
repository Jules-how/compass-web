import type { SupabaseClient } from '@supabase/supabase-js'

import {
  CAMPAIGN_LIST_COLUMNS,
  emptyCampaignCopyFields,
  projectCampaignCopy,
  type CompassCampaign
} from '@/lib/campaigns'
import { parseLeadFacts } from '@/lib/lead-facts'
import {
  sequenceEmailBodyText,
  type OutboundSequence
} from '@/lib/outbound-copy'
import { isHotOutboundStatus, isRecontactBlocked } from '@/lib/recontact-eligibility'
import { leadPreviewValues, splitPersonName } from '@/lib/sequence-preview'
import { isIcpSkip } from '@/lib/lead-icp'
import type { LeadContact } from '@/lib/types'
import { InstantlyApiError, getInstantlyTimezone } from '@/lib/instantly'
import {
  instantlyAddLeadsBulk,
  instantlyCreateCampaign,
  instantlyGetCampaign,
  instantlyListSendingEmails,
  instantlyUpdateCampaign,
  type InstantlyLeadPayload,
  type InstantlySequencePayload
} from '@/lib/instantly-write'

export const INSTANTLY_PUSH_CHUNK = 200
export const INSTANTLY_PUSH_MAX = 1000

export const PUSH_LEAD_COLUMNS =
  'id,name,email,phone,company,role,city,state,linkedin,website,company_domain,outbound_status,suppression_reason,recontact_ok,instantly_campaign_id,instantly_lead_id,opener,lead_facts,enrich_status,pipeline_campaign_id,icp_status,email_origin'

export type PushSkipReason =
  | 'no_email'
  | 'suppressed'
  | 'hot'
  | 'already_in_campaign'
  | 'missing_opener'
  | 'icp_skip'

export type PushSkip = { id: string; email: string | null; reason: PushSkipReason }

export type InstantlyPushPreview = {
  eligible: Array<{ id: string; email: string }>
  skipped: PushSkip[]
  missingVars: Array<{ id: string; email: string; keys: string[] }>
}

export type InstantlyPushLeadsResult = InstantlyPushPreview & {
  dryRun: boolean
  instantlyCampaignId: string
  uploaded: number
  created: Array<{ id: string; email: string; instantlyLeadId: string }>
  instantlySkipped: number
  invalidEmails: number
  marked: number
}

function trim(value: string | null | undefined): string {
  return (value || '').trim()
}

export function chunkItems<T>(items: T[], size: number): T[][] {
  const n = Math.max(1, size)
  const out: T[][] = []
  for (let i = 0; i < items.length; i += n) out.push(items.slice(i, i + n))
  return out
}

export function textToInstantlyHtml(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return `<div>${escaped.replace(/\r\n|\n|\r/g, '<br/>')}</div>`
}

export function outboundSequenceToInstantlySequences(
  sequence: OutboundSequence | null | undefined
): InstantlySequencePayload[] {
  if (!sequence?.steps?.length) return []
  return [
    {
      steps: sequence.steps.map((step, index) => {
        const body = sequenceEmailBodyText(sequence, index)
        return {
          type: 'email',
          delay: index === 0 ? 0 : Math.max(1, step.delay_days ?? 3),
          variants: [
            {
              subject: trim(step.subject) || '{{firstName}}',
              body: textToInstantlyHtml(body || '{{opener}}')
            }
          ]
        }
      })
    }
  ]
}

export function leadContactToInstantlyLead(lead: LeadContact): InstantlyLeadPayload | null {
  const email = trim(lead.email).toLowerCase()
  if (!email || !email.includes('@')) return null
  const values = leadPreviewValues(lead)
  const { firstName, lastName } = splitPersonName(lead.name)
  const facts = parseLeadFacts(lead.lead_facts)
  const firstFact = facts.ok ? facts.facts[0] : undefined
  const custom: Record<string, string | number | boolean | null> = {}
  if (values.jobTitle) custom.jobTitle = values.jobTitle
  if (values.location) custom.location = values.location
  if (values.linkedIn) custom.linkedIn = values.linkedIn
  if (values.website) custom.website = values.website
  if (values.opener) {
    custom.opener = values.opener
    custom.personalization = values.opener
  }
  if (firstFact?.claim) custom.fact_claim = firstFact.claim
  if (firstFact?.url) custom.fact_url = firstFact.url
  const payload: InstantlyLeadPayload = { email }
  if (firstName) payload.first_name = firstName
  if (lastName) payload.last_name = lastName
  if (values.companyName) payload.company_name = values.companyName
  if (values.phone) payload.phone = values.phone
  if (values.opener) payload.personalization = values.opener
  if (values.website) payload.website = values.website
  if (Object.keys(custom).length) payload.custom_variables = custom
  return payload
}

export function classifyPushSkip(
  lead: LeadContact,
  instantlyCampaignId: string,
  requireOpener: boolean
): PushSkipReason | null {
  const email = trim(lead.email)
  if (!email || !email.includes('@')) return 'no_email'
  if (isIcpSkip(lead.icp_status)) return 'icp_skip'
  const blocked = isRecontactBlocked(lead)
  if (blocked.blocked) return 'suppressed'
  if (isHotOutboundStatus(lead.outbound_status)) return 'hot'
  if (
    trim(lead.instantly_campaign_id) &&
    trim(lead.instantly_campaign_id) === trim(instantlyCampaignId)
  ) {
    return 'already_in_campaign'
  }
  if (requireOpener && !trim(lead.opener)) return 'missing_opener'
  return null
}

export function missingPreviewKeys(lead: LeadContact): string[] {
  const values = leadPreviewValues(lead)
  const keys = ['firstName', 'companyName'] as const
  return keys.filter((key) => !values[key])
}

export function previewPushLeads(
  leads: LeadContact[],
  instantlyCampaignId: string,
  options?: { requireOpener?: boolean }
): InstantlyPushPreview {
  const requireOpener = options?.requireOpener !== false
  const skipped: PushSkip[] = []
  const eligible: Array<{ id: string; email: string; lead: LeadContact }> = []
  for (const lead of leads) {
    const reason = classifyPushSkip(lead, instantlyCampaignId, requireOpener)
    if (reason) {
      skipped.push({ id: lead.id, email: lead.email, reason })
      continue
    }
    eligible.push({ id: lead.id, email: trim(lead.email).toLowerCase(), lead })
  }
  return {
    eligible: eligible.map((row) => ({ id: row.id, email: row.email })),
    skipped,
    missingVars: eligible
      .map((row) => ({
        id: row.id,
        email: row.email,
        keys: missingPreviewKeys(row.lead)
      }))
      .filter((row) => row.keys.length > 0)
  }
}

function canStampInInstantly(status: string | null | undefined): boolean {
  const s = trim(status)
  return !s || s === 'uncontacted' || s === 'in_instantly'
}

export async function loadPipelineCampaign(
  supabase: SupabaseClient,
  campaignId: string
): Promise<CompassCampaign | null> {
  const { data, error } = await supabase
    .from('compass_pipeline_campaigns')
    .select(CAMPAIGN_LIST_COLUMNS)
    .eq('id', campaignId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  return projectCampaignCopy({
    ...emptyCampaignCopyFields(),
    ...(data as CompassCampaign),
    labels: Array.isArray((data as CompassCampaign).labels)
      ? (data as CompassCampaign).labels
      : [],
    priority: typeof (data as CompassCampaign).priority === 'number'
      ? (data as CompassCampaign).priority
      : 0,
    health: (data as CompassCampaign).health || 'no_updates',
    color: (data as CompassCampaign).color || '#94a3b8'
  })
}

async function loadCohortLeads(
  supabase: SupabaseClient,
  campaignId: string,
  leadIds?: string[]
): Promise<LeadContact[]> {
  let query = supabase
    .from('lead_contacts')
    .select(PUSH_LEAD_COLUMNS)
    .eq('pipeline_campaign_id', campaignId)
    .order('email', { ascending: true, nullsFirst: false })
    .limit(INSTANTLY_PUSH_MAX)
  if (leadIds?.length) query = query.in('id', leadIds.slice(0, INSTANTLY_PUSH_MAX))
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []) as LeadContact[]
}

export async function ensureInstantlyCampaign(input: {
  supabase: SupabaseClient
  campaign: CompassCampaign
  apiKey: string
  pushSequence?: boolean
}): Promise<{ campaign: CompassCampaign; instantlyCampaignId: string; created: boolean }> {
  const existing = trim(input.campaign.instantly_campaign_id)
  const sequences = input.pushSequence
    ? outboundSequenceToInstantlySequences(input.campaign.sequence_draft)
    : []
  if (existing) {
    await instantlyGetCampaign(input.apiKey, existing)
    if (sequences.length) {
      await instantlyUpdateCampaign(input.apiKey, existing, { sequences })
    }
    return {
      campaign: input.campaign,
      instantlyCampaignId: existing,
      created: false
    }
  }

  let emailList: string[] = []
  try {
    emailList = await instantlyListSendingEmails(input.apiKey)
  } catch {
    emailList = []
  }

  const created = await instantlyCreateCampaign(input.apiKey, {
    name: input.campaign.name,
    sequences: sequences.length ? sequences : undefined,
    emailList: emailList.length ? emailList : undefined,
    timezone: getInstantlyTimezone()
  })
  const instantlyId = trim(created.id) || trim((created as { campaign_id?: string }).campaign_id)
  if (!instantlyId) throw new InstantlyApiError('Instantly did not return a campaign id', 502)

  const stamp = new Date().toISOString()
  const { data, error } = await input.supabase
    .from('compass_pipeline_campaigns')
    .update({ instantly_campaign_id: instantlyId, updated_at: stamp })
    .eq('id', input.campaign.id)
    .select('id,instantly_campaign_id')
    .single()
  if (error || !data) {
    throw new Error(error?.message || 'Could not bind Instantly campaign')
  }

  await input.supabase.from('compass_pipeline_activity').insert({
    id: `cact-${crypto.randomUUID()}`,
    campaign_id: input.campaign.id,
    actor: 'operator',
    action: 'instantly_bound',
    body: `Created Instantly campaign ${instantlyId} (paused). Activate stays in Instantly.`,
    created_at: stamp
  })

  return {
    campaign: { ...input.campaign, instantly_campaign_id: instantlyId },
    instantlyCampaignId: instantlyId,
    created: true
  }
}

export async function pushSequenceToInstantly(input: {
  apiKey: string
  campaign: CompassCampaign
}): Promise<{ instantlyCampaignId: string; steps: number }> {
  const instantlyId = trim(input.campaign.instantly_campaign_id)
  if (!instantlyId) throw new InstantlyApiError('Bind or create an Instantly campaign first', 400)
  const sequences = outboundSequenceToInstantlySequences(input.campaign.sequence_draft)
  if (!sequences.length) throw new InstantlyApiError('No sequence draft to push', 400)
  await instantlyUpdateCampaign(input.apiKey, instantlyId, { sequences })
  return { instantlyCampaignId: instantlyId, steps: sequences[0]?.steps.length ?? 0 }
}

export async function pushLeadsToInstantly(input: {
  supabase: SupabaseClient
  campaign: CompassCampaign
  apiKey: string
  leadIds?: string[]
  dryRun?: boolean
  skipIfInWorkspace?: boolean
  verifyOnImport?: boolean
  requireOpener?: boolean
}): Promise<InstantlyPushLeadsResult> {
  const instantlyId = trim(input.campaign.instantly_campaign_id)
  if (!instantlyId) throw new InstantlyApiError('Bind or create an Instantly campaign first', 400)

  const leads = await loadCohortLeads(input.supabase, input.campaign.id, input.leadIds)
  const preview = previewPushLeads(leads, instantlyId, {
    requireOpener: input.requireOpener !== false
  })

  if (input.dryRun || preview.eligible.length === 0) {
    return {
      ...preview,
      dryRun: Boolean(input.dryRun) || preview.eligible.length === 0,
      instantlyCampaignId: instantlyId,
      uploaded: 0,
      created: [],
      instantlySkipped: 0,
      invalidEmails: 0,
      marked: 0
    }
  }

  const byEmail = new Map(
    leads
      .filter((row) => preview.eligible.some((e) => e.id === row.id))
      .map((row) => [trim(row.email).toLowerCase(), row])
  )
  const payloads: InstantlyLeadPayload[] = []
  const payloadLeads: LeadContact[] = []
  for (const row of preview.eligible) {
    const lead = byEmail.get(row.email)
    if (!lead) continue
    const payload = leadContactToInstantlyLead(lead)
    if (!payload) continue
    payloads.push(payload)
    payloadLeads.push(lead)
  }

  const created: InstantlyPushLeadsResult['created'] = []
  let uploaded = 0
  let instantlySkipped = 0
  let invalidEmails = 0

  for (const chunk of chunkItems(payloads, INSTANTLY_PUSH_CHUNK)) {
    const result = await instantlyAddLeadsBulk(input.apiKey, {
      campaignId: instantlyId,
      leads: chunk,
      skipIfInWorkspace: input.skipIfInWorkspace !== false,
      skipIfInCampaign: true,
      verifyOnImport: input.verifyOnImport !== false
    })
    uploaded += Number(result.leads_uploaded) || 0
    instantlySkipped += Number(result.skipped_count) || 0
    invalidEmails += Number(result.invalid_email_count) || 0
    for (const row of result.created_leads ?? []) {
      const email = trim(row.email).toLowerCase()
      const lead = email ? byEmail.get(email) : payloadLeads[row.index]
      if (!lead || !row.id) continue
      created.push({
        id: lead.id,
        email: trim(lead.email).toLowerCase(),
        instantlyLeadId: row.id
      })
    }
  }

  const stamp = new Date().toISOString()
  let marked = 0
  for (const row of created) {
    const lead = byEmail.get(row.email)
    const patch: Record<string, unknown> = {
      instantly_lead_id: row.instantlyLeadId,
      instantly_campaign_id: instantlyId,
      instantly_campaign_ids: [instantlyId],
      instantly_campaign_name: input.campaign.name,
      instantly_campaign: input.campaign.name,
      instantly_uploaded_at: stamp,
      instantly_synced_at: stamp,
      enrich_status: 'uploaded',
      updated_at: stamp
    }
    if (canStampInInstantly(lead?.outbound_status)) {
      patch.outbound_status = 'in_instantly'
    }
    const { data, error } = await input.supabase
      .from('lead_contacts')
      .update(patch)
      .eq('id', row.id)
      .select('id')
    if (!error && data?.length) marked += 1
  }

  if (created.length) {
    await input.supabase.from('compass_pipeline_activity').insert({
      id: `cact-${crypto.randomUUID()}`,
      campaign_id: input.campaign.id,
      actor: 'operator',
      action: 'instantly_push',
      body: `Pushed ${created.length} lead${created.length === 1 ? '' : 's'} to Instantly. Campaign stays paused until you activate.`,
      created_at: stamp
    })
  }

  return {
    ...preview,
    dryRun: false,
    instantlyCampaignId: instantlyId,
    uploaded,
    created,
    instantlySkipped,
    invalidEmails,
    marked
  }
}
