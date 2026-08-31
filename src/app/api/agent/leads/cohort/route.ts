import { requireAgentAuth } from '@/lib/agent-auth'
import { getPortalAdminClient } from '@/lib/portal-admin'
import { portalJson } from '@/lib/portal-http'
import { parseLeadListFilters } from '@/lib/leads-query'
import { searchLeadContacts } from '@/lib/lead-search'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DEPRECATED =
  'Use GET /api/agent/leads?view=rows&columns=cohort&pipeline_campaign_id=… (or none for unattached).'

/**
 * Alias: harvest/attach input. Same filters as GET /api/agent/leads (cohort columns).
 * pipeline_campaign_id still required here so existing skill calls keep working.
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
  const filters = parseLeadListFilters(url.searchParams)
  filters.pipeline_campaign_id = campaignId

  try {
    const admin = getPortalAdminClient()
    const result = await searchLeadContacts(admin, filters, {
      mode: 'agent',
      columns: 'cohort',
      limit,
      offset
    })

    return portalJson({
      ok: true,
      deprecated: DEPRECATED,
      pipeline_campaign_id: campaignId,
      count: result.count,
      total: result.total,
      offset,
      limit,
      leads: result.leads
    })
  } catch (err) {
    console.error('[agent/leads/cohort]', err instanceof Error ? err.message : err)
    return portalJson({ error: 'list_failed' }, { status: 500 })
  }
}
