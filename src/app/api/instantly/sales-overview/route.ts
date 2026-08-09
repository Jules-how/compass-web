import type { NextRequest } from 'next/server'
import { requirePortalAccess } from '@/lib/portal-access'
import { portalAccessResponse, portalJson, portalJsonCached } from '@/lib/portal-http'
import {
  getInstantlyApiKey,
  InstantlyApiError
} from '@/lib/instantly'
import { SALES_OVERVIEW_DEMO } from '@/lib/sales-demo-data'
import {
  loadSalesOverviewFromInstantly,
  type SalesOverviewCrmDealRow
} from '@/lib/sales-overview'

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

/**
 * GET /api/instantly/sales-overview — Sales Overview KPIs, campaigns, daily
 * volume, and deal flow from Instantly (plus CRM opportunity rows when present).
 */
export async function GET(_request: NextRequest) {
  try {
    const { supabase } = await requirePortalAccess({ operator: true })

    const apiKey = getInstantlyApiKey()
    if (!apiKey) {
      return portalJsonCached({
        ...SALES_OVERVIEW_DEMO,
        source: 'demo' as const,
        warning: 'INSTANTLY_API_KEY is not configured'
      })
    }

    const crmDeals = await loadCrmDealRows(supabase)
    const model = await loadSalesOverviewFromInstantly(apiKey, { crmDeals })
    return portalJsonCached(model, {}, 60)
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
