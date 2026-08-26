import { applyLeadIcpFields } from '@/lib/lead-icp'
import { parseCompanySite } from '@/lib/company-site'
import { parseLeadFacts } from '@/lib/lead-facts'
import { portalJson } from '@/lib/portal-http'
import type { SupabaseClient } from '@supabase/supabase-js'

const ENRICH_STATUSES = new Set([
  'none',
  'queued',
  'enriched',
  'thin',
  'opener_ready',
  'uploaded'
])

const EMAIL_VERIFY_STATUSES = new Set([
  'valid',
  'catch_all',
  'invalid',
  'unknown',
  'risky',
  'none'
])

export const OUTBOUND_STATUSES = new Set([
  'uncontacted',
  'in_instantly',
  'bounced',
  'out_of_office',
  'replied',
  'interested',
  'not_interested',
  'unsubscribed',
  'wrong_person',
  'suppressed',
  'dead',
  'meeting_booked',
  'converted'
])

export const MARK_BODY_MAX_BYTES = 256 * 1024
export const MAX_MARK_IDS = 500
export const MAX_MARK_ROWS = 50
export const MAX_OPENER = 400

export type MarkPatch = Record<string, unknown>

export type SharedMarkBody = {
  pipeline_campaign_id?: string | null
  cohort_tag?: string | null
  enrich_status?: string | null
  outbound_status?: string | null
  instantly_lead_id?: string | null
  instantly_campaign_id?: string | null
  instantly_campaign_name?: string | null
  instantly_campaign?: string | null
  instantly_uploaded_at?: string | null
  email_verify_status?: string | null
  email_verified?: boolean
  email_verified_at?: string | null
}

