import type { NextRequest } from 'next/server'
import type { LeadContact, LeadListFilters } from '@/lib/types'
import { PROSPECT_OUTBOUND_STATUSES, parseLeadBucket } from '@/lib/lead-buckets'
import { requirePortalAccess } from '@/lib/portal-access'
import { portalAccessResponse, portalJson, portalJsonCached } from '@/lib/portal-http'
import { LEAD_LIST_COLUMNS, LEAD_PAGE_SIZE } from '@/lib/list-columns'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const filters: LeadListFilters = {
    vertical: searchParams.get('vertical') ?? undefined,
    source: searchParams.get('source') ?? undefined,
    outbound_status: searchParams.get('outbound_status') ?? undefined,
    city: searchParams.get('city') ?? undefined,
    bucket: parseLeadBucket(searchParams.get('bucket'))
  }
  const pageParam = Number(searchParams.get('page') ?? '1')
  const page = Number.isFinite(pageParam) && pageParam > 0 ? Math.floor(pageParam) : 1
  const pageSizeParam = Number(searchParams.get('pageSize') ?? String(LEAD_PAGE_SIZE))
  const pageSize = Number.isFinite(pageSizeParam)
    ? Math.min(Math.max(Math.floor(pageSizeParam), 1), 100)
    : LEAD_PAGE_SIZE
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  // Export path: optional higher cap via limit= (keeps page list lean).
  const limitParam = searchParams.get('limit')
  const exportLimit = limitParam
    ? Math.min(Math.max(Number(limitParam) || 100, 1), 5000)
    : null

  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    let query = supabase
      .from('lead_contacts')
      .select(LEAD_LIST_COLUMNS, { count: 'exact' })
      .order('last_outbound_at', { ascending: false, nullsFirst: false })
      .order('mirrored_at', { ascending: false })

    if (filters.vertical) query = query.eq('vertical', filters.vertical)
    if (filters.source) query = query.eq('source', filters.source)
    if (filters.outbound_status) query = query.eq('outbound_status', filters.outbound_status)
    if (filters.city) query = query.ilike('city', `%${filters.city}%`)

    // Bucket segmentation (Leads vs Prospects tabs). Explicit outbound_status
    // filter still wins when set.
    if (!filters.outbound_status) {
      const prospectList = PROSPECT_OUTBOUND_STATUSES.join(',')
      if (filters.bucket === 'prospects') {
        query = query.in('outbound_status', [...PROSPECT_OUTBOUND_STATUSES])
      } else {
        // Keep null / unknown / Instantly / unreplied / not-interested on Leads.
        query = query.or(
          `outbound_status.is.null,outbound_status.not.in.(${prospectList})`
        )
      }
    }

    if (exportLimit) {
      query = query.limit(exportLimit)
    } else {
      query = query.range(from, to)
    }

    const { data, error, count } = await query
    if (error) {
      return portalJson({ error: 'fetch_failed' }, { status: 400 })
    }
    return portalJsonCached({
      leads: (data ?? []) as LeadContact[],
      total: count ?? 0,
      page,
      pageSize: exportLimit ?? pageSize,
      bucket: filters.bucket ?? 'leads'
    })
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'fetch_failed' }, { status: 500 })
  }
}
