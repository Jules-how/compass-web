import type { SupabaseClient } from '@supabase/supabase-js'
import { siteFromEmailOrUrl } from '@/lib/company-site'
import { applyLeadIcpFields } from '@/lib/lead-icp'
import { parseLeadFacts } from '@/lib/lead-facts'
import {
  companyCityKey,
  mapLegacyEmailOrigin,
  mapLegacyEnrichStatus,
  mapLegacyIcpStatus,
  normalizeCompanyKey,
  normalizeEmail,
  normalizeLinkedin,
  normalizePhone
} from '@/lib/lead-import-shared'
import { isIcpSkip } from '@/lib/lead-icp'
import { applySharedMarkFields, type SharedMarkBody } from '@/lib/lead-mark'
import { appendEvidence } from '@/lib/events'

export const LEAD_WRITE_BATCH = 500
export const AGENT_LEADS_BODY_MAX_BYTES = 8 * 1024 * 1024

const ENRICH_STATUSES = new Set([
  'none',
  'queued',
  'enriched',
  'thin',
  'opener_ready',
  'uploaded'
])

export type LeadCommitExisting = {
  id: string
  email: string | null
  company: string | null
  city: string | null
  company_domain: string | null
  outbound_status: string | null
  icp_status: string | null
}

export type LeadCommitInput = {
  email?: unknown
  company?: unknown
  name?: unknown
  phone?: unknown
  role?: unknown
  city?: unknown
  state?: unknown
  linkedin?: unknown
  website?: unknown
  tags?: unknown
  opener?: unknown
  opener_track?: unknown
  opener_kind?: unknown
  lead_facts?: unknown
  icp_status?: unknown
  vertical?: unknown
  source?: unknown
  cohort_tag?: unknown
  pipeline_campaign_id?: unknown
  enrich_status?: unknown
  outbound_status?: unknown
  review_count?: unknown
  hours_label?: unknown
  after_hours?: unknown
  capture_crack?: unknown
  email_origin?: unknown
  company_domain?: unknown
  [key: string]: unknown
}

export type LeadCommitDefaults = LeadCommitInput

export type LeadCommitDecision =
  | { action: 'skip'; key: string; reason: string }
  | { action: 'company_dupe'; key: string; reason: 'company_dupe'; existing_id: string }
  | { action: 'insert'; key: string; row: Record<string, unknown> }
  | { action: 'update'; key: string; id: string; patch: Record<string, unknown> }

export type LeadCommitResult = {
  ok: boolean
  inserted: number
  updated: number
  skipped: Array<{ key: string; reason: string; existing_id?: string }>
  failed: Array<{ key: string; error: string }>
}

function asText(value: unknown): string {
  if (value == null) return ''
  return String(value).trim()
}

function optionalText(value: unknown): string | null {
  const text = asText(value)
  return text || null
}

export function mergeLeadCommitRow(
  defaults: LeadCommitDefaults | undefined,
  row: LeadCommitInput
): LeadCommitInput {
  return { ...(defaults ?? {}), ...row }
}

export function decideLeadCommit(
  incoming: LeadCommitInput,
  lookups: {
    byEmail: Map<string, LeadCommitExisting>
    byDomain: Map<string, LeadCommitExisting>
    byCompanyCity: Map<string, LeadCommitExisting>
  },
  options?: { now?: string; source?: string }
): LeadCommitDecision {
  const now = options?.now ?? new Date().toISOString()
  const email = normalizeEmail(asText(incoming.email))
  const company = asText(incoming.company)
  const key = email || normalizeCompanyKey(company) || 'row'
  if (!email) return { action: 'skip', key, reason: 'missing email' }
  if (!company) return { action: 'skip', key: email, reason: 'missing company' }

  const site = siteFromEmailOrUrl({
    email,
    website: asText(incoming.website) || asText(incoming.company_domain)
  })
  const domain = site.company_domain
  const city = asText(incoming.city)
  const cityKey = companyCityKey(company, city)

  const emailMatch = lookups.byEmail.get(email)
  if (emailMatch) {
    return {
      action: 'update',
      key: email,
      id: emailMatch.id,
      patch: buildUpdatePatch(incoming, emailMatch, { email, company, site, now })
    }
  }

  if (domain) {
    const domainMatch = lookups.byDomain.get(domain)
    if (domainMatch) {
      return { action: 'company_dupe', key: email, reason: 'company_dupe', existing_id: domainMatch.id }
    }
  }
  if (cityKey) {
    const companyMatch = lookups.byCompanyCity.get(cityKey)
    if (companyMatch) {
      return { action: 'company_dupe', key: email, reason: 'company_dupe', existing_id: companyMatch.id }
    }
  }

  return {
    action: 'insert',
    key: email,
    row: buildInsertRow(incoming, { email, company, site, now, source: options?.source })
  }
}

