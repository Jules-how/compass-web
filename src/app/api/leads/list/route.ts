import type { NextRequest } from 'next/server'
import type { LeadContact, LeadListFilters } from '@/lib/types'
import { requirePortalAccess } from '@/lib/portal-access'
import { portalAccessResponse, portalJson, portalJsonCached } from '@/lib/portal-http'
import { LEAD_LIST_COLUMNS, LEAD_PAGE_SIZE } from '@/lib/list-columns'
import { applyLeadFilters, parseLeadListFilters, type LeadFilterQuery } from '@/lib/leads-query'

export const dynamic = 'force-dynamic'

type ListQuery = LeadFilterQuery & {
  limit: (n: number) => ListQuery
  range: (from: number, to: number) => ListQuery
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const filters: LeadListFilters = parseLeadListFilters(searchParams)
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
    // Cast away supabase-js deep generics before dynamic filter chaining.
    let query = supabase
      .from('lead_contacts')
      .select(LEAD_LIST_COLUMNS, { count: 'exact' })
      .order('mirrored_at', { ascending: false }) as unknown as ListQuery

    query = applyLeadFilters(query, filters) as ListQuery

    if (exportLimit) {
      query = query.limit(exportLimit)
    } else {
      query = query.range(from, to)
    }

    const { data, error, count } = (await (query as unknown as PromiseLike<{
      data: LeadContact[] | null
      error: { message: string } | null
      count: number | null
    }>)) as {
      data: LeadContact[] | null
      error: { message: string } | null
      count: number | null
    }

    if (error) {
      return portalJson({ error: 'fetch_failed', detail: error.message }, { status: 400 })
    }
    return portalJsonCached({
      leads: data ?? [],
      total: count ?? 0,
      page,
      pageSize: exportLimit ?? pageSize,
      filters
    })
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'fetch_failed' }, { status: 500 })
  }
}
