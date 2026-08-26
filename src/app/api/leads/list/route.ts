import type { NextRequest } from 'next/server'
import type { LeadListFilters } from '@/lib/types'
import { portalJson } from '@/lib/portal-http'
import { LEAD_PAGE_SIZE } from '@/lib/list-columns'
import { parseLeadListFilters } from '@/lib/leads-query'
import { searchLeadContacts } from '@/lib/lead-search'
import { getPortalAdminClient } from '@/lib/portal-admin'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const filters: LeadListFilters = parseLeadListFilters(searchParams)
  if (!filters.bucket) filters.bucket = 'leads'
  const pageParam = Number(searchParams.get('page') ?? '1')
  const page = Number.isFinite(pageParam) && pageParam > 0 ? Math.floor(pageParam) : 1
  const pageSizeParam = Number(searchParams.get('pageSize') ?? String(LEAD_PAGE_SIZE))
  const pageSize = Number.isFinite(pageSizeParam)
    ? Math.min(Math.max(Math.floor(pageSizeParam), 1), 100)
    : LEAD_PAGE_SIZE

  const limitParam = searchParams.get('limit')
  const exportLimit = limitParam
    ? Math.min(Math.max(Number(limitParam) || 100, 1), 5000)
    : null

  try {
    const admin = getPortalAdminClient()
    const result = await searchLeadContacts(admin, filters, {
      mode: 'ui',
      page: exportLimit ? 1 : page,
      pageSize: exportLimit ?? pageSize
    })

    return portalJson({
      leads: result.leads,
      total: result.total,
      page: exportLimit ? 1 : page,
      pageSize: exportLimit ?? pageSize,
      filters
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'fetch_failed'
    return portalJson({ error: 'fetch_failed', detail: message }, { status: 500 })
  }
}