function mapEnrich(value: unknown): string | null {
  const mapped = mapLegacyEnrichStatus(optionalText(value))
  if (!mapped) return null
  return ENRICH_STATUSES.has(mapped) ? mapped : mapped
}

function buildBaseFields(
  incoming: LeadCommitInput,
  ctx: {
    email: string
    company: string
    site: { website: string | null; company_domain: string | null }
    now: string
  }
): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    email: ctx.email,
    company: ctx.company,
    updated_at: ctx.now
  }
  if (incoming.name !== undefined) patch.name = optionalText(incoming.name)
  if (incoming.phone !== undefined) patch.phone = normalizePhone(asText(incoming.phone)) || null
  if (incoming.role !== undefined) patch.role = optionalText(incoming.role)
  if (incoming.city !== undefined) patch.city = optionalText(incoming.city)
  if (incoming.state !== undefined) patch.state = optionalText(incoming.state)
  if (incoming.linkedin !== undefined) patch.linkedin = normalizeLinkedin(asText(incoming.linkedin)) || null
  if (incoming.website !== undefined || incoming.company_domain !== undefined) {
    patch.website = ctx.site.website
    patch.company_domain = ctx.site.company_domain
  } else if (ctx.site.company_domain) {
    patch.website = ctx.site.website
    patch.company_domain = ctx.site.company_domain
  }
  if (incoming.tags !== undefined) patch.tags = optionalText(incoming.tags)
  if (incoming.vertical !== undefined) patch.vertical = optionalText(incoming.vertical)
  if (incoming.source !== undefined) patch.source = optionalText(incoming.source)
  if (incoming.cohort_tag !== undefined) patch.cohort_tag = optionalText(incoming.cohort_tag)
  if (incoming.pipeline_campaign_id !== undefined) {
    patch.pipeline_campaign_id = optionalText(incoming.pipeline_campaign_id)
  }
  if (incoming.enrich_status !== undefined) {
    patch.enrich_status = mapEnrich(incoming.enrich_status) ?? 'none'
  }
  if (incoming.opener !== undefined) patch.opener = optionalText(incoming.opener)
  if (incoming.opener_track !== undefined) patch.opener_track = optionalText(incoming.opener_track)
  if (incoming.opener_kind !== undefined) patch.opener_kind = optionalText(incoming.opener_kind)
  if (incoming.lead_facts !== undefined) {
    const facts = parseLeadFacts(incoming.lead_facts)
    if (facts.ok) patch.lead_facts = facts.facts
  }
  const icp = applyLeadIcpFields(
    {
      ...incoming,
      icp_status:
        incoming.icp_status !== undefined
          ? mapLegacyIcpStatus(optionalText(incoming.icp_status))
          : undefined,
      email_origin:
        incoming.email_origin !== undefined
          ? mapLegacyEmailOrigin(optionalText(incoming.email_origin))
          : undefined
    },
    patch
  )
  if (!icp.ok) {
    // Leave invalid ICP off the patch; caller can still write the rest.
  }
  if (incoming.outbound_status !== undefined) {
    patch.outbound_status = optionalText(incoming.outbound_status)
  }
  if (incoming.import_batch_id !== undefined) {
    patch.import_batch_id = optionalText(incoming.import_batch_id)
  }
  if (incoming.lead_status_source !== undefined) {
    patch.lead_status_source = optionalText(incoming.lead_status_source)
  }
  if (incoming.email_verify_status !== undefined) {
    patch.email_verify_status = optionalText(incoming.email_verify_status)
  }
  return patch
}

