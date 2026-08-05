import type { NextRequest } from 'next/server'
import { requirePortalAccess } from '@/lib/portal-access'
import { portalAccessResponse, portalJson, portalJsonCached } from '@/lib/portal-http'
import { projectInboundLead } from '@/lib/inbound-leads-ui'
import { LEAD_PAGE_SIZE } from '@/lib/list-columns'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const sourceFilter = new URL(request.url).searchParams.get('source') ?? undefined

  try {
    const access = await requirePortalAccess({ operator: true })
    let query = access.supabase
      .from('portal_inbound_leads')
      .select(
        'id,tenant_id,external_id,source,channel,name,email,phone,submitted_at,summary,created_at',
        { count: 'exact' }
      )
      .order('submitted_at', { ascending: false })
      .limit(LEAD_PAGE_SIZE)

    if (sourceFilter) query = query.eq('source', sourceFilter)

    const { data, error, count } = await query
    if (error) return portalJson({ error: 'fetch_failed', detail: error.message }, { status: 400 })

    return portalJsonCached({
      leads: ((data ?? []) as Record<string, unknown>[]).map(projectInboundLead),
      total: count ?? 0
    })
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'fetch_failed' }, { status: 500 })
  }
}
