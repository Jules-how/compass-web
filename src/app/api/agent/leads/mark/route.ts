import { requireAgentAuth } from '@/lib/agent-auth'
import { parseLeadFacts } from '@/lib/lead-facts'
import { getPortalAdminClient } from '@/lib/portal-admin'
import { portalJson, readBoundedJson } from '@/lib/portal-http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ENRICH_STATUSES = new Set([
  'none',
  'queued',
  'enriched',
  'thin',
  'opener_ready',
  'uploaded'
])

const MARK_BODY_MAX_BYTES = 256 * 1024
const MAX_IDS = 500
const MAX_ROWS = 50
const MAX_OPENER = 400

type MarkPatch = Record<string, unknown>

function parseEnrichStatus(value: unknown): { ok: true; status: string } | { ok: false } {
  const status = typeof value === 'string' ? value.trim() : 'none'
  if (!ENRICH_STATUSES.has(status)) return { ok: false }
  return { ok: true, status }
}

function parseOptionalText(value: unknown): string | null {
  if (value == null) return null
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

function applySharedFields(
  patch: MarkPatch,
  body: {
    pipeline_campaign_id?: string | null
    cohort_tag?: string | null
    enrich_status?: string | null
  }
): Response | null {
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
    if (!parsed.ok) return portalJson({ error: 'invalid_enrich_status' }, { status: 400 })
    patch.enrich_status = parsed.status
  }
  return null
}

/**
 * Mark leads: bulk campaign/cohort/status, or per-row facts/opener.
 * Bulk: { ids: string[], pipeline_campaign_id?, cohort_tag?, enrich_status? }
 * Rows: { rows: [{ id, lead_facts?, opener?, enrich_status?, pipeline_campaign_id?, cohort_tag? }] }
 * Caps: 500 ids, 50 rows. Do not send lead_facts on the bulk ids path.
 */
export async function PATCH(request: Request) {
  const authError = requireAgentAuth(request)
  if (authError) return authError

  let body: {
    ids?: unknown
    rows?: unknown
    pipeline_campaign_id?: string | null
    cohort_tag?: string | null
    enrich_status?: string | null
    lead_facts?: unknown
    opener?: unknown
  }
  try {
    body = (await readBoundedJson(request, MARK_BODY_MAX_BYTES)) as typeof body
  } catch {
    return portalJson({ error: 'invalid_json' }, { status: 400 })
  }

  if (body.lead_facts !== undefined || body.opener !== undefined) {
    return portalJson({ error: 'use_rows_for_facts' }, { status: 400 })
  }

  const hasRows = Array.isArray(body.rows)
  const hasIds = Array.isArray(body.ids)
  if (hasRows && hasIds) {
    return portalJson({ error: 'use_rows_or_ids' }, { status: 400 })
  }

  try {
    const admin = getPortalAdminClient()

    if (hasRows) {
      const rawRows = (body.rows as unknown[]).slice(0, MAX_ROWS)
      if (rawRows.length === 0) return portalJson({ error: 'rows_required' }, { status: 400 })

      const parsed: { id: string; patch: MarkPatch }[] = []
      for (const raw of rawRows) {
        if (!raw || typeof raw !== 'object') {
          return portalJson({ error: 'row_invalid' }, { status: 400 })
        }
        const row = raw as Record<string, unknown>
        const id = typeof row.id === 'string' ? row.id.trim() : ''
        if (!id) return portalJson({ error: 'row_id_required' }, { status: 400 })
        const patch: MarkPatch = { updated_at: new Date().toISOString() }
        const sharedError = applySharedFields(patch, {
          pipeline_campaign_id: row.pipeline_campaign_id as string | null | undefined,
          cohort_tag: row.cohort_tag as string | null | undefined,
          enrich_status: row.enrich_status as string | null | undefined
        })
        if (sharedError) return sharedError
        if (row.lead_facts !== undefined) {
          const facts = parseLeadFacts(row.lead_facts)
          if (!facts.ok) {
            return portalJson({ error: facts.error, id }, { status: 400 })
          }
          patch.lead_facts = facts.facts
        }
        if (row.opener !== undefined) {
          if (row.opener != null && typeof row.opener !== 'string') {
            return portalJson({ error: 'opener_invalid', id }, { status: 400 })
          }
          const opener = parseOptionalText(row.opener)
          if (opener && opener.length > MAX_OPENER) {
            return portalJson({ error: 'opener_too_long', id }, { status: 400 })
          }
          patch.opener = opener
        }
        if (Object.keys(patch).length <= 1) {
          return portalJson({ error: 'row_no_fields', id }, { status: 400 })
        }
        parsed.push({ id, patch })
      }

      let updated = 0
      const failed: { id: string; error: string }[] = []
      for (const row of parsed) {
        const { data, error } = await admin
          .from('lead_contacts')
          .update(row.patch)
          .eq('id', row.id)
          .select('id')
        if (error) {
          failed.push({ id: row.id, error: error.message })
          continue
        }
        if (!data?.length) {
          failed.push({ id: row.id, error: 'not_found' })
          continue
        }
        updated += 1
      }
      return portalJson({
        ok: failed.length === 0,
        updated,
        failed: failed.length ? failed : undefined
      })
    }

    const ids = hasIds
      ? (body.ids as unknown[])
          .map((id) => (typeof id === 'string' ? id.trim() : ''))
          .filter(Boolean)
          .slice(0, MAX_IDS)
      : []
    if (ids.length === 0) return portalJson({ error: 'ids_required' }, { status: 400 })

    const patch: MarkPatch = { updated_at: new Date().toISOString() }
    const sharedError = applySharedFields(patch, body)
    if (sharedError) return sharedError
    if (Object.keys(patch).length <= 1) {
      return portalJson({ error: 'no_fields' }, { status: 400 })
    }

    const { data, error } = await admin
      .from('lead_contacts')
      .update(patch)
      .in('id', ids)
      .select('id')
    if (error) {
      return portalJson({ error: 'update_failed', detail: error.message }, { status: 400 })
    }
    return portalJson({ ok: true, updated: (data ?? []).length })
  } catch (err) {
    console.error('[agent/leads/mark]', err instanceof Error ? err.message : err)
    return portalJson({ error: 'update_failed' }, { status: 500 })
  }
}