function buildUpdatePatch(
  incoming: LeadCommitInput,
  existing: LeadCommitExisting,
  ctx: {
    email: string
    company: string
    site: { website: string | null; company_domain: string | null }
    now: string
  }
): Record<string, unknown> {
  const patch = buildBaseFields(incoming, ctx)
  if (isIcpSkip(existing.icp_status)) {
    patch.icp_status = 'skip'
  }
  // Import enriches identity; it cannot erase any established outreach state.
  if (existing.outbound_status && existing.outbound_status !== 'uncontacted') {
    delete patch.outbound_status
  }
  return patch
}

function buildInsertRow(
  incoming: LeadCommitInput,
  ctx: {
    email: string
    company: string
    site: { website: string | null; company_domain: string | null }
    now: string
    source?: string
  }
): Record<string, unknown> {
  const patch = buildBaseFields(incoming, ctx)
  return {
    id: `contact-${crypto.randomUUID()}`,
    name: optionalText(incoming.name) || ctx.company,
    phone: incoming.phone !== undefined ? normalizePhone(asText(incoming.phone)) || null : null,
    role: optionalText(incoming.role),
    city: optionalText(incoming.city),
    state: optionalText(incoming.state),
    linkedin: incoming.linkedin !== undefined ? normalizeLinkedin(asText(incoming.linkedin)) || null : null,
    vertical: optionalText(incoming.vertical),
    source: optionalText(incoming.source) || ctx.source || 'agent',
    outbound_status: optionalText(incoming.outbound_status) || 'uncontacted',
    enrich_status: mapEnrich(incoming.enrich_status) ?? 'none',
    icp_status: mapLegacyIcpStatus(optionalText(incoming.icp_status)) || 'none',
    email_origin: mapLegacyEmailOrigin(optionalText(incoming.email_origin)) || 'unknown',
    recontact_ok: 1,
    lead_status_source: 'agent_commit',
    created_at: ctx.now,
    mirrored_at: ctx.now,
    ...patch
  }
}

function remember(lookups: {
  byEmail: Map<string, LeadCommitExisting>
  byDomain: Map<string, LeadCommitExisting>
  byCompanyCity: Map<string, LeadCommitExisting>
}, row: LeadCommitExisting) {
  const email = normalizeEmail(row.email || '')
  if (email) lookups.byEmail.set(email, row)
  if (row.company_domain) lookups.byDomain.set(row.company_domain.toLowerCase(), row)
  const cityKey = companyCityKey(row.company, row.city)
  if (cityKey) lookups.byCompanyCity.set(cityKey, row)
}

async function fetchExisting(
  admin: SupabaseClient,
  emails: string[],
  domains: string[],
  companies: string[]
): Promise<LeadCommitExisting[]> {
  const cols = 'id,email,company,city,company_domain,outbound_status,icp_status'
  const found = new Map<string, LeadCommitExisting>()

  const load = async (column: string, values: string[]) => {
    for (let i = 0; i < values.length; i += LEAD_WRITE_BATCH) {
      const slice = values.slice(i, i + LEAD_WRITE_BATCH)
      if (!slice.length) continue
      const { data, error } = await admin.from('lead_contacts').select(cols).in(column, slice)
      if (error) throw new Error(error.message)
      for (const row of data ?? []) {
        const item = row as LeadCommitExisting
        found.set(item.id, item)
      }
    }
  }

  await load('email', emails)
  await load('company_domain', domains)
  await load('company', companies)
  return [...found.values()]
}

