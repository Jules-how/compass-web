import { type NextRequest } from 'next/server'

import {
  parseDeliveryListQuery,
  projectCustomerProject
} from '@/lib/portal-contracts'
import { requirePortalAccess } from '@/lib/portal-access'
import { portalAccessResponse, portalJson } from '@/lib/portal-http'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { cursor, limit } = parseDeliveryListQuery(new URL(request.url).searchParams)
    const { supabase } = await requirePortalAccess({ delivery: true })
    let query = supabase
      .from('delivery_projects')
      .select('id,name,customer_summary,status,version,updated_at')
      .order('id', { ascending: true })
      .limit(limit + 1)
    if (cursor) query = query.gt('id', cursor)

    const { data, error } = await query
    if (error) return portalJson({ error: 'fetch_failed' }, { status: 500 })
    const rows = (data ?? []) as Record<string, unknown>[]
    const hasMore = rows.length > limit
    const page = rows.slice(0, limit).map(projectCustomerProject)
    return portalJson({
      projects: page,
      nextCursor: hasMore ? page.at(-1)?.id ?? null : null
    })
  } catch (error) {
    const accessResponse = portalAccessResponse(error)
    if (accessResponse) return accessResponse
    return portalJson({ error: 'invalid_request' }, { status: 400 })
  }
}
