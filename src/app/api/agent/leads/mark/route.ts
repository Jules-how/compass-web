import { requireAgentAuth } from '@/lib/agent-auth'
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

/**
 * Bulk-mark leads with pipeline campaign / cohort / enrich readiness.
 * Body: { ids: string[], pipeline_campaign_id?, cohort_tag?, enrich_status? }
 * Caps at 500 ids per call.
 */
export async function PATCH(request: Request) {
  const authError = requireAgentAuth(request)
  if (authError) return authError

  let body: {
    ids?: string[]
    pipeline_campaign_id?: string | null
    cohort_tag?: string | null
    enrich_status?: string | null
  }
  try {
    body = (await readBoundedJson(request, 64 * 1024)) as typeof body
  } catch {
    return portalJson({ error: 'invalid_json' }, { status: 400 })
  }

  const ids = Array.isArray(body.ids)
    ? body.ids.map((id) => String(id).trim()).filter(Boolean).slice(0, 500)
    : []
  if (ids.length === 0) return portalJson({ error: 'ids_required' }, { status: 400 })

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString()
  }
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
    const status =
      typeof body.enrich_status === 'string' ? body.enrich_status.trim() : 'none'
    if (!ENRICH_STATUSES.has(status)) {
      return portalJson({ error: 'invalid_enrich_status' }, { status: 400 })
    }
    patch.enrich_status = status
  }

  if (Object.keys(patch).length <= 1) {
    return portalJson({ error: 'no_fields' }, { status: 400 })
  }

  try {
    const admin = getPortalAdminClient()
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
