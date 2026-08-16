import { requireAgentAuth } from '@/lib/agent-auth'
import { getPortalAdminClient } from '@/lib/portal-admin'
import { portalJson } from '@/lib/portal-http'
import {
  fetchMemberLeadIds,
  resolveCampaignCohort,
  selectLeadsByIds
} from '@/lib/lead-lists'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const COHORT_COLUMNS =
  'id,name,email,company,city,state,linkedin,vertical,enrich_status,lead_facts,opener,outbound_status,pipeline_campaign_id,cohort_tag'

type CohortLead = {
  email?: string | null
  enrich_status?: string | null
}

/**
 * Harvest/attach input: contacts on a CRM list or pipeline campaign.
 * Query: list_id=… or pipeline_campaign_id=… & enrich_status=none,queued & limit=50 & offset=0
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
  const statusParam = url.searchParams.get('enrich_status')?.trim() || ''
  const statuses = statusParam
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)

  try {
    const admin = getPortalAdminClient()
    let leadIds: string[]
    let source: 'list' | 'lists' | 'pipeline' = 'pipeline'
    let listIds: string[] = []
    if (listId) {
      leadIds = await fetchMemberLeadIds(admin, [listId])
      source = 'list'
      listIds = [listId]
    } else {
      const cohort = await resolveCampaignCohort(admin, campaignId)
      leadIds = cohort.leadIds
      source = cohort.source
      listIds = cohort.listIds
    }

    const rows = await selectLeadsByIds<CohortLead>(admin, COHORT_COLUMNS, leadIds)
    const filtered = statuses.length
      ? rows.filter((row) => statuses.includes(String(row.enrich_status || 'none')))
      : rows
    filtered.sort((a, b) => String(a.email || '').localeCompare(String(b.email || '')))
    const page = filtered.slice(offset, offset + limit)

    return portalJson({
      ok: true,
      list_id: listId || null,
      pipeline_campaign_id: campaignId || null,
      source,
      list_ids: listIds,
      count: page.length,
      total: filtered.length,
      offset,
      limit,
      leads: page
    })
  } catch (err) {
    console.error('[agent/leads/cohort]', err instanceof Error ? err.message : err)
    return portalJson({ error: 'list_failed' }, { status: 500 })
  }
}