export async function commitLeadRows(
  admin: SupabaseClient,
  input: {
    defaults?: LeadCommitDefaults
    rows: LeadCommitInput[]
    mark?: SharedMarkBody
    source?: string
    dryRun?: boolean
  }
): Promise<LeadCommitResult> {
  const now = new Date().toISOString()
  const skipped: LeadCommitResult['skipped'] = []
  const failed: LeadCommitResult['failed'] = []
  const inserts: Array<{ key: string; row: Record<string, unknown> }> = []
  const updates: Array<{ key: string; id: string; patch: Record<string, unknown> }> = []

  const mergedRows = input.rows.map((row) => mergeLeadCommitRow(input.defaults, row))
  const emails = mergedRows.map((row) => normalizeEmail(asText(row.email))).filter(Boolean)
  const domains = mergedRows
    .map((row) => siteFromEmailOrUrl({ email: asText(row.email), website: asText(row.website) }).company_domain)
    .filter((d): d is string => Boolean(d))
  const companies = mergedRows.map((row) => asText(row.company)).filter(Boolean)

  const existing = input.dryRun
    ? []
    : await fetchExisting(admin, [...new Set(emails)], [...new Set(domains)], [...new Set(companies)])
  const lookups = {
    byEmail: new Map<string, LeadCommitExisting>(),
    byDomain: new Map<string, LeadCommitExisting>(),
    byCompanyCity: new Map<string, LeadCommitExisting>()
  }
  for (const row of existing) remember(lookups, row)

  for (const incoming of mergedRows) {
    const decision = decideLeadCommit(incoming, lookups, { now, source: input.source })
    if (decision.action === 'skip') {
      skipped.push({ key: decision.key, reason: decision.reason })
      continue
    }
    if (decision.action === 'company_dupe') {
      skipped.push({
        key: decision.key,
        reason: decision.reason,
        existing_id: decision.existing_id
      })
      continue
    }
    if (decision.action === 'insert') {
      inserts.push({ key: decision.key, row: decision.row })
      remember(lookups, {
        id: String(decision.row.id),
        email: String(decision.row.email ?? ''),
        company: String(decision.row.company ?? ''),
        city: (decision.row.city as string | null) ?? null,
        company_domain: (decision.row.company_domain as string | null) ?? null,
        outbound_status: (decision.row.outbound_status as string | null) ?? 'uncontacted',
        icp_status: (decision.row.icp_status as string | null) ?? 'none'
      })
      continue
    }
    updates.push({ key: decision.key, id: decision.id, patch: decision.patch })
  }

  if (input.dryRun) {
    return {
      ok: true,
      inserted: inserts.length,
      updated: updates.length,
      skipped,
      failed
    }
  }

  let inserted = 0
  let updated = 0
  const touchedIds: string[] = []

  for (let i = 0; i < inserts.length; i += LEAD_WRITE_BATCH) {
    const slice = inserts.slice(i, i + LEAD_WRITE_BATCH)
    const { error } = await admin.from('lead_contacts').insert(slice.map((item) => item.row))
    if (error) {
      for (const item of slice) failed.push({ key: item.key, error: error.message })
      continue
    }
    inserted += slice.length
    for (const item of slice) touchedIds.push(String(item.row.id))
  }

  for (const item of updates) {
    const { error } = await admin.from('lead_contacts').update(item.patch).eq('id', item.id)
    if (error) {
      failed.push({ key: item.key, error: error.message })
      continue
    }
    updated += 1
    touchedIds.push(item.id)
  }

  if (input.mark && touchedIds.length) {
    const markPatch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    const markError = applySharedMarkFields(markPatch, input.mark)
    if (markError.ok) {
      for (let i = 0; i < touchedIds.length; i += LEAD_WRITE_BATCH) {
        const slice = touchedIds.slice(i, i + LEAD_WRITE_BATCH)
        const { error } = await admin.from('lead_contacts').update(markPatch).in('id', slice)
        if (error) {
          failed.push({ key: 'mark', error: error.message })
        }
      }
    }
  }

  if (!input.dryRun && (inserted > 0 || updated > 0)) {
    try {
      await appendEvidence(admin, {
        source: 'compass',
        type: 'lead.commit',
        ts: now,
        native_id: `${input.source || 'compass'}:${now}:${inserted}:${updated}`,
        payload: {
          source: input.source || 'compass',
          inserted,
          updated,
          skipped: skipped.length,
          filters: input.defaults ?? {}
        }
      })
    } catch {
      // best-effort
    }
  }

  return {
    ok: failed.length === 0,
    inserted,
    updated,
    skipped,
    failed
  }
}
