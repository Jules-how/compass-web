import type { NextRequest } from 'next/server'
import { requirePortalAccess } from '@/lib/portal-access'
import { portalAccessResponse, portalJson, portalJsonCached } from '@/lib/portal-http'
import {
  InstantlyApiError,
  resolveInstantlyApiKey
} from '@/lib/instantly'
import { SALES_OVERVIEW_DEMO } from '@/lib/sales-demo-data'
import {
  loadSalesOverviewFromInstantly,
  type SalesOverviewCrmDealRow
} from '@/lib/sales-overview'
import { leadStagesInOrder, stageToolHref, type LeadPipelineStage } from '@/lib/pipeline-spine'

export const dynamic = 'force-dynamic'

async function loadCrmDealRows(
  supabase: Awaited<ReturnType<typeof requirePortalAccess>>['supabase']
): Promise<SalesOverviewCrmDealRow[]> {
  try {
    const { data, error } = await supabase
      .from('lead_contacts')
      .select(
        'id,name,company,outbound_status,instantly_campaign_name,updated_at,mirrored_at'
      )
      .in('outbound_status', ['interested', 'booked', 'converted', 'meeting_booked'])
      .order('mirrored_at', { ascending: false })
      .limit(12)

    if (error || !data) return []
    return data as SalesOverviewCrmDealRow[]
  } catch {
    return []
  }
}

async function loadSpineCounts(
  supabase: Awaited<ReturnType<typeof requirePortalAccess>>['supabase']
): Promise<Array<{ stage: string; count: number; href: string }>> {
  const stages = leadStagesInOrder()
  const counts = new Map(stages.map((s) => [s, 0]))
  const { data } = await supabase.from('lead_contacts').select('pipeline_stage')
  for (const row of data ?? []) {
    const stage = String(row.pipeline_stage || 'Lead')
    counts.set(stage as LeadPipelineStage, (counts.get(stage as LeadPipelineStage) ?? 0) + 1)
  }
  return stages.map((stage) => ({
    stage,
    count: counts.get(stage) ?? 0,
    href: stageToolHref(stage)
  }))
}

/**
 * GET /api/instantly/sales-overview — Sales Overview KPIs, campaigns, daily
 * volume, and deal flow from Instantly (plus CRM opportunity rows when present).
 */
export async function GET(_request: NextRequest) {
  try {
    const { supabase } = await requirePortalAccess({ operator: true })

    const apiKey = await resolveInstantlyApiKey(supabase)
    if (!apiKey) {
      return portalJsonCached({
        ...SALES_OVERVIEW_DEMO,
        source: 'demo' as const,
        warning: 'Instantly API key is not configured'
      })
    }

    const crmDeals = await loadCrmDealRows(supabase)
    const [model, spineCounts] = await Promise.all([
      loadSalesOverviewFromInstantly(apiKey, { crmDeals }),
      loadSpineCounts(supabase)
    ])
    return portalJsonCached({ ...model, spineCounts }, {}, 60)
  } catch (err) {
    const access = portalAccessResponse(err)
    if (access) return access

    if (err instanceof InstantlyApiError) {
      return portalJson(
        {
          ...SALES_OVERVIEW_DEMO,
          error: 'instantly_unavailable',
          detail: err.message,
          source: 'demo' as const,
          warning: 'instantly_unavailable'
        },
        { status: 200 }
      )
    }

    return portalJson(
      {
        ...SALES_OVERVIEW_DEMO,
        error: 'fetch_failed',
        source: 'demo' as const,
        warning: 'fetch_failed'
      },
      { status: 200 }
    )
  }
}
