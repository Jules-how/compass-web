import { requireAgentAuth } from '@/lib/agent-auth'
import { getPortalAdminClient } from '@/lib/portal-admin'
import { portalJson } from '@/lib/portal-http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const COHORT_COLUMNS =
  'id,name,email,company,city,state,linkedin,website,company_domain,vertical,enrich_status,lead_facts,opener,outbound_status,pipeline_campaign_id,cohort_tag,email_verify_status,email_verified_at,icp_status,review_count,hours_label,after_hours,capture_crack,email_origin'

/**
 * Harvest/attach input: contacts on a pipeline campaign.
 * Query: pipeline_campaign_id=… & enrich_status=none,queued & unverified_only=1 & limit=50 & offset=0
 */
export async function GET(request: Request) {
  const authError = requireAgentAuth(request)
  if (authError) return authError

  const url = new URL(request.url)
  const campaignId = url.searchParams.get('pipeline_campaign_id')?.trim() || ''
  if (!campaignId) {
    return portalJson({ error: 'pipeline_campaign_id_required' }, { status: 400 })
  }

  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') || 50) || 50))
  const offset = Math.max(0, Number(url.searchParams.get('offset') || 0) || 0)
  const statusParam = url.searchParams.get('enrich_status')?.trim() || ''
  const statuses = statusParam
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  const icpParam = url.searchParams.get('icp_status')?.trim() || ''
  const icpStatuses = icpParam
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)

  try {
    const admin = getPortalAdminClient()
    let query = admin
      .from('lead_contacts')
      .select(COHORT_COLUMNS, { count: 'exact' })
      .eq('pipeline_campaign_id', campaignId)
      .order('email', { ascending: true, nullsFirst: false })
      .range(offset, offset + limit - 1)

    if (statuses.length) {
      query = query.in('enrich_status', statuses)
    }
    if (icpStatuses.length) {
      query = query.in('icp_status', icpStatuses)
    }

    const unverifiedOnly = url.searchParams.get('unverified_only') === '1'
    if (unverifiedOnly) {
      query = query.is('email_verified_at', null)
    }

    const { data, error, count } = await query
    if (error) return portalJson({ error: 'list_failed', detail: error.message }, { status: 500 })

    return portalJson({
      ok: true,
      pipeline_campaign_id: campaignId,
      count: data?.length ?? 0,
      total: count ?? 0,
      offset,
      limit,
      leads: data ?? []
    })
  } catch (err) {
    console.error('[agent/leads/cohort]', err instanceof Error ? err.message : err)
    return portalJson({ error: 'list_failed' }, { status: 500 })
  }
}
