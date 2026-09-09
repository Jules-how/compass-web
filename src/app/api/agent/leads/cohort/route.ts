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
 * Accepts list_id or a campaign; campaign attachments use the same canonical search.
 */
export async function GET(request: Request) {
  const authError = requireAgentAuth(request)
  if (authError) return authError

  const url = new URL(request.url)
  const listId = url.searchParams.get('list_id')?.trim() || ''
  const campaignId = url.searchParams.get('pipeline_campaign_id')?.trim() || ''
  if (!listId && !campaignId) {
    return portalJson({ error: 'list_id_or_pipeline_campaign_id_required' }, { status: 400 })
  }

  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') || 50) || 50))
  const offset = Math.max(0, Number(url.searchParams.get('offset') || 0) || 0)
  const filters = parseLeadListFilters(url.searchParams)
  filters.pipeline_campaign_id = campaignId === 'none' ? campaignId : undefined
  filters.cohort_campaign_id = !listId && campaignId !== 'none' ? campaignId : undefined

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
      pipeline_campaign_id: campaignId || null,
      list_id: listId || null,
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