export function parseOptionalText(value: unknown): string | null {
  if (value == null) return null
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

function parseEnrichStatus(value: unknown): { ok: true; status: string } | { ok: false } {
  const status = typeof value === 'string' ? value.trim() : 'none'
  if (!ENRICH_STATUSES.has(status)) return { ok: false }
  return { ok: true, status }
}

export function applySharedMarkFields(
  patch: MarkPatch,
  body: SharedMarkBody
): { ok: true } | { ok: false; error: string } {
  if (body.pipeline_campaign_id !== undefined) {
    patch.pipeline_campaign_id =
      typeof body.pipeline_campaign_id === 'string'
        ? body.pipeline_campaign_id.trim() || null
        : null
  }
  if (body.cohort_tag !== undefined) {
    patch.cohort_tag =
      typeof body.cohort_tag === 'string' ? body.cohort_tag.trim() || null : null
  }
  if (body.enrich_status !== undefined) {
    const parsed = parseEnrichStatus(body.enrich_status)
    if (!parsed.ok) return { ok: false, error: 'invalid_enrich_status' }
    patch.enrich_status = parsed.status
  }
  if (body.outbound_status !== undefined) {
    const status = parseOptionalText(body.outbound_status)
    if (!status || !OUTBOUND_STATUSES.has(status)) {
      return { ok: false, error: 'invalid_outbound_status' }
    }
    patch.outbound_status = status
  }
  const leadId = parseOptionalText(body.instantly_lead_id)
  if (body.instantly_lead_id !== undefined) patch.instantly_lead_id = leadId
  const campaignId = parseOptionalText(body.instantly_campaign_id)
  if (body.instantly_campaign_id !== undefined) {
    patch.instantly_campaign_id = campaignId
    if (campaignId) patch.instantly_campaign_ids = [campaignId]
  }
  const campaignName =
    parseOptionalText(body.instantly_campaign_name) || parseOptionalText(body.instantly_campaign)
  if (body.instantly_campaign_name !== undefined || body.instantly_campaign !== undefined) {
    patch.instantly_campaign_name = campaignName
    patch.instantly_campaign = campaignName
  }
  if (body.instantly_uploaded_at !== undefined) {
    patch.instantly_uploaded_at = parseOptionalText(body.instantly_uploaded_at)
  } else if (campaignId || leadId || patch.outbound_status === 'in_instantly') {
    const stamp = new Date().toISOString()
    if (patch.instantly_uploaded_at === undefined) patch.instantly_uploaded_at = stamp
    patch.instantly_synced_at = stamp
  }
  if (body.email_verify_status !== undefined) {
    const status = parseOptionalText(body.email_verify_status)?.toLowerCase() || 'none'
    if (!EMAIL_VERIFY_STATUSES.has(status)) {
      return { ok: false, error: 'invalid_email_verify_status' }
    }
    patch.email_verify_status = status === 'none' ? null : status
    if (status === 'valid' || status === 'catch_all') {
      patch.email_verified_at = new Date().toISOString()
    }
  }
  if (body.email_verified === true) {
    patch.email_verified_at = new Date().toISOString()
    if (patch.email_verify_status === undefined) patch.email_verify_status = 'valid'
  } else if (body.email_verified === false) {
    patch.email_verified_at = null
  }
  if (
    body.email_verified_at !== undefined &&
    body.email_verified !== true &&
    body.email_verified !== false
  ) {
    patch.email_verified_at = parseOptionalText(body.email_verified_at)
  }
  return { ok: true }
}

export function sharedMarkFromUnknown(row: Record<string, unknown>): SharedMarkBody {
  return {
    pipeline_campaign_id: row.pipeline_campaign_id as string | null | undefined,
    cohort_tag: row.cohort_tag as string | null | undefined,
    enrich_status: row.enrich_status as string | null | undefined,
    outbound_status: row.outbound_status as string | null | undefined,
    instantly_lead_id: row.instantly_lead_id as string | null | undefined,
    instantly_campaign_id: row.instantly_campaign_id as string | null | undefined,
    instantly_campaign_name: row.instantly_campaign_name as string | null | undefined,
    instantly_campaign: row.instantly_campaign as string | null | undefined,
    instantly_uploaded_at: row.instantly_uploaded_at as string | null | undefined,
    email_verify_status: row.email_verify_status as string | null | undefined,
    email_verified: row.email_verified as boolean | undefined,
    email_verified_at: row.email_verified_at as string | null | undefined
  }
}

export const LEADS_MARK_DEPRECATED =
  'Prefer POST /api/agent/leads (commit) for bulk upsert + mark. PATCH /api/agent/leads/mark remains.'

export async function markLeadContacts(
  admin: SupabaseClient,
  body: {
    ids?: unknown
    emails?: unknown
    rows?: unknown
    lead_facts?: unknown
    opener?: unknown
  } & SharedMarkBody
): Promise<Response> {
  if (body.lead_facts !== undefined || body.opener !== undefined) {
    return portalJson({ error: 'use_rows_for_facts' }, { status: 400 })
  }

  const hasRows = Array.isArray(body.rows)
  const hasIds = Array.isArray(body.ids)
  const hasEmails = Array.isArray(body.emails)
  const modes = [hasRows, hasIds, hasEmails].filter(Boolean).length
  if (modes > 1) {
    return portalJson({ error: 'use_rows_or_ids_or_emails' }, { status: 400 })
  }

  if (hasRows) {
    const rawRows = (body.rows as unknown[]).slice(0, MAX_MARK_ROWS)
    if (rawRows.length === 0) return portalJson({ error: 'rows_required' }, { status: 400 })

    const parsed: { key: string; by: 'id' | 'email'; patch: MarkPatch }[] = []
    for (const raw of rawRows) {
      if (!raw || typeof raw !== 'object') {
        return portalJson({ error: 'row_invalid' }, { status: 400 })
      }
      const row = raw as Record<string, unknown>
      const id = typeof row.id === 'string' ? row.id.trim() : ''
      const email = parseOptionalText(row.email)?.toLowerCase() || ''
      if (!id && !email) return portalJson({ error: 'row_id_or_email_required' }, { status: 400 })
      const patch: MarkPatch = { updated_at: new Date().toISOString() }
      const shared = applySharedMarkFields(patch, sharedMarkFromUnknown(row))
      if (!shared.ok) return portalJson({ error: shared.error }, { status: 400 })
      if (row.lead_facts !== undefined) {
        const facts = parseLeadFacts(row.lead_facts)
        if (!facts.ok) {
          return portalJson({ error: facts.error, id: id || email }, { status: 400 })
        }
        patch.lead_facts = facts.facts
      }
      if (row.opener !== undefined) {
        if (row.opener != null && typeof row.opener !== 'string') {
          return portalJson({ error: 'opener_invalid', id: id || email }, { status: 400 })
        }
        const opener = parseOptionalText(row.opener)
        if (opener && opener.length > MAX_OPENER) {
          return portalJson({ error: 'opener_too_long', id: id || email }, { status: 400 })
        }
        patch.opener = opener
      }
      if (row.opener_track !== undefined) {
        patch.opener_track = parseOptionalText(row.opener_track)
      }
      if (row.opener_kind !== undefined) {
        patch.opener_kind = parseOptionalText(row.opener_kind)
      }
      const icp = applyLeadIcpFields(row, patch)
      if (!icp.ok) {
        return portalJson({ error: icp.error, id: id || email }, { status: 400 })
      }
      if (row.website !== undefined || row.company_domain !== undefined) {
        const site = parseCompanySite(
          typeof row.website === 'string'
            ? row.website
            : typeof row.company_domain === 'string'
              ? row.company_domain
              : ''
        )
        if (row.website !== undefined) patch.website = site.website
        if (row.company_domain !== undefined || row.website !== undefined) {
          patch.company_domain = site.company_domain
        }
      }
      if (Object.keys(patch).length <= 1) {
        return portalJson({ error: 'row_no_fields', id: id || email }, { status: 400 })
      }
      parsed.push({
        key: id || email,
        by: id ? 'id' : 'email',
        patch
      })
    }

    let updated = 0
    const failed: { id: string; error: string }[] = []
    for (const row of parsed) {
      let query = admin.from('lead_contacts').update(row.patch).select('id')
      query = row.by === 'id' ? query.eq('id', row.key) : query.eq('email', row.key)
      const { data, error } = await query
      if (error) {
        failed.push({ id: row.key, error: error.message })
        continue
      }
      if (!data?.length) {
        failed.push({ id: row.key, error: 'not_found' })
        continue
      }
      updated += 1
    }
    return portalJson({
      ok: failed.length === 0,
      updated,
      deprecated: LEADS_MARK_DEPRECATED,
      failed: failed.length ? failed : undefined
    })
  }

  const ids = hasIds
    ? (body.ids as unknown[])
        .map((id) => (typeof id === 'string' ? id.trim() : ''))
        .filter(Boolean)
        .slice(0, MAX_MARK_IDS)
    : []
  const emails = hasEmails
    ? (body.emails as unknown[])
        .map((email) => (typeof email === 'string' ? email.trim().toLowerCase() : ''))
        .filter(Boolean)
        .slice(0, MAX_MARK_IDS)
    : []
  if (ids.length === 0 && emails.length === 0) {
    return portalJson({ error: 'ids_or_emails_required' }, { status: 400 })
  }

  const patch: MarkPatch = { updated_at: new Date().toISOString() }
  const shared = applySharedMarkFields(patch, body)
  if (!shared.ok) return portalJson({ error: shared.error }, { status: 400 })
  const icp = applyLeadIcpFields(body as Record<string, unknown>, patch)
  if (!icp.ok) return portalJson({ error: icp.error }, { status: 400 })
  if (Object.keys(patch).length <= 1) {
    return portalJson({ error: 'no_fields' }, { status: 400 })
  }

  let query = admin.from('lead_contacts').update(patch).select('id')
  query = ids.length ? query.in('id', ids) : query.in('email', emails)
  const { data, error } = await query
  if (error) {
    return portalJson({ error: 'update_failed', detail: error.message }, { status: 400 })
  }
  return portalJson({
    ok: true,
    updated: (data ?? []).length,
    deprecated: LEADS_MARK_DEPRECATED
  })
}

const ID_WRITE_BATCH = 500

/** Operator bulk PATCH by id. Chunks writes the same way as commit. */
export async function patchLeadContactsByIds(
  admin: SupabaseClient,
  ids: string[],
  patch: Record<string, unknown>
): Promise<number> {
  const body = { ...patch, updated_at: new Date().toISOString() }
  let updated = 0
  for (let i = 0; i < ids.length; i += ID_WRITE_BATCH) {
    const slice = ids.slice(i, i + ID_WRITE_BATCH)
    const { data, error } = await admin.from('lead_contacts').update(body).in('id', slice).select('id')
    if (error) throw new Error(error.message)
    updated += data?.length ?? 0
  }
  return updated
}
